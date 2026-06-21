# On-demand Launch Simulation — P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the launch-control sim thread dormant and add a `POST /sim/launches` endpoint that instantly creates a launch and runs a seed-deterministic, pluggable, real-time mission simulation in the background — shipping one trivial countdown phase and a launches-page UI action.

**Architecture:** A new `sim/` module in the `launch-control-server` crate built on a *plan-then-play* engine: each `Phase` purely plans a list of `TimedEvent`s (a nominal offset + a boxed async DB mutation via the vantage `Table` interface); a `run_mission` runner concatenates, sorts, and applies them — sleeping the gaps in `RealTime` (HTTP/demo) or applying instantly in `NoDelay` (unit tests). Because planning is pure and seeded over a fixed `base` time, the final DB state is identical for a given `(seed, base)`.

**Tech Stack:** Rust (edition 2024), axum 0.8, vantage-{table,dataset,sql,vista} 0.6, rand 0.8 (`StdRng`), chrono, tokio. Dev: tempfile, tower (`util`).

## Global Constraints

- All record creation/mutation goes through the vantage `Table` interface (`ReadableDataSet`/`WritableDataSet`: `get`, `insert(id, &e)`, `replace(id, &e)`, `delete(id)`), never raw SQL.
- The HTTP API is **real-time only** — it exposes no seed/speed/pace parameters. Seed + `NoDelay` are engine-level, exercised only by Rust tests, never over HTTP.
- At most one mission runs per launch; the engine needs no per-row locking.
- Real-time update resolution is ~1 s minimum between events.
- IDs and FKs are `TEXT`. A simulated launch's id is `new_launch_id(seed) = format!("sim-{seed:016x}")` so a fixed seed yields a fixed id.
- LL2 status ids used here: `"2"` = To Be Determined (unscheduled), `"8"` = To Be Confirmed, `"1"` = Go for Launch.
- Crate path: `apps/launch-control/server` (package `launch-control-server`). Run cargo from repo root `vantage-ui-examples/` with `-p launch-control-server`.
- Commit messages: no `Co-Authored-By` / "Generated with" trailers.

---

### Task 1: Make the server dormant (remove auto-sim, flags, old replay)

Strip the always-on simulator: the old `sim.rs` auto-replay loop, its `serve` flags (`--no-sim`, `--sim-step`), and the boot-time `tokio::spawn`. The server should only serve; missions will exist only once triggered (Task 4). Update the BDD harness, which passes the now-removed `--no-sim`.

**Files:**
- Modify: `apps/launch-control/server/src/main.rs`
- Delete: `apps/launch-control/server/src/sim.rs`
- Modify: `test-framework/src/launch_control.rs` (drop `--no-sim` arg + doc text)

**Interfaces:**
- Consumes: nothing.
- Produces: a `serve` subcommand with fields `{ port, error_rate, latency_min, latency_max }` only (no `sim_step`, no `no_sim`). The crate compiles with no `sim` module.

- [ ] **Step 1: Delete the old simulator file**

```bash
git rm apps/launch-control/server/src/sim.rs
```

- [ ] **Step 2: Remove the module declaration and the boot-time spawn in `main.rs`**

In `apps/launch-control/server/src/main.rs`, delete the line `mod sim;` (in the `mod` block near the top).

Then in the `Serve { .. }` match arm, delete this block entirely:

```rust
            if !no_sim {
                let sim_db = database.clone();
                tokio::spawn(sim::run(
                    sim_db,
                    std::time::Duration::from_secs(sim_step),
                ));
            }
```

- [ ] **Step 3: Remove the `--no-sim` and `--sim-step` flags from the `Serve` variant**

In the `enum Cmd`, replace the `Serve { .. }` variant with (drop `sim_step` and `no_sim`):

```rust
    /// Serve the deliberately-flaky LL2-compatible REST API.
    Serve {
        #[arg(long, default_value_t = 8080)]
        port: u16,
        /// Probability (0..1) a request is answered with 503.
        #[arg(long, default_value_t = 0.10)]
        error_rate: f64,
        #[arg(long, default_value_t = 150)]
        latency_min: u64,
        #[arg(long, default_value_t = 1200)]
        latency_max: u64,
    },
```

- [ ] **Step 4: Update the `Serve` match arm destructure + the startup log**

In `main()`, change the `Cmd::Serve { .. }` arm header to drop the removed fields, and simplify the "sim=" log line:

```rust
        Cmd::Serve {
            port,
            error_rate,
            latency_min,
            latency_max,
        } => {
            let state = rest::AppState {
                db: database.clone(),
                flaky: flaky::FlakyConfig {
                    error_rate,
                    latency_min_ms: latency_min,
                    latency_max_ms: latency_max,
                },
            };
            let app = rest::router(state);
            let addr = format!("0.0.0.0:{port}");
            let listener = tokio::net::TcpListener::bind(&addr).await?;
            println!(
                "launch-control serving on http://127.0.0.1:{port}  \
                 (error_rate={error_rate}, latency={latency_min}-{latency_max}ms)"
            );
            axum::serve(listener, app).await?;
        }
```

- [ ] **Step 5: Build to verify the crate compiles without the sim module**

Run: `cargo build -p launch-control-server`
Expected: PASS (no `unresolved module sim` / `cannot find value no_sim` errors).

- [ ] **Step 6: Confirm the flags are gone**

Run: `cargo run -q -p launch-control-server -- serve --help`
Expected: help text lists `--port`, `--error-rate`, `--latency-min`, `--latency-max` and does NOT list `--no-sim` or `--sim-step`.

- [ ] **Step 7: Drop `--no-sim` from the BDD harness**

In `test-framework/src/launch_control.rs`, find the `serve` args array (the `.args([ "serve", "--no-sim", "--error-rate", ... ])` call) and remove the `"--no-sim",` element so it reads:

```rust
        .args([
            "serve",
            "--error-rate",
            "0",
            "--port",
            "8080",
        ])
```

Also update the module doc comment near the top: change the phrase `(--no-sim --error-rate 0)` to `(--error-rate 0)` and the `no-sim, error-rate 0` log string to `error-rate 0`.

- [ ] **Step 8: Build the harness**

Run: `cargo build -p test-framework`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/launch-control/server/src/main.rs test-framework/src/launch_control.rs
git rm -q apps/launch-control/server/src/sim.rs 2>/dev/null; true
git commit -m "launch-control: make the simulator dormant (remove auto-replay + serve sim flags)"
```

---

### Task 2: The simulation engine + countdown phase

Add the `sim/` module: the engine types, the `run_mission` runner, the `touch`/`ensure_statuses`/`ll2_now`/`new_launch_id` helpers, and a trivial `CountdownPhase`. A DB-backed unit test drives a launch through the countdown in `NoDelay` and asserts the deterministic outcome.

**Files:**
- Create: `apps/launch-control/server/src/sim/mod.rs`
- Create: `apps/launch-control/server/src/sim/engine.rs`
- Create: `apps/launch-control/server/src/sim/countdown.rs`
- Create: `apps/launch-control/server/src/sim/testutil.rs`
- Modify: `apps/launch-control/server/src/main.rs` (re-add `mod sim;`)
- Modify: `apps/launch-control/server/Cargo.toml` (add `tempfile` dev-dep)

**Interfaces:**
- Consumes: `crate::db::{connect, create_schema}`, `crate::model::{Launch, LaunchStatus}`.
- Produces:
  - `MissionContext { launch_id: String, lsp_id: String, pad_id: String, rocket_configuration_id: Option<String>, name: Option<String>, base: chrono::DateTime<Utc> }` (derives `Clone`).
  - `type Action = Box<dyn FnOnce(SqliteDB) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send>> + Send>`
  - `struct TimedEvent { at: Duration, label: String, action: Action }`
  - `trait Phase: Send + Sync { fn name(&self) -> &str; fn plan(&self, ctx: &MissionContext, rng: &mut StdRng) -> Vec<TimedEvent>; }`
  - `enum Pace { RealTime, NoDelay }`
  - `async fn run_mission(db: SqliteDB, ctx: MissionContext, seed: u64, phases: Vec<Box<dyn Phase>>, pace: Pace) -> anyhow::Result<()>`
  - `fn new_launch_id(seed: u64) -> String`, `fn ll2_now(t: DateTime<Utc>) -> String`
  - `struct CountdownPhase` implementing `Phase`.
  - `#[cfg(test)] testutil::temp_db()`.

- [ ] **Step 1: Add the `tempfile` dev-dependency**

In `apps/launch-control/server/Cargo.toml`, add a `[dev-dependencies]` section at the end:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: Re-add the module declaration**

In `apps/launch-control/server/src/main.rs`, add `mod sim;` back into the `mod` block (alphabetically, after `mod seed;`). (Dead-code warnings until Task 4 wires it in are expected.)

- [ ] **Step 3: Write the engine core**

Create `apps/launch-control/server/src/sim/engine.rs`:

```rust
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
#[derive(Clone)]
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
```

- [ ] **Step 4: Write the countdown phase**

Create `apps/launch-control/server/src/sim/countdown.rs`:

```rust
//! P1's trivial phase: ticks a freshly-created launch through a 60-second
//! countdown so the engine and the UI live-refresh can be observed end-to-end.
//! P2 replaces this with the real human-churn population.

use std::time::Duration;

use chrono::Duration as ChronoDuration;
use rand::rngs::StdRng;

use super::engine::{MissionContext, Phase, TimedEvent, ll2_now, touch};

pub struct CountdownPhase;

impl Phase for CountdownPhase {
    fn name(&self) -> &str {
        "countdown"
    }

    fn plan(&self, ctx: &MissionContext, _rng: &mut StdRng) -> Vec<TimedEvent> {
        let base = ctx.base;
        let id = ctx.launch_id.clone();
        let mut events = Vec::new();

        // T-1min: schedule the launch and confirm it.
        {
            let id = id.clone();
            events.push(TimedEvent {
                at: Duration::ZERO,
                label: "T-1min".into(),
                action: Box::new(move |db| {
                    Box::pin(async move {
                        let net = ll2_now(base + ChronoDuration::seconds(60));
                        touch(
                            &db,
                            &id,
                            |l| {
                                l.net = Some(net);
                                l.status_id = Some("8".into());
                            },
                            base,
                        )
                        .await
                    })
                }),
            });
        }

        // T-30s: a mid-countdown update (proves timed playback / live refresh).
        {
            let id = id.clone();
            let stamp = base + ChronoDuration::seconds(30);
            events.push(TimedEvent {
                at: Duration::from_secs(30),
                label: "T-30s".into(),
                action: Box::new(move |db| {
                    Box::pin(async move { touch(&db, &id, |l| l.probability = Some(95), stamp).await })
                }),
            });
        }

        // T-0: go for launch.
        {
            let id = id.clone();
            let stamp = base + ChronoDuration::seconds(60);
            events.push(TimedEvent {
                at: Duration::from_secs(60),
                label: "Go for Launch".into(),
                action: Box::new(move |db| {
                    Box::pin(async move {
                        touch(&db, &id, |l| l.status_id = Some("1".into()), stamp).await
                    })
                }),
            });
        }

        events
    }
}
```

- [ ] **Step 5: Write the test-only DB helper**

Create `apps/launch-control/server/src/sim/testutil.rs`:

```rust
//! Test-only: a throwaway file-backed SQLite database with the schema applied.
#![cfg(test)]

use tempfile::TempPath;
use vantage_sql::sqlite::SqliteDB;

/// A temp DB whose backing file is deleted when this drops. `db` is declared
/// first so its pool closes before the file is removed.
pub struct TempDb {
    pub db: SqliteDB,
    _path: TempPath,
}

pub async fn temp_db() -> TempDb {
    let path = tempfile::NamedTempFile::new().unwrap().into_temp_path();
    let db = crate::db::connect(path.to_str().unwrap()).await.unwrap();
    crate::db::create_schema(&db).await.unwrap();
    TempDb { db, _path: path }
}
```

- [ ] **Step 6: Write the module root with the failing test**

Create `apps/launch-control/server/src/sim/mod.rs`:

```rust
//! On-demand mission simulation: a plan-then-play engine (`engine`), the phases
//! that drive a launch (`countdown`, …), and the trigger that creates a launch
//! and starts a mission (`trigger`).

pub mod countdown;
pub mod engine;

#[cfg(test)]
mod testutil;

pub use countdown::CountdownPhase;
pub use engine::{MissionContext, Pace, Phase, TimedEvent, new_launch_id, run_mission};

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Utc};
    use vantage_dataset::prelude::{ReadableDataSet, WritableDataSet};

    use super::testutil::temp_db;
    use super::{CountdownPhase, MissionContext, Pace, Phase, run_mission};
    use crate::model::Launch;

    fn fixed_base() -> DateTime<Utc> {
        "2026-06-21T12:00:00Z".parse().unwrap()
    }

    async fn run_countdown(seed: u64) -> Launch {
        let h = temp_db().await;
        // A bare launch row for the countdown to drive.
        let launch = Launch {
            name: "Test Mission".into(),
            status_id: Some("2".into()),
            ..Default::default()
        };
        let id = super::new_launch_id(seed);
        Launch::table(h.db.clone())
            .insert(id.clone(), &launch)
            .await
            .unwrap();

        let ctx = MissionContext {
            launch_id: id.clone(),
            lsp_id: "121".into(),
            pad_id: "p1".into(),
            rocket_configuration_id: None,
            name: Some("Test Mission".into()),
            base: fixed_base(),
        };
        let phases: Vec<Box<dyn Phase>> = vec![Box::new(CountdownPhase)];
        run_mission(h.db.clone(), ctx, seed, phases, Pace::NoDelay)
            .await
            .unwrap();

        Launch::table(h.db.clone())
            .get(id)
            .await
            .unwrap()
            .expect("launch still present")
    }

    #[tokio::test]
    async fn countdown_reaches_go_for_launch_at_t0() {
        let l = run_countdown(7).await;
        assert_eq!(l.status_id.as_deref(), Some("1")); // Go for Launch
        assert_eq!(l.net.as_deref(), Some("2026-06-21T12:01:00Z")); // base + 60s
        assert_eq!(l.probability, Some(95));
    }

    #[tokio::test]
    async fn same_seed_and_base_are_deterministic() {
        let a = run_countdown(42).await;
        let b = run_countdown(42).await;
        assert_eq!(a, b);
    }
}
```

- [ ] **Step 7: Run the tests to verify they fail before the module compiles cleanly**

Run: `cargo test -p launch-control-server sim::tests`
Expected: this is the first compile of the module; if anything is mistyped it fails here. Fix until it compiles. Once compiling, both tests should already PASS (the implementation in Steps 3–4 is complete) — that is the intended green.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cargo test -p launch-control-server sim::`
Expected: PASS — `countdown_reaches_go_for_launch_at_t0` and `same_seed_and_base_are_deterministic` both green.

- [ ] **Step 9: Commit**

```bash
git add apps/launch-control/server/src/sim apps/launch-control/server/src/main.rs apps/launch-control/server/Cargo.toml
git commit -m "launch-control: add plan-then-play sim engine + countdown phase"
```

---

### Task 3: Trigger — validate inputs and create the launch

Add `sim/trigger.rs`: the request shape, cross-field validation (ids exist; `rocket_configuration_id.manufacturer_id == lsp_id`), the instant insert of an unscheduled launch, and `mission_phases()`. Unit-tested directly (no HTTP).

**Files:**
- Create: `apps/launch-control/server/src/sim/trigger.rs`
- Modify: `apps/launch-control/server/src/sim/mod.rs` (add `pub mod trigger;` + re-exports)

**Interfaces:**
- Consumes: `engine::{MissionContext, new_launch_id, ll2_now}`, `countdown::CountdownPhase`, `crate::model::{Agency, Pad, LauncherConfiguration, Launch}`.
- Produces:
  - `#[derive(Deserialize)] struct CreateLaunch { lsp_id: String, pad_id: String, rocket_configuration_id: Option<String>, name: Option<String> }`
  - `enum TriggerError { BadRequest(String), Internal(anyhow::Error) }`
  - `struct Created { ctx: MissionContext, seed: u64 }`
  - `async fn create_launch(db: &SqliteDB, input: CreateLaunch, seed: u64, base: DateTime<Utc>) -> Result<Created, TriggerError>`
  - `fn mission_phases() -> Vec<Box<dyn Phase>>`

- [ ] **Step 1: Write the failing tests**

Add `apps/launch-control/server/src/sim/trigger.rs` with the test module first (the impl in Step 3 completes it):

```rust
//! The trigger: validate a create request, insert an unscheduled launch via the
//! Table interface, and describe the phase pipeline a mission runs.

use chrono::DateTime;
use chrono::Utc;
use serde::Deserialize;
use vantage_dataset::prelude::{ReadableDataSet, WritableDataSet};
use vantage_sql::sqlite::SqliteDB;

use super::engine::{MissionContext, Phase, ll2_now, new_launch_id};
use super::countdown::CountdownPhase;
use crate::model::{Agency, Launch, LauncherConfiguration, Pad};

/// The POST /sim/launches body. All engine knobs are deliberately absent.
#[derive(Debug, Deserialize)]
pub struct CreateLaunch {
    pub lsp_id: String,
    pub pad_id: String,
    pub rocket_configuration_id: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug)]
pub enum TriggerError {
    /// A validation failure → HTTP 400.
    BadRequest(String),
    /// An unexpected DB/internal error → HTTP 500.
    Internal(anyhow::Error),
}

pub struct Created {
    pub ctx: MissionContext,
    pub seed: u64,
}

/// The phases every mission runs, in order. P2/P3 append to this.
pub fn mission_phases() -> Vec<Box<dyn Phase>> {
    vec![Box::new(CountdownPhase)]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::testutil::temp_db;

    async fn seed_refs(db: &SqliteDB) {
        // Two agencies, a pad, and one config belonging to agency "121".
        Agency::table(db.clone())
            .insert("121".to_string(), &Agency { name: "SpaceX".into(), ..Default::default() })
            .await
            .unwrap();
        Agency::table(db.clone())
            .insert("999".to_string(), &Agency { name: "Rocket Lab".into(), ..Default::default() })
            .await
            .unwrap();
        Pad::table(db.clone())
            .insert("p1".to_string(), &Pad { name: "LC-39A".into(), ..Default::default() })
            .await
            .unwrap();
        LauncherConfiguration::table(db.clone())
            .insert(
                "c1".to_string(),
                &LauncherConfiguration {
                    name: "Falcon 9".into(),
                    manufacturer_id: Some("121".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
    }

    fn base() -> DateTime<Utc> {
        "2026-06-21T12:00:00Z".parse().unwrap()
    }

    #[tokio::test]
    async fn creates_unscheduled_launch_with_valid_refs() {
        let h = temp_db().await;
        seed_refs(&h.db).await;
        let input = CreateLaunch {
            lsp_id: "121".into(),
            pad_id: "p1".into(),
            rocket_configuration_id: Some("c1".into()),
            name: Some("Demo-1".into()),
        };
        let created = create_launch(&h.db, input, 5, base()).await.unwrap();

        let row = Launch::table(h.db.clone())
            .get(created.ctx.launch_id.clone())
            .await
            .unwrap()
            .expect("inserted");
        assert_eq!(created.ctx.launch_id, new_launch_id(5));
        assert_eq!(row.status_id.as_deref(), Some("2")); // To Be Determined
        assert_eq!(row.net, None); // unscheduled
        assert_eq!(row.lsp_id.as_deref(), Some("121"));
        assert_eq!(row.pad_id.as_deref(), Some("p1"));
        assert_eq!(row.name, "Demo-1");
    }

    #[tokio::test]
    async fn rejects_unknown_agency() {
        let h = temp_db().await;
        seed_refs(&h.db).await;
        let input = CreateLaunch {
            lsp_id: "nope".into(),
            pad_id: "p1".into(),
            rocket_configuration_id: None,
            name: None,
        };
        let err = create_launch(&h.db, input, 5, base()).await.unwrap_err();
        assert!(matches!(err, TriggerError::BadRequest(_)));
    }

    #[tokio::test]
    async fn rejects_config_not_belonging_to_agency() {
        let h = temp_db().await;
        seed_refs(&h.db).await;
        // config c1 is manufactured by 121, but we select agency 999.
        let input = CreateLaunch {
            lsp_id: "999".into(),
            pad_id: "p1".into(),
            rocket_configuration_id: Some("c1".into()),
            name: None,
        };
        let err = create_launch(&h.db, input, 5, base()).await.unwrap_err();
        match err {
            TriggerError::BadRequest(m) => assert!(m.contains("does not belong")),
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test -p launch-control-server sim::trigger`
Expected: FAIL to compile with "cannot find function `create_launch`".

- [ ] **Step 3: Implement `create_launch`**

In `apps/launch-control/server/src/sim/trigger.rs`, insert this between `mission_phases()` and the `#[cfg(test)] mod tests` block:

```rust
/// Validate the request, insert an unscheduled launch, and build the context.
pub async fn create_launch(
    db: &SqliteDB,
    input: CreateLaunch,
    seed: u64,
    base: DateTime<Utc>,
) -> Result<Created, TriggerError> {
    // Agency must exist.
    let agency = Agency::table(db.clone())
        .get(input.lsp_id.clone())
        .await
        .map_err(internal)?;
    if agency.is_none() {
        return Err(bad(format!("unknown lsp_id `{}`", input.lsp_id)));
    }

    // Pad must exist.
    let pad = Pad::table(db.clone())
        .get(input.pad_id.clone())
        .await
        .map_err(internal)?;
    if pad.is_none() {
        return Err(bad(format!("unknown pad_id `{}`", input.pad_id)));
    }

    // If a configuration is given it must exist AND belong to the agency.
    if let Some(cfg_id) = &input.rocket_configuration_id {
        let cfg = LauncherConfiguration::table(db.clone())
            .get(cfg_id.clone())
            .await
            .map_err(internal)?;
        let Some(cfg) = cfg else {
            return Err(bad(format!("unknown rocket_configuration_id `{cfg_id}`")));
        };
        if cfg.manufacturer_id.as_deref() != Some(input.lsp_id.as_str()) {
            return Err(bad(format!(
                "rocket configuration `{cfg_id}` does not belong to agency `{}`",
                input.lsp_id
            )));
        }
    }

    // Insert the launch NOW: unscheduled (status TBD, no net), refs set.
    let launch_id = new_launch_id(seed);
    let launch = Launch {
        name: input.name.clone().unwrap_or_default(),
        status_id: Some("2".into()), // To Be Determined
        net: None,
        lsp_id: Some(input.lsp_id.clone()),
        rocket_configuration_id: input.rocket_configuration_id.clone(),
        pad_id: Some(input.pad_id.clone()),
        last_updated: Some(ll2_now(base)),
        ..Default::default()
    };
    Launch::table(db.clone())
        .insert(launch_id.clone(), &launch)
        .await
        .map_err(internal)?;

    let ctx = MissionContext {
        launch_id,
        lsp_id: input.lsp_id,
        pad_id: input.pad_id,
        rocket_configuration_id: input.rocket_configuration_id,
        name: input.name,
        base,
    };
    Ok(Created { ctx, seed })
}

fn bad(msg: String) -> TriggerError {
    TriggerError::BadRequest(msg)
}

fn internal<E: Into<anyhow::Error>>(e: E) -> TriggerError {
    TriggerError::Internal(e.into())
}
```

- [ ] **Step 4: Wire `trigger` into the module root**

In `apps/launch-control/server/src/sim/mod.rs`, add `pub mod trigger;` (after `pub mod engine;`) and extend the re-export line:

```rust
pub mod trigger;
```
```rust
pub use trigger::{CreateLaunch, Created, TriggerError, create_launch, mission_phases};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cargo test -p launch-control-server sim::trigger`
Expected: PASS — all three trigger tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/launch-control/server/src/sim/trigger.rs apps/launch-control/server/src/sim/mod.rs
git commit -m "launch-control: validate + create unscheduled launch (trigger)"
```

---

### Task 4: The `POST /sim/launches` endpoint

Wire the trigger into axum: a `create_sim_launch` handler that validates+creates synchronously, returns `201`, then spawns the real-time mission. Route it OUTSIDE the flaky middleware so the trigger is reliable. A oneshot test asserts `201`/`400`.

**Files:**
- Modify: `apps/launch-control/server/src/rest.rs`
- Modify: `apps/launch-control/server/Cargo.toml` (add `tower` dev-dep)

**Interfaces:**
- Consumes: `crate::sim::{create_launch, mission_phases, run_mission, Pace, CreateLaunch, TriggerError}`, `crate::sim` re-exports.
- Produces: `POST /sim/launches` → `201 { "id", "status": "unscheduled" }` | `400 { "detail" }`.

- [ ] **Step 1: Add the `tower` dev-dependency**

In `apps/launch-control/server/Cargo.toml`, extend `[dev-dependencies]`:

```toml
[dev-dependencies]
tempfile = "3"
tower = { version = "0.5", features = ["util"] }
```

- [ ] **Step 2: Write the failing endpoint test**

At the bottom of `apps/launch-control/server/src/rest.rs`, add:

```rust
#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt; // oneshot
    use vantage_dataset::prelude::WritableDataSet;

    use super::*;
    use crate::flaky::FlakyConfig;
    use crate::model::{Agency, LauncherConfiguration, Pad};

    async fn app() -> Router {
        let path = tempfile::NamedTempFile::new().unwrap().into_temp_path();
        let db = crate::db::connect(path.to_str().unwrap()).await.unwrap();
        crate::db::create_schema(&db).await.unwrap();
        // Keep the temp file for the test process lifetime.
        std::mem::forget(path);

        Agency::table(db.clone())
            .insert("121".to_string(), &Agency { name: "SpaceX".into(), ..Default::default() })
            .await
            .unwrap();
        Pad::table(db.clone())
            .insert("p1".to_string(), &Pad { name: "LC-39A".into(), ..Default::default() })
            .await
            .unwrap();
        LauncherConfiguration::table(db.clone())
            .insert(
                "c1".to_string(),
                &LauncherConfiguration {
                    name: "Falcon 9".into(),
                    manufacturer_id: Some("121".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        router(AppState {
            db,
            flaky: FlakyConfig { error_rate: 0.0, latency_min_ms: 0, latency_max_ms: 0 },
        })
    }

    fn post(body: &str) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri("/sim/launches")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    #[tokio::test]
    async fn valid_create_returns_201() {
        let app = app().await;
        let resp = app
            .oneshot(post(r#"{"lsp_id":"121","pad_id":"p1","rocket_configuration_id":"c1"}"#))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
    }

    #[tokio::test]
    async fn unknown_pad_returns_400() {
        let app = app().await;
        let resp = app
            .oneshot(post(r#"{"lsp_id":"121","pad_id":"nope"}"#))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cargo test -p launch-control-server rest::tests`
Expected: FAIL to compile — no `/sim/launches` route / `create_sim_launch` not defined.

- [ ] **Step 4: Add the handler and route**

In `apps/launch-control/server/src/rest.rs`:

(a) Extend the axum import to add `post` and `http::StatusCode` is already imported; add `routing::post`:

```rust
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
```

(b) Replace `pub fn router(state: AppState) -> Router { .. }` with a version that keeps the flaky layer on the read routes only and merges the trigger route un-flaked:

```rust
pub fn router(state: AppState) -> Router {
    // Read API: flaky (random latency + 503s) — the demo's whole point.
    let api = Router::new()
        .route("/{table}/", get(list))
        .route("/{table}", get(list))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::flaky::middleware,
        ));

    // Trigger: must be reliable, so it is NOT behind the flaky middleware.
    let sim = Router::new().route("/sim/launches", post(create_sim_launch));

    Router::new().merge(sim).merge(api).with_state(state)
}

/// Create a launch from the user's basics, return it, and start a real-time
/// background mission. Engine knobs (seed/pace) are internal — never from HTTP.
async fn create_sim_launch(
    State(state): State<AppState>,
    Json(input): Json<crate::sim::CreateLaunch>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let seed: u64 = rand::random();
    let base = chrono::Utc::now();

    let created = crate::sim::create_launch(&state.db, input, seed, base)
        .await
        .map_err(ApiError::from_trigger)?;

    let id = created.ctx.launch_id.clone();
    let db = state.db.clone();
    let ctx = created.ctx.clone();
    let seed = created.seed;
    tokio::spawn(async move {
        if let Err(e) =
            crate::sim::run_mission(db, ctx, seed, crate::sim::mission_phases(), crate::sim::Pace::RealTime)
                .await
        {
            eprintln!("sim: mission failed: {e:#}");
        }
    });

    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "status": "unscheduled" })),
    ))
}
```

(c) Add the `TriggerError` → `ApiError` mapping next to the existing `impl From<...> for ApiError`:

```rust
impl ApiError {
    fn from_trigger(e: crate::sim::TriggerError) -> Self {
        match e {
            crate::sim::TriggerError::BadRequest(m) => ApiError(StatusCode::BAD_REQUEST, m),
            crate::sim::TriggerError::Internal(err) => {
                ApiError(StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
            }
        }
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cargo test -p launch-control-server rest::tests`
Expected: PASS — `valid_create_returns_201` and `unknown_pad_returns_400` green.

- [ ] **Step 6: Run the whole crate's tests**

Run: `cargo test -p launch-control-server`
Expected: PASS — all `sim::` and `rest::` tests green.

- [ ] **Step 7: Manual smoke test (real-time)**

```bash
cargo run -q -p launch-control-server -- seed
cargo run -q -p launch-control-server -- serve --error-rate 0 &
SRV=$!
sleep 2
# Pick a real agency+pad+config from the seeded data if these ids differ:
curl -s -X POST localhost:8080/sim/launches \
  -H 'content-type: application/json' \
  -d '{"lsp_id":"121","pad_id":"p1","rocket_configuration_id":"c1","name":"Smoke-1"}'
echo
kill $SRV
```
Expected: a `201` JSON `{"id":"sim-...","status":"unscheduled"}` (or a `400` if those ids aren't in your seed — then re-run with ids from `... query agencies` / `query pads` / `query launcher_configurations`).

- [ ] **Step 8: Commit**

```bash
git add apps/launch-control/server/src/rest.rs apps/launch-control/server/Cargo.toml
git commit -m "launch-control: POST /sim/launches endpoint (real-time background mission)"
```

---

### Task 5: Launches-page UI action (form → http_request)

Author the inventory action files and the toolbar button so a user can trigger a simulated launch from the UI. The `rocket_configuration_id` dropdown is specified as **dependent** on `lsp_id`; making vantage-ui honor that dependency is a separate cross-repo effort (see Task 6) — the YAML here declares the intent and the server's `400` is the correctness backstop.

**Files:**
- Create: `apps/launch-control/inventory/action/new-launch.yaml`
- Create: `apps/launch-control/inventory/action/submit-launch.yaml`
- Modify: `apps/launch-control/inventory/page/launches.yaml` (add a toolbar action)

**Interfaces:**
- Consumes: the running server's `POST /sim/launches`.
- Produces: a `New simulated launch` toolbar button on the launches page.

- [ ] **Step 1: Verify the form-field choice + toolbar YAML shapes**

Read these references so the YAML matches the schema exactly:

Run: `sed -n '1,200p' apps/launch-control/inventory/.agents/skills/vantage-ui-builder/references/form-fields.md`
Run: `sed -n '1,200p' apps/launch-control/inventory/.agents/skills/vantage-ui-builder/references/toolbar-and-row-actions.md`
Run: `sed -n '1,60p' apps/launch-control/inventory/page/launches.yaml`

Expected: confirm (a) how a form field sources `choices` from a table, (b) how to express a choice dependent on another field (or that it is unsupported → record for Task 6), (c) the exact key for a page-level toolbar action and how it calls `actions.*`. Adjust the YAML in Steps 2–4 to the real keys if they differ from the templates below.

- [ ] **Step 2: Write the form action**

Create `apps/launch-control/inventory/action/new-launch.yaml`:

```yaml
# yaml-language-server: $schema=./action-schema-1.json
# Toolbar action on the launches page: collect the basics for a simulated
# launch. rocket_configuration_id is a dependent dropdown — its choices are the
# selected agency's configurations (requires vantage-ui form choice-filtering;
# the server also rejects a mismatch with 400).
key: new_launch
kind: form
dialog:
  title: "New simulated launch"
  description: "Pick the provider, pad and rocket; the server schedules T-1min and fills in the rest live."
  confirm_label: "Launch simulation"
form:
  fields:
    - name: lsp_id
      type: string
      label: "Launch provider"
      choices_from:
        table: agencies
        value: id
        label: name
    - name: pad_id
      type: string
      label: "Pad"
      choices_from:
        table: pads
        value: id
        label: name
    - name: rocket_configuration_id
      type: string
      label: "Rocket configuration"
      required: false
      choices_from:
        table: launcher_configurations
        value: id
        label: name
        depends_on: { field: lsp_id, foreign_key: manufacturer_id }
    - name: name
      type: string
      label: "Mission name"
      required: false
```

> If Step 1 showed the choice-source key is not `choices_from` (or `depends_on` is unsupported), use the real key for `choices`/table-derived fields and drop `depends_on` here, recording the dependent-dropdown gap for Task 6.

- [ ] **Step 3: Write the http_request action**

Create `apps/launch-control/inventory/action/submit-launch.yaml`:

```yaml
# yaml-language-server: $schema=./action-schema-1.json
# Fires the create request at the bundled launch-control server. Called from the
# launches-page toolbar after new_launch collects the fields.
key: submit_launch
kind: http_request
description: |
  Creates a launch on the launch-control server and starts a live T-1min
  countdown simulation. Returns immediately; the row then updates in place.
params:
  lsp_id:                  { type: string, label: "Provider" }
  pad_id:                  { type: string, label: "Pad" }
  rocket_configuration_id: { type: string, label: "Rocket configuration" }
  name:                    { type: string, label: "Mission name" }
http:
  method: POST
  url: "${LAUNCH_CONTROL_URL}/sim/launches"
  headers:
    Content-Type: "application/json"
  body:
    lsp_id:                  lsp_id
    pad_id:                  pad_id
    rocket_configuration_id: rocket_configuration_id
    name:                    name
```

- [ ] **Step 4: Add the toolbar button to the launches page**

In `apps/launch-control/inventory/page/launches.yaml`, add a page-level toolbar action that chains the two (use the exact toolbar key confirmed in Step 1; the body below is the call-site Rhai):

```yaml
toolbar:
  actions:
    - label: "New simulated launch"
      icon: Rocket
      run: |
        let r = actions.new_launch();
        actions.submit_launch(r.lsp_id, r.pad_id, r.rocket_configuration_id, r.name);
```

- [ ] **Step 5: Validate the inventory loads cleanly via MCP**

Run the launch-control app against the nightly binary and check for parser/validator errors on these files:

```bash
cargo run -q -p launch-control-server -- serve --error-rate 0 &
SRV=$!; sleep 2
env VANTAGE_UI_VERSION=latest VANTAGE_UI_CHANNEL=main \
  cargo run -p test-framework -- apps/launch-control 2>&1 | tail -30
kill $SRV
```
Expected: startup is clean and the existing `data_tools.feature` still passes (the new action files parse without WARN/ERROR). If the toolbar/form keys are wrong they surface here — fix against the Step 1 references.

- [ ] **Step 6: Commit**

```bash
git add apps/launch-control/inventory/action/new-launch.yaml \
        apps/launch-control/inventory/action/submit-launch.yaml \
        apps/launch-control/inventory/page/launches.yaml
git commit -m "launch-control: launches-page action to trigger a simulated launch"
```

---

### Task 6 (cross-repo, separate plan): vantage-ui dependent-dropdown support

**This is a different repository (`vantage-ui`) and an independent subsystem; it is NOT executed by this plan.** P1's spec requires the `rocket_configuration_id` dropdown to filter by the chosen `lsp_id`, which the vantage-ui form system does not yet support. Closing that gap needs its own exploration → spec → plan against the `vantage-ui` repo.

- [ ] **Step 1: Record the requirement and hand off**

Write a short follow-up note (commit to this repo's plan dir is fine) capturing: the desired behavior (a form field whose `choices` are filtered by another field's value through a foreign key, e.g. `launcher_configurations.manufacturer_id == lsp_id`), the call site (`apps/launch-control/inventory/action/new-launch.yaml`), and that the server already enforces it with `400`. Then brainstorm it separately against `vantage-ui`. Do not block P1's merge on this.

---

## Verification (whole-plan, before opening the PR)

- [ ] `cargo test -p launch-control-server` — all unit/endpoint tests green.
- [ ] `cargo build -p launch-control-server` and `cargo build -p test-framework` — both clean.
- [ ] Full BDD against the nightly binary stays green (no mission triggered by the suite):
  `env VANTAGE_UI_VERSION=latest VANTAGE_UI_CHANNEL=main cargo run -p test-framework -- --all`
- [ ] Manual: trigger a launch from the UI button (or `curl`) and watch the launches grid show the new row go unscheduled → T-1min → Go for Launch live, without manual reload.

## Self-Review notes

- **Spec coverage:** dormant thread + CLI (Task 1); `POST /sim/launches` instant create + cross-field validation + 201/400 (Tasks 3–4); plan-then-play engine with `Phase`/`TimedEvent`/boxed `Action`/`MissionContext`/`run_mission` RealTime+NoDelay (Task 2); trivial `CountdownPhase` (Task 2); UI form→http_request action (Task 5); required dependent dropdown flagged as cross-repo (Task 6); determinism + no-delay unit test, endpoint test, BDD-stays-green after dropping `--no-sim` (Tasks 1, 2, 4, Verification).
- **Determinism caveat made explicit:** timestamps derive from a fixed `base` (not wall-clock-at-apply), so `(seed, base)` fully determines the row — see `MissionContext.base` and `same_seed_and_base_are_deterministic`.
- **Reliability:** the trigger route is merged outside the flaky middleware so `--error-rate` never 503s a create.
