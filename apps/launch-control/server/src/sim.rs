//! Launch-replay simulator (Phase 4).
//!
//! On `serve` boot a background tokio task picks launches and steps each one
//! through a **condensed** LL2 status timeline in real time — `To Be Confirmed`
//! → `Go for Launch` → `Launch in Flight` → a randomized outcome (`Launch
//! Successful` / `Partial Failure` / `Launch Failure`) — bumping `last_updated`
//! at every step and flipping the launch's landing rows on the outcome. That
//! `last_updated` change is the UI's refresh trigger.
//!
//! Writes go through the **Vantage `Table` write path directly** (`ReadableDataSet`
//! + `WritableDataSet`), not the Vista facade — the read API is served over
//! Vista, the simulator mutates the store underneath it.

use std::time::Duration;

use vantage_dataset::prelude::{ReadableDataSet, WritableDataSet};
use vantage_sql::prelude::SqliteOperation;
use vantage_sql::sqlite::SqliteDB;

use crate::model::{Landing, Launch, LaunchStatus};

/// One LL2 launch status: (id, name, abbrev).
const STATUSES: &[(&str, &str, &str)] = &[
    ("1", "Go for Launch", "Go"),
    ("2", "To Be Determined", "TBD"),
    ("3", "Launch Successful", "Success"),
    ("4", "Launch Failure", "Failure"),
    ("5", "On Hold", "Hold"),
    ("6", "Launch in Flight", "In Flight"),
    ("7", "Launch was a Partial Failure", "Partial Failure"),
    ("8", "To Be Confirmed", "TBC"),
];

/// Current UTC instant in LL2's `last_updated` format (`2026-06-14T09:02:52Z`).
fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Drive the replay loop forever. Spawned with `tokio::spawn` from `serve`.
pub async fn run(db: SqliteDB, step: Duration) {
    if let Err(e) = ensure_statuses(&db).await {
        eprintln!("sim: could not seed launch statuses: {e}");
    }

    let ids = match candidate_ids(&db).await {
        Ok(ids) if !ids.is_empty() => ids,
        Ok(_) => {
            eprintln!("sim: no launches to replay");
            return;
        }
        Err(e) => {
            eprintln!("sim: could not list launches: {e}");
            return;
        }
    };

    println!(
        "sim: replaying {} launch(es), ~{}s per step",
        ids.len(),
        step.as_secs()
    );

    loop {
        for id in &ids {
            if let Err(e) = replay(&db, id, step).await {
                eprintln!("sim: replay of {id} failed: {e}");
            }
        }
    }
}

/// Step one launch through the condensed timeline. The outcome is rolled once,
/// up front, so no RNG is held across an `.await`.
async fn replay(db: &SqliteDB, id: &str, step: Duration) -> anyhow::Result<()> {
    let (final_status, landed_ok, label) = roll_outcome();

    let name = launch_name(db, id).await?;
    println!("sim: ► {name}  ({id})");

    // T-0 approaches: confirmed go, webcast live.
    touch_launch(db, id, |l| {
        l.status_id = Some("1".into());
        l.webcast_live = Some(true);
        l.probability = Some(95);
    })
    .await?;
    println!("sim:   Go for Launch");
    tokio::time::sleep(step).await;

    // Final hold — data keeps updating without a status change.
    touch_launch(db, id, |l| l.probability = Some(100)).await?;
    tokio::time::sleep(step / 2).await;

    // Liftoff.
    touch_launch(db, id, |l| {
        l.status_id = Some("6".into());
        l.webcast_live = Some(true);
    })
    .await?;
    println!("sim:   Liftoff — In Flight");
    tokio::time::sleep(step).await;

    // Outcome.
    touch_launch(db, id, |l| {
        l.status_id = Some(final_status.into());
        l.webcast_live = Some(false);
        l.failreason = if landed_ok {
            Some(String::new())
        } else {
            Some(format!("{label}: anomaly during ascent"))
        };
    })
    .await?;
    let landings = resolve_landings(db, id, landed_ok).await?;
    println!("sim:   {label}  ({landings} landing(s) resolved)");
    tokio::time::sleep(step).await;

    Ok(())
}

/// Roll a randomized but realistic outcome: mostly success.
/// Returns `(status_id, landing_succeeded, label)`.
fn roll_outcome() -> (&'static str, bool, &'static str) {
    use rand::Rng;
    let roll: f64 = rand::thread_rng().r#gen();
    if roll < 0.82 {
        ("3", true, "Launch Successful")
    } else if roll < 0.92 {
        ("7", false, "Partial Failure")
    } else {
        ("4", false, "Launch Failure")
    }
}

/// Load a launch, mutate it, stamp `last_updated`, and write the whole row back
/// via `replace` (a no-op if the launch vanished).
async fn touch_launch<F>(db: &SqliteDB, id: &str, mutate: F) -> anyhow::Result<()>
where
    F: FnOnce(&mut Launch),
{
    let table = Launch::table(db.clone());
    let Some(mut launch) = table.get(id.to_string()).await? else {
        return Ok(());
    };
    mutate(&mut launch);
    launch.last_updated = Some(now());
    table.replace(id.to_string(), &launch).await?;
    Ok(())
}

/// Flip this launch's landing rows to a resolved attempt and stamp them.
async fn resolve_landings(db: &SqliteDB, launch_id: &str, success: bool) -> anyhow::Result<usize> {
    let table = Landing::table(db.clone());
    let cond = table["launch_id"].eq(launch_id);
    let table = table.with_condition(cond);

    let landings = table.list().await?;
    let count = landings.len();
    for (lid, mut landing) in landings {
        landing.attempt = Some(true);
        landing.success = Some(success);
        landing.last_updated = Some(now());
        Landing::table(db.clone()).replace(lid, &landing).await?;
    }
    Ok(count)
}

async fn launch_name(db: &SqliteDB, id: &str) -> anyhow::Result<String> {
    Ok(Launch::table(db.clone())
        .get(id.to_string())
        .await?
        .map(|l| l.name)
        .unwrap_or_else(|| id.to_string()))
}

/// Launches still awaiting flight (pending statuses) are the replay queue; if
/// none are pending (e.g. after a full loop), fall back to every launch.
async fn candidate_ids(db: &SqliteDB) -> anyhow::Result<Vec<String>> {
    let table = Launch::table(db.clone());
    let cond = table["status_id"].in_list(&["1", "2", "5", "8"]);
    let pending = table.with_condition(cond).list().await?;
    if !pending.is_empty() {
        return Ok(pending.keys().cloned().collect());
    }
    let all = Launch::table(db.clone()).list().await?;
    Ok(all.keys().cloned().collect())
}

/// Ensure the full LL2 status lookup set exists so the simulator can move
/// launches into In-Flight / Failure states even if the seed only contained a
/// few. Only *missing* ids are written, leaving seeded rows (with their real
/// descriptions) untouched.
async fn ensure_statuses(db: &SqliteDB) -> anyhow::Result<()> {
    let table = LaunchStatus::table(db.clone());
    let existing = table.list().await?;
    for (id, name, abbrev) in STATUSES {
        if existing.contains_key(*id) {
            continue;
        }
        let status = LaunchStatus {
            name: (*name).to_string(),
            abbrev: (*abbrev).to_string(),
            description: String::new(),
        };
        table.replace(id.to_string(), &status).await?;
    }
    Ok(())
}
