//! Mission pacing and small shared helpers for the simulator.

use std::time::Duration;

use chrono::{DateTime, Utc};
use vantage_dataset::prelude::{ReadableDataSet, WritableDataSet};
use vantage_sql::sqlite::SqliteDB;

use crate::model::LaunchStatus;

/// How the mission script spends time between edits.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Pace {
    /// API / demo: actually sleep the gap so the UI live-refresh can be watched.
    RealTime,
    /// Tests: skip every gap and run the whole script instantly.
    NoDelay,
}

impl Pace {
    /// Wait `d` — a real sleep under `RealTime`, a no-op under `NoDelay`.
    pub async fn gap(&self, d: Duration) {
        if *self == Pace::RealTime {
            tokio::time::sleep(d).await;
        }
    }
}

/// `Duration` of `n` seconds — keeps the mission script terse.
pub fn secs(n: u64) -> Duration {
    Duration::from_secs(n)
}

/// LL2 `last_updated` format, e.g. `2026-06-21T12:00:00Z`.
pub fn ll2_now(t: DateTime<Utc>) -> String {
    t.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// LL2 launch statuses the simulator moves launches through: (id, name, abbrev).
const STATUSES: &[(&str, &str, &str)] = &[
    ("1", "Go for Launch", "Go"),
    ("2", "To Be Determined", "TBD"),
    ("3", "Launch Successful", "Success"),
    ("8", "To Be Confirmed", "TBC"),
];

/// Ensure the statuses the simulator sets exist as rows (for the UI join),
/// writing only missing ids so seeded rows keep their real descriptions.
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
