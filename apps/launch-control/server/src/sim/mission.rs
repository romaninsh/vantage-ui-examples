//! The mission script: drives a freshly-created launch through ~1 minute of
//! realistic human churn — assign a mission, add crew (mistyped name, wrong
//! roles, an accidental extra), correct those mistakes, attach a payload, and
//! climb the launch probability — so the engine and UI live-refresh can be
//! watched end to end.
//!
//! It reads top-to-bottom as the story it tells. Four small helpers keep each
//! beat to a line: `edit` mutates-stamps-saves the launch, `add_crew` creates an
//! astronaut and assigns them through the launch (foreign key auto-filled), and
//! `swap_roles` / `fix_name` apply the corrections.

use chrono::Utc;
use vantage_dataset::prelude::{
    ActiveEntity, ActiveEntitySet, InsertableDataSet, WritableValueSet,
};
use vantage_sql::sqlite::SqliteDB;
use vantage_table::prelude::GetRefExt;
use vantage_table::table::Table;

use super::ascent;
use super::pace::{Pace, ensure_statuses, ll2_now, secs};
use crate::model::{Astronaut, Launch, LaunchCrew, Mission, Payload, PayloadFlight};

// Crew roles, spelled once.
const COMMANDER: &str = "Commander";
const PILOT: &str = "Pilot";
const SPECIALIST: &str = "Mission Specialist";

/// Run the mission for an already-created launch `id`.
pub async fn run(db: &SqliteDB, id: &str, pace: Pace) -> anyhow::Result<()> {
    ensure_statuses(db).await?;

    let launches = Launch::table(db.clone());
    let missions = Mission::table(db.clone());
    let astronauts = Astronaut::table(db.clone());
    let payloads = Payload::table(db.clone());
    let crew = LaunchCrew::table(db.clone());

    // The launch already exists (created synchronously by the trigger). Load it
    // as an editable handle, and scope its two child sets once up front — rows
    // inserted through these carry `launch_id` automatically.
    let mut launch = launches
        .get_entity(id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("launch {id} vanished"))?;
    let launch_crew = launch.get_ref::<LaunchCrew>("launch_crew")?;
    let payload_flights = launch.get_ref::<PayloadFlight>("payload_flights")?;

    // T-55s: give it a mission, a target window, and a first probability guess.
    pace.gap(secs(5)).await;
    let mission_id = missions
        .insert_return_id(&Mission {
            name: "Crewed lunar flyby".into(),
            mission_type: Some("Human Exploration".into()),
            ..Default::default()
        })
        .await?;
    edit(&mut launch, |l| {
        l.mission_id = Some(mission_id);
        l.net = Some(ll2_now(Utc::now() + chrono::Duration::seconds(55)));
        l.probability = Some(40);
    })
    .await?;

    // T-48s..T-32s: crew entered in a hurry — Glover's surname is mistyped, the
    // commander/pilot go in the wrong way round, and a fifth name slips in.
    pace.gap(secs(7)).await;
    let (glover, crew_pilot) = add_crew(&astronauts, &launch_crew, "Victor Glovr", PILOT).await?;

    pace.gap(secs(4)).await;
    let (_, crew_commander) =
        add_crew(&astronauts, &launch_crew, "Reid Wiseman", COMMANDER).await?;
    edit(&mut launch, |l| l.probability = Some(55)).await?;

    pace.gap(secs(4)).await;
    add_crew(&astronauts, &launch_crew, "Christina Koch", SPECIALIST).await?;

    pace.gap(secs(4)).await;
    add_crew(&astronauts, &launch_crew, "Jeremy Hansen", SPECIALIST).await?;
    edit(&mut launch, |l| l.probability = Some(68)).await?;

    // A fifth crew member entered by mistake.
    pace.gap(secs(3)).await;
    let (_, crew_stray) = add_crew(&astronauts, &launch_crew, "Stanley Love", SPECIALIST).await?;

    // T-26s: corrections — the messy-human part.
    // 1) Commander and Pilot were attached the wrong way round: swap their roles.
    pace.gap(secs(4)).await;
    swap_roles(&crew, &crew_commander, &crew_pilot).await?;
    edit(&mut launch, |l| l.probability = Some(78)).await?;

    // 2) the fifth crew member was a mistake — remove them.
    pace.gap(secs(3)).await;
    crew.delete(crew_stray).await?;

    // 3) fix the misspelled surname: "Glovr" -> "Glover".
    pace.gap(secs(3)).await;
    fix_name(&astronauts, &glover, "Victor Glover").await?;

    // T-15s: the manifest fills in — three payload flights attached through the
    // launch, one after another, so the UI's payloads tab populates live.
    pace.gap(secs(4)).await;
    add_payload(&payloads, &payload_flights, "Orion CSM", 26_520.0, "Trans-Lunar Injection").await?;
    pace.gap(secs(1)).await;
    add_payload(&payloads, &payload_flights, "ArgoMoon CubeSat", 14.0, "Lunar Flyby").await?;
    pace.gap(secs(1)).await;
    add_payload(&payloads, &payload_flights, "BioSentinel CubeSat", 14.0, "Heliocentric Orbit").await?;
    edit(&mut launch, |l| l.probability = Some(88)).await?;

    // T-6s: go for launch.
    pace.gap(secs(6)).await;
    edit(&mut launch, |l| {
        l.probability = Some(95);
        l.status_id = Some("8".into()); // To Be Confirmed
    })
    .await?;

    // T-0: liftoff.
    pace.gap(secs(6)).await;
    edit(&mut launch, |l| l.status_id = Some("1".into())).await?; // Go for Launch
    println!("sim: liftoff id={id}");

    // T+: ascent. Climb to orbit over ~36s, writing telemetry each tick so the
    // summary view animates through the flight. The engine cuts off partway
    // (MECO) and the rest is a coast — the per-tick `thrust_kn = 0` /
    // `acceleration_ms2 = 0` is what lets the view stop projecting a climb.
    edit(&mut launch, |l| l.phase = Some("ascent".into())).await?;
    let mut announced_meco = false;
    for tick in 1..=ASCENT_TICKS {
        pace.gap(secs(1)).await;
        let s = ascent::sample(tick, ASCENT_TICKS);
        if s.thrust_kn == 0.0 && !announced_meco {
            announced_meco = true;
            println!("sim: MECO id={id}");
        }
        edit(&mut launch, |l| {
            l.met_seconds = Some(s.met_seconds);
            l.altitude_km = Some(s.altitude_km);
            l.velocity_ms = Some(s.velocity_ms);
            l.acceleration_ms2 = Some(s.acceleration_ms2);
            l.downrange_km = Some(s.downrange_km);
            l.vertical_speed_ms = Some(s.vertical_speed_ms);
            l.ground_speed_ms = Some(s.ground_speed_ms);
            l.thrust_kn = Some(s.thrust_kn);
        })
        .await?;
    }

    // Orbit insertion: a clean, successful flight.
    edit(&mut launch, |l| {
        l.phase = Some("orbit".into());
        l.status_id = Some("3".into()); // Launch Successful
    })
    .await?;
    println!("sim: orbit id={id}");

    Ok(())
}

/// Ascent ticks (one per second → ~36s of live telemetry, updated every second).
const ASCENT_TICKS: i64 = 36;

/// Apply `f` to the launch, stamp `last_updated` (the UI live-refresh keys off
/// it), and persist. Every launch edit goes through here.
async fn edit(
    launch: &mut ActiveEntity<'_, Table<SqliteDB, Launch>, Launch>,
    f: impl FnOnce(&mut Launch),
) -> anyhow::Result<()> {
    f(launch);
    launch.last_updated = Some(ll2_now(Utc::now()));
    launch.save().await?;
    Ok(())
}

/// Create an astronaut and assign them to the launch crew in one step; the crew
/// row's `launch_id` is filled by the scoped set. Returns (astronaut id, crew id).
async fn add_crew(
    astronauts: &Table<SqliteDB, Astronaut>,
    launch_crew: &Table<SqliteDB, LaunchCrew>,
    name: &str,
    role: &str,
) -> anyhow::Result<(String, String)> {
    let astronaut_id = astronauts
        .insert_return_id(&Astronaut {
            name: name.into(),
            ..Default::default()
        })
        .await?;
    let crew_id = launch_crew
        .insert_return_id(&LaunchCrew {
            astronaut_id: Some(astronaut_id.clone()),
            role: Some(role.into()),
            ..Default::default()
        })
        .await?;
    Ok((astronaut_id, crew_id))
}

/// Create a payload and attach a flight to it through the launch in one step;
/// the flight's `launch_id` is filled by the scoped set.
async fn add_payload(
    payloads: &Table<SqliteDB, Payload>,
    payload_flights: &Table<SqliteDB, PayloadFlight>,
    name: &str,
    mass: f64,
    destination: &str,
) -> anyhow::Result<()> {
    let payload_id = payloads
        .insert_return_id(&Payload {
            name: name.into(),
            mass: Some(mass),
            ..Default::default()
        })
        .await?;
    payload_flights
        .insert_return_id(&PayloadFlight {
            payload_id: Some(payload_id),
            destination: Some(destination.into()),
            ..Default::default()
        })
        .await?;
    Ok(())
}

/// Swap the roles of two crew rows (whatever they currently are).
async fn swap_roles(crew: &Table<SqliteDB, LaunchCrew>, a: &str, b: &str) -> anyhow::Result<()> {
    let mut x = crew
        .get_entity(a.to_string())
        .await?
        .ok_or_else(|| anyhow::anyhow!("crew row vanished"))?;
    let mut y = crew
        .get_entity(b.to_string())
        .await?
        .ok_or_else(|| anyhow::anyhow!("crew row vanished"))?;
    std::mem::swap(&mut x.role, &mut y.role);
    x.save().await?;
    y.save().await?;
    Ok(())
}

/// Correct an astronaut's name.
async fn fix_name(
    astronauts: &Table<SqliteDB, Astronaut>,
    id: &str,
    name: &str,
) -> anyhow::Result<()> {
    let mut a = astronauts
        .get_entity(id.to_string())
        .await?
        .ok_or_else(|| anyhow::anyhow!("astronaut vanished"))?;
    a.name = name.into();
    a.save().await?;
    Ok(())
}
