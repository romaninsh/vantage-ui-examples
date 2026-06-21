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

#[derive(Debug)]
pub struct Created {
    pub ctx: MissionContext,
    pub seed: u64,
}

/// The phases every mission runs, in order. P2/P3 append to this.
pub fn mission_phases() -> Vec<Box<dyn Phase>> {
    vec![Box::new(CountdownPhase)]
}

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
