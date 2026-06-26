//! On-demand mission simulation: the launch trigger (`trigger`), the linear
//! human-churn script that drives a launch over ~1 minute (`mission`), and the
//! pacing helpers it uses (`pace`).

pub mod ascent;
pub mod mission;
pub mod pace;
pub mod trigger;

#[cfg(test)]
mod testutil;

pub use mission::run;
pub use pace::Pace;
pub use trigger::{CreateLaunch, TriggerError, create_launch};

#[cfg(test)]
mod tests {
    use vantage_dataset::prelude::ReadableDataSet;

    use super::testutil::temp_db;
    use super::{Pace, run};
    use crate::model::{Astronaut, Launch, LaunchCrew, LaunchTableExt, NewLaunch, PayloadFlight};

    /// The whole mission, run instantly (`NoDelay`), then assert the end state:
    /// orbit insertion, telemetry, the corrected crew, the surname fix, and the
    /// foreign-key-filled payload flight.
    #[tokio::test]
    async fn mission_runs_to_go_for_launch() {
        let h = temp_db().await;
        let launches = Launch::table(h.db.clone());

        let id = launches
            .new_launch(NewLaunch {
                name: "Test Mission".into(),
                lsp_id: Some("121".into()),
                pad_id: Some("p1".into()),
                rocket_configuration_id: None,
            })
            .await
            .unwrap();

        run(&h.db, &id, Pace::NoDelay).await.unwrap();

        // Final launch state: reached orbit after a successful ascent, with
        // telemetry written, still fully confident, scheduled and missioned.
        let launch = launches.get(id.clone()).await.unwrap().expect("launch");
        assert_eq!(launch.status_id.as_deref(), Some("3")); // Launch Successful
        assert_eq!(launch.phase.as_deref(), Some("orbit"));
        assert_eq!(launch.probability, Some(95));
        assert!(launch.mission_id.is_some());
        assert!(launch.net.is_some());
        assert!(launch.altitude_km.unwrap_or(0.0) > 0.0);
        assert!(launch.velocity_ms.unwrap_or(0.0) > 0.0);
        // Audit stamps filled by the `with_timestamps` hook: created once on
        // insert, updated on every edit through the ascent.
        assert!(launch.created_at.is_some());
        assert!(launch.updated_at.is_some());

        // Crew: the stray fifth member was deleted → exactly 4, all ours.
        let crew = LaunchCrew::table(h.db.clone()).list().await.unwrap();
        let ours: Vec<_> = crew
            .values()
            .filter(|c| c.launch_id.as_deref() == Some(id.as_str()))
            .collect();
        assert_eq!(ours.len(), 4);

        // Roles were swapped → exactly one Commander and one Pilot remain.
        let commander = ours
            .iter()
            .filter(|c| c.role.as_deref() == Some("Commander"))
            .count();
        let pilot = ours
            .iter()
            .filter(|c| c.role.as_deref() == Some("Pilot"))
            .count();
        assert_eq!((commander, pilot), (1, 1));

        // Surname typo corrected.
        let astronauts = Astronaut::table(h.db.clone()).list().await.unwrap();
        assert!(astronauts.values().any(|a| a.name == "Victor Glover"));
        assert!(!astronauts.values().any(|a| a.name == "Victor Glovr"));

        // Payload flight attached with launch_id filled in by the traversal.
        let flights = PayloadFlight::table(h.db.clone()).list().await.unwrap();
        assert!(
            flights
                .values()
                .any(|f| f.launch_id.as_deref() == Some(id.as_str()))
        );
    }
}
