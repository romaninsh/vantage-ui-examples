//! On-demand mission simulation: a plan-then-play engine (`engine`), the phases
//! that drive a launch (`countdown`, …), and the trigger that creates a launch
//! and starts a mission (`trigger`).

pub mod countdown;
pub mod engine;
pub mod trigger;

#[cfg(test)]
mod testutil;

pub use countdown::CountdownPhase;
pub use engine::{MissionContext, Pace, Phase, TimedEvent, new_launch_id, run_mission};
pub use trigger::{CreateLaunch, Created, TriggerError, create_launch, mission_phases};

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
