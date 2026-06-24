//! The mission script: drives a freshly-created launch through ~1 minute of
//! realistic human churn — assign a mission, add crew (mistyped name, wrong
//! roles, an accidental extra), correct those mistakes, attach a payload, and
//! climb the launch probability — so the engine and UI live-refresh can be
//! watched end to end.
//!
//! It reads top-to-bottom as the story it tells. Edits go through vantage's
//! native interface: `get_entity` for an editable handle, `.save()` to persist,
//! and `launch.related(...)` to insert child rows with the foreign key filled
//! automatically.

use chrono::Utc;
use vantage_dataset::prelude::{ActiveEntity, ActiveEntitySet, InsertableDataSet, WritableValueSet};
use vantage_sql::sqlite::SqliteDB;
use vantage_table::prelude::RelatedEntityExt;
use vantage_table::table::Table;

use super::pace::{Pace, ensure_statuses, ll2_now, secs};
use crate::model::{Astronaut, Launch, LaunchCrew, Mission, Payload, PayloadFlight};

/// Run the mission for an already-created launch `id`.
pub async fn run(db: &SqliteDB, id: &str, pace: Pace) -> anyhow::Result<()> {
    ensure_statuses(db).await?;

    let launches = Launch::table(db.clone());
    let missions = Mission::table(db.clone());
    let astronauts = Astronaut::table(db.clone());
    let payloads = Payload::table(db.clone());
    let crew = LaunchCrew::table(db.clone());

    // The launch already exists (created synchronously by the trigger). Load it
    // as an editable, traversable handle.
    let mut launch = launches
        .get_entity(id.to_string())
        .await?
        .ok_or_else(|| anyhow::anyhow!("launch {id} vanished"))?;

    // T-55s: give it a mission, a target window, and a first probability guess.
    pace.gap(secs(5)).await;
    let mission_id = missions
        .insert_return_id(&Mission {
            name: "Crewed lunar flyby".into(),
            mission_type: Some("Human Exploration".into()),
            ..Default::default()
        })
        .await?;
    launch.mission_id = Some(mission_id);
    launch.net = Some(ll2_now(Utc::now() + chrono::Duration::seconds(55)));
    launch.probability = Some(40);
    save_stamped(&mut launch).await?;

    // T-48s..T-32s: crew entered in a hurry — each inserted *through the launch*,
    // so `launch_id` is filled automatically. Glover's surname is mistyped, the
    // commander/pilot are entered the wrong way round, and a fifth name slips in.
    pace.gap(secs(7)).await;
    let glover = astronauts
        .insert_return_id(&Astronaut { name: "Victor Glovr".into(), ..Default::default() })
        .await?;
    let crew_pilot = launch
        .related::<LaunchCrew>("launch_crew")?
        .insert_return_id(&LaunchCrew {
            astronaut_id: Some(glover.clone()),
            role: Some("Pilot".into()),
            ..Default::default()
        })
        .await?;

    pace.gap(secs(4)).await;
    let wiseman = astronauts
        .insert_return_id(&Astronaut { name: "Reid Wiseman".into(), ..Default::default() })
        .await?;
    let crew_cmd = launch
        .related::<LaunchCrew>("launch_crew")?
        .insert_return_id(&LaunchCrew {
            astronaut_id: Some(wiseman),
            role: Some("Commander".into()),
            ..Default::default()
        })
        .await?;
    launch.probability = Some(55);
    save_stamped(&mut launch).await?;

    pace.gap(secs(4)).await;
    let koch = astronauts
        .insert_return_id(&Astronaut { name: "Christina Koch".into(), ..Default::default() })
        .await?;
    launch
        .related::<LaunchCrew>("launch_crew")?
        .insert_return_id(&LaunchCrew {
            astronaut_id: Some(koch),
            role: Some("Mission Specialist".into()),
            ..Default::default()
        })
        .await?;

    pace.gap(secs(4)).await;
    let hansen = astronauts
        .insert_return_id(&Astronaut { name: "Jeremy Hansen".into(), ..Default::default() })
        .await?;
    launch
        .related::<LaunchCrew>("launch_crew")?
        .insert_return_id(&LaunchCrew {
            astronaut_id: Some(hansen),
            role: Some("Mission Specialist".into()),
            ..Default::default()
        })
        .await?;
    launch.probability = Some(68);
    save_stamped(&mut launch).await?;

    // A fifth crew member entered by mistake.
    pace.gap(secs(3)).await;
    let stray = astronauts
        .insert_return_id(&Astronaut { name: "Stanley Love".into(), ..Default::default() })
        .await?;
    let crew_stray = launch
        .related::<LaunchCrew>("launch_crew")?
        .insert_return_id(&LaunchCrew {
            astronaut_id: Some(stray),
            role: Some("Mission Specialist".into()),
            ..Default::default()
        })
        .await?;

    // T-26s: corrections — the messy-human part.
    // 1) Commander/Pilot were attached the wrong way round: swap the two roles.
    pace.gap(secs(4)).await;
    let mut commander = crew
        .get_entity(crew_cmd)
        .await?
        .ok_or_else(|| anyhow::anyhow!("crew row vanished"))?;
    let mut pilot = crew
        .get_entity(crew_pilot)
        .await?
        .ok_or_else(|| anyhow::anyhow!("crew row vanished"))?;
    std::mem::swap(&mut commander.role, &mut pilot.role);
    commander.save().await?;
    pilot.save().await?;
    launch.probability = Some(78);
    save_stamped(&mut launch).await?;

    // 2) the fifth crew member was a mistake — remove them.
    pace.gap(secs(3)).await;
    crew.delete(crew_stray).await?;

    // 3) fix the misspelled surname: "Glovr" -> "Glover".
    pace.gap(secs(3)).await;
    let mut glover_row = astronauts
        .get_entity(glover)
        .await?
        .ok_or_else(|| anyhow::anyhow!("astronaut vanished"))?;
    glover_row.name = "Victor Glover".into();
    glover_row.save().await?;

    // T-15s: load the payload — create it, then attach a flight through the launch.
    pace.gap(secs(4)).await;
    let payload_id = payloads
        .insert_return_id(&Payload {
            name: "Orion CSM".into(),
            mass: Some(26_520.0),
            ..Default::default()
        })
        .await?;
    launch
        .related::<PayloadFlight>("payload_flights")?
        .insert_return_id(&PayloadFlight {
            payload_id: Some(payload_id),
            destination: Some("Trans-Lunar Injection".into()),
            ..Default::default()
        })
        .await?;
    launch.probability = Some(88);
    save_stamped(&mut launch).await?;

    // T-6s: go for launch.
    pace.gap(secs(6)).await;
    launch.probability = Some(95);
    launch.status_id = Some("8".into()); // To Be Confirmed
    save_stamped(&mut launch).await?;

    // T-0: liftoff.
    pace.gap(secs(6)).await;
    launch.status_id = Some("1".into()); // Go for Launch
    save_stamped(&mut launch).await?;

    Ok(())
}

/// Stamp `last_updated` (so the UI live-refresh notices) and persist the launch.
async fn save_stamped(
    launch: &mut ActiveEntity<'_, Table<SqliteDB, Launch>, Launch>,
) -> anyhow::Result<()> {
    launch.last_updated = Some(ll2_now(Utc::now()));
    launch.save().await?;
    Ok(())
}
