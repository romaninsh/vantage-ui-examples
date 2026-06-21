//! Plan-then-play simulation engine. Phases purely PLAN events (an offset + a
//! boxed DB mutation); the runner sorts and applies them, sleeping the gaps in
//! real time or applying instantly with no delays. All writes go through the
//! vantage `Table` interface. Given a fixed `(seed, base)` the final DB state is
//! identical regardless of pace.

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use chrono::{DateTime, Utc};
use rand::SeedableRng;
use rand::rngs::StdRng;
use vantage_dataset::prelude::{ReadableDataSet, WritableDataSet};
use vantage_sql::sqlite::SqliteDB;

use crate::model::{Launch, LaunchStatus};

/// A boxed async DB mutation, built at plan time and executed by the runner.
pub type Action = Box<dyn FnOnce(SqliteDB) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send>> + Send>;

/// One scheduled mutation. `at` is the intended real-time offset from trigger.
pub struct TimedEvent {
    pub at: Duration,
    pub label: String,
    pub action: Action,
}

/// Everything a phase needs to plan. Resolved once at trigger time.
#[derive(Clone, Debug)]
pub struct MissionContext {
    pub launch_id: String,
    pub lsp_id: String,
    pub pad_id: String,
    pub rocket_configuration_id: Option<String>,
    pub name: Option<String>,
    /// Mission T-0 / trigger instant. All timestamps derive from this so runs
    /// are reproducible (never wall-clock-at-apply).
    pub base: DateTime<Utc>,
}

/// A pluggable simulation step. Adding docking/lunar later = one more impl.
pub trait Phase: Send + Sync {
    fn name(&self) -> &str;
    /// PURE: builds the event list. Never touches the DB and never sleeps.
    fn plan(&self, ctx: &MissionContext, rng: &mut StdRng) -> Vec<TimedEvent>;
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Pace {
    /// API / demo: sleep the gap between events.
    RealTime,
    /// Unit tests: apply every event back-to-back.
    NoDelay,
}

/// LL2 `last_updated` format, e.g. `2026-06-21T12:00:00Z`.
pub fn ll2_now(t: DateTime<Utc>) -> String {
    t.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Deterministic launch id for a given seed.
pub fn new_launch_id(seed: u64) -> String {
    format!("sim-{seed:016x}")
}

/// Plan every phase (seeded), then apply the merged, time-sorted timeline.
pub async fn run_mission(
    db: SqliteDB,
    ctx: MissionContext,
    seed: u64,
    phases: Vec<Box<dyn Phase>>,
    pace: Pace,
) -> anyhow::Result<()> {
    ensure_statuses(&db).await?;

    let mut rng = StdRng::seed_from_u64(seed);
    let mut events: Vec<TimedEvent> = Vec::new();
    for phase in &phases {
        events.extend(phase.plan(&ctx, &mut rng));
    }
    events.sort_by_key(|e| e.at);

    let mut clock = Duration::ZERO;
    for ev in events {
        if pace == Pace::RealTime {
            let gap = ev.at.saturating_sub(clock);
            if !gap.is_zero() {
                tokio::time::sleep(gap).await;
            }
        }
        (ev.action)(db.clone()).await?;
        clock = ev.at;
    }
    Ok(())
}

/// Load a launch, mutate it, stamp `last_updated` from `stamp`, write it back.
/// A no-op if the launch vanished.
pub async fn touch<F>(db: &SqliteDB, id: &str, mutate: F, stamp: DateTime<Utc>) -> anyhow::Result<()>
where
    F: FnOnce(&mut Launch),
{
    let table = Launch::table(db.clone());
    let Some(mut launch) = table.get(id.to_string()).await? else {
        return Ok(());
    };
    mutate(&mut launch);
    launch.last_updated = Some(ll2_now(stamp));
    table.replace(id.to_string(), &launch).await?;
    Ok(())
}

/// LL2 launch statuses the engine moves launches through: (id, name, abbrev).
const STATUSES: &[(&str, &str, &str)] = &[
    ("1", "Go for Launch", "Go"),
    ("2", "To Be Determined", "TBD"),
    ("8", "To Be Confirmed", "TBC"),
];

/// Ensure the statuses the engine sets exist as rows (for the UI join), writing
/// only missing ids so seeded rows keep their real descriptions.
pub async fn ensure_statuses(db: &SqliteDB) -> anyhow::Result<()> {
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
