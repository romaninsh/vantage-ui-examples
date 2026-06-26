//! Seed the SQLite database from Launch Library 2 data.
//!
//! The committed `fixtures/*.json` are raw LL2 `?mode=detailed` responses. We
//! **decompose** their deeply-nested objects into the normalized rows our schema
//! expects (the inverse of the REST layer's `?mode=detailed` re-nesting):
//!
//! - `launches_*.json` yields launches plus every embedded belongs-to object
//!   (status, net_precision, agency, rocket configuration, mission, orbit, pad,
//!   location) and, from `rocket.launcher_stage[]`, the boosters (launchers),
//!   landings and landing pads.
//! - `payloads.json` / `astronauts.json` yield those entities directly.
//!
//! Two relations cannot be recovered from lldev (it ignores `launch__id` on the
//! join endpoints and ships an empty `spacecraft_stage`), so payload flights and
//! crew assignments are **synthesized** over the real payloads/astronauts — a
//! documented demo condensation, clearly fake-but-plausible.
//!
//! `--refetch` re-pulls the fixtures from lldev before decomposing; otherwise the
//! committed snapshot is used so the demo runs fully offline.

use std::collections::HashMap;

use anyhow::Result;
use serde_json::Value;
use vantage_dataset::traits::WritableDataSet;
use vantage_sql::sqlite::SqliteDB;

use crate::model::*;

const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures");
const LL2: &str = "https://lldev.thespacedevs.com/2.3.0";

const LAUNCH_FILES: &[&str] = &[
    "launches_previous.json",
    "launches_upcoming.json",
    "launches_crewed.json",
];

/// Re-pull every fixture from lldev and overwrite the committed snapshot.
pub async fn refetch() -> Result<()> {
    let client = reqwest::Client::new();
    let jobs = [
        (
            "launches_previous.json",
            format!("{LL2}/launches/previous/?mode=detailed&limit=25&ordering=-net"),
        ),
        (
            "launches_upcoming.json",
            format!("{LL2}/launches/upcoming/?mode=detailed&limit=10&ordering=net"),
        ),
        (
            "launches_crewed.json",
            format!("{LL2}/launches/?mode=detailed&search=Crew-&limit=3&ordering=-net"),
        ),
        (
            "payloads.json",
            format!("{LL2}/payloads/?mode=detailed&limit=80&ordering=-id"),
        ),
        (
            "astronauts.json",
            format!("{LL2}/astronauts/?mode=detailed&limit=40&ordering=-id"),
        ),
    ];
    for (file, url) in jobs {
        println!("fetching {file} …");
        let body = client.get(&url).send().await?.text().await?;
        std::fs::write(format!("{FIXTURES}/{file}"), body)?;
    }
    Ok(())
}

/// Decompose the fixtures and write every normalized row into `db`.
pub async fn seed(db: &SqliteDB) -> Result<()> {
    let mut c = Collected::default();

    for file in LAUNCH_FILES {
        for launch in results(&load(file)?) {
            c.decompose_launch(&launch);
        }
    }
    for payload in results(&load("payloads.json")?) {
        c.decompose_payload(&payload);
    }
    for astronaut in results(&load("astronauts.json")?) {
        c.decompose_astronaut(&astronaut);
    }

    c.synthesize_payload_flights();
    c.synthesize_launch_crew();
    c.write_all(db).await?;
    c.report();
    Ok(())
}

/// Fixtures are embedded at build time so seeding needs no filesystem at
/// runtime — a fresh boot (including a Lambda cold start, where the source tree
/// is absent) seeds straight from the binary. `refetch` rewrites the committed
/// files on disk; the next build re-embeds them.
fn load(file: &str) -> Result<Value> {
    let raw = match file {
        "launches_previous.json" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/fixtures/launches_previous.json"
        )),
        "launches_upcoming.json" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/fixtures/launches_upcoming.json"
        )),
        "launches_crewed.json" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/fixtures/launches_crewed.json"
        )),
        "payloads.json" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/fixtures/payloads.json"
        )),
        "astronauts.json" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/fixtures/astronauts.json"
        )),
        other => anyhow::bail!("unknown fixture `{other}`"),
    };
    Ok(serde_json::from_str(raw)?)
}

fn results(envelope: &Value) -> Vec<Value> {
    envelope
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

// ── small JSON accessors ────────────────────────────────────────────────────

/// An id is an int or string in LL2; we store everything as text.
fn as_id(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
fn id_of(v: &Value) -> Option<String> {
    v.get("id").and_then(as_id)
}
fn str_at(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(|x| x.as_str().map(String::from))
}
fn int_at(v: &Value, k: &str) -> Option<i64> {
    v.get(k).and_then(Value::as_i64)
}
fn float_at(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(Value::as_f64)
}
fn bool_at(v: &Value, k: &str) -> Option<bool> {
    v.get(k).and_then(Value::as_bool)
}
/// Pull a display name from a value that may be a string, an object `{name}`, or
/// an array of such objects (LL2 uses all three for country/family/nationality).
fn name_at(v: &Value, k: &str) -> Option<String> {
    match v.get(k) {
        Some(Value::String(s)) => Some(s.clone()),
        Some(o @ Value::Object(_)) => o.get("name").and_then(|x| x.as_str().map(String::from)),
        Some(Value::Array(a)) => a
            .first()
            .and_then(|x| x.get("name"))
            .and_then(|x| x.as_str().map(String::from)),
        _ => None,
    }
}

// ── collected, deduplicated rows ─────────────────────────────────────────────

#[derive(Default)]
struct Collected {
    launches: Vec<(String, Launch)>,
    launch_statuses: HashMap<String, LaunchStatus>,
    net_precisions: HashMap<String, NetPrecision>,
    agencies: HashMap<String, Agency>,
    agency_types: HashMap<String, AgencyType>,
    configs: HashMap<String, LauncherConfiguration>,
    missions: HashMap<String, Mission>,
    orbits: HashMap<String, Orbit>,
    pads: HashMap<String, Pad>,
    locations: HashMap<String, Location>,
    launchers: HashMap<String, Launcher>,
    launcher_statuses: HashMap<String, LauncherStatus>,
    landpads: HashMap<String, Landpad>,
    landing_types: HashMap<String, LandingType>,
    landings: Vec<(String, Landing)>,
    payloads: Vec<(String, Payload)>,
    payload_types: HashMap<String, PayloadType>,
    astronauts: Vec<(String, Astronaut)>,
    astronaut_statuses: HashMap<String, AstronautStatus>,
    astronaut_types: HashMap<String, AstronautType>,
    payload_flights: Vec<(String, PayloadFlight)>,
    launch_crew: Vec<(String, LaunchCrew)>,
}

impl Collected {
    fn decompose_launch(&mut self, l: &Value) {
        let Some(id) = id_of(l) else { return };

        let status_id = l
            .get("status")
            .and_then(|s| self.described(s, Kind::LaunchStatus));
        let net_precision_id = l
            .get("net_precision")
            .and_then(|s| self.described(s, Kind::NetPrecision));
        let lsp_id = l
            .get("launch_service_provider")
            .and_then(|a| self.agency(a));
        let rocket = l.get("rocket");
        let rocket_configuration_id = rocket
            .and_then(|r| r.get("configuration"))
            .and_then(|cfg| self.config(cfg));
        let mission_id = l.get("mission").and_then(|m| self.mission(m));
        let pad_id = l.get("pad").and_then(|p| self.pad(p));

        if let Some(stages) = rocket
            .and_then(|r| r.get("launcher_stage"))
            .and_then(Value::as_array)
        {
            for stage in stages {
                self.launcher_stage(&id, stage);
            }
        }

        self.launches.push((
            id,
            Launch {
                name: str_at(l, "name").unwrap_or_default(),
                status_id,
                net: str_at(l, "net"),
                net_precision_id,
                window_start: str_at(l, "window_start"),
                window_end: str_at(l, "window_end"),
                launch_designator: str_at(l, "launch_designator"),
                probability: int_at(l, "probability"),
                webcast_live: bool_at(l, "webcast_live"),
                failreason: str_at(l, "failreason"),
                lsp_id,
                rocket_configuration_id,
                mission_id,
                pad_id,
                last_updated: str_at(l, "last_updated"),
                // Telemetry is simulator-only; seeded launches start with none.
                ..Default::default()
            },
        ));
    }

    fn agency(&mut self, a: &Value) -> Option<String> {
        let id = id_of(a)?;
        let type_id = a.get("type").and_then(|t| self.named(t, Kind::AgencyType));
        self.agencies.entry(id.clone()).or_insert_with(|| Agency {
            name: str_at(a, "name").unwrap_or_default(),
            abbrev: str_at(a, "abbrev"),
            type_id,
            featured: bool_at(a, "featured"),
            description: str_at(a, "description"),
            administrator: str_at(a, "administrator"),
            founding_year: int_at(a, "founding_year"),
            country: name_at(a, "country"),
            last_updated: str_at(a, "last_updated"),
        });
        Some(id)
    }

    fn config(&mut self, cfg: &Value) -> Option<String> {
        let id = id_of(cfg)?;
        let manufacturer_id = cfg.get("manufacturer").and_then(|m| self.agency(m));
        self.configs
            .entry(id.clone())
            .or_insert_with(|| LauncherConfiguration {
                name: str_at(cfg, "name").unwrap_or_default(),
                full_name: str_at(cfg, "full_name"),
                variant: str_at(cfg, "variant"),
                family: name_at(cfg, "families"),
                manufacturer_id,
                active: bool_at(cfg, "active"),
                reusable: bool_at(cfg, "reusable"),
                description: str_at(cfg, "description"),
                length: float_at(cfg, "length"),
                diameter: float_at(cfg, "diameter"),
                launch_mass: float_at(cfg, "launch_mass"),
                leo_capacity: float_at(cfg, "leo_capacity"),
                gto_capacity: float_at(cfg, "gto_capacity"),
                last_updated: str_at(cfg, "last_updated"),
            });
        Some(id)
    }

    fn mission(&mut self, m: &Value) -> Option<String> {
        let id = id_of(m)?;
        let orbit_id = m.get("orbit").and_then(|o| self.orbit(o));
        self.missions.entry(id.clone()).or_insert_with(|| Mission {
            name: str_at(m, "name").unwrap_or_default(),
            mission_type: str_at(m, "type"),
            description: str_at(m, "description"),
            orbit_id,
            last_updated: None,
        });
        Some(id)
    }

    fn orbit(&mut self, o: &Value) -> Option<String> {
        let id = id_of(o)?;
        self.orbits.entry(id.clone()).or_insert_with(|| Orbit {
            name: str_at(o, "name").unwrap_or_default(),
            abbrev: str_at(o, "abbrev").unwrap_or_default(),
        });
        Some(id)
    }

    fn pad(&mut self, p: &Value) -> Option<String> {
        let id = id_of(p)?;
        let location_id = p.get("location").and_then(|loc| self.location(loc));
        self.pads.entry(id.clone()).or_insert_with(|| Pad {
            name: str_at(p, "name").unwrap_or_default(),
            country: name_at(p, "country"),
            location_id,
            active: bool_at(p, "active"),
            description: str_at(p, "description"),
            latitude: float_at(p, "latitude"),
            longitude: float_at(p, "longitude"),
            last_updated: None,
        });
        Some(id)
    }

    fn location(&mut self, loc: &Value) -> Option<String> {
        let id = id_of(loc)?;
        self.locations
            .entry(id.clone())
            .or_insert_with(|| Location {
                name: str_at(loc, "name").unwrap_or_default(),
                country: name_at(loc, "country"),
                celestial_body_name: name_at(loc, "celestial_body"),
                active: bool_at(loc, "active"),
                description: str_at(loc, "description"),
                timezone_name: str_at(loc, "timezone_name"),
                latitude: float_at(loc, "latitude"),
                longitude: float_at(loc, "longitude"),
                last_updated: None,
            });
        Some(id)
    }

    fn launcher_stage(&mut self, launch_id: &str, stage: &Value) {
        let launcher_id = stage.get("launcher").and_then(|l| {
            let id = id_of(l)?;
            let status_id = l
                .get("status")
                .and_then(|s| self.named(s, Kind::LauncherStatus));
            self.launchers
                .entry(id.clone())
                .or_insert_with(|| Launcher {
                    serial_number: str_at(l, "serial_number"),
                    status_id,
                    flight_proven: bool_at(l, "flight_proven"),
                    details: str_at(l, "details"),
                    first_launch_date: str_at(l, "first_launch_date"),
                    last_launch_date: str_at(l, "last_launch_date"),
                    last_updated: None,
                });
            Some(id)
        });

        if let Some(land) = stage.get("landing").filter(|v| !v.is_null()) {
            let Some(id) = id_of(land) else { return };
            let landing_location_id = land
                .get("landing_location")
                .and_then(|loc| self.landpad(loc));
            let type_id = land
                .get("type")
                .and_then(|t| self.described(t, Kind::LandingType));
            self.landings.push((
                id,
                Landing {
                    launch_id: Some(launch_id.to_string()),
                    launcher_id,
                    landing_location_id,
                    type_id,
                    success: bool_at(land, "success"),
                    attempt: bool_at(land, "attempt"),
                    description: str_at(land, "description"),
                    last_updated: None,
                },
            ));
        }
    }

    fn landpad(&mut self, loc: &Value) -> Option<String> {
        let id = id_of(loc)?;
        self.landpads.entry(id.clone()).or_insert_with(|| Landpad {
            name: str_at(loc, "name").unwrap_or_default(),
            abbrev: str_at(loc, "abbrev"),
            celestial_body_name: name_at(loc, "celestial_body"),
            active: bool_at(loc, "active"),
            description: str_at(loc, "description"),
            latitude: float_at(loc, "latitude"),
            longitude: float_at(loc, "longitude"),
            last_updated: None,
        });
        Some(id)
    }

    fn decompose_payload(&mut self, p: &Value) {
        let Some(id) = id_of(p) else { return };
        let type_id = p.get("type").and_then(|t| self.named(t, Kind::PayloadType));
        let manufacturer_id = p.get("manufacturer").and_then(|m| self.agency(m));
        let operator_id = p.get("operator").and_then(|m| self.agency(m));
        self.payloads.push((
            id,
            Payload {
                name: str_at(p, "name").unwrap_or_default(),
                type_id,
                manufacturer_id,
                operator_id,
                mass: float_at(p, "mass"),
                description: str_at(p, "description"),
                last_updated: None,
            },
        ));
    }

    fn decompose_astronaut(&mut self, a: &Value) {
        let Some(id) = id_of(a) else { return };
        let status_id = a
            .get("status")
            .and_then(|s| self.named(s, Kind::AstronautStatus));
        let type_id = a
            .get("type")
            .and_then(|t| self.named(t, Kind::AstronautType));
        let agency_id = a.get("agency").and_then(|ag| self.agency(ag));
        self.astronauts.push((
            id,
            Astronaut {
                name: str_at(a, "name").unwrap_or_default(),
                status_id,
                type_id,
                agency_id,
                nationality: name_at(a, "nationality"),
                in_space: bool_at(a, "in_space"),
                time_in_space: str_at(a, "time_in_space"),
                eva_time: str_at(a, "eva_time"),
                age: int_at(a, "age"),
                date_of_birth: str_at(a, "date_of_birth"),
                date_of_death: str_at(a, "date_of_death"),
                first_flight: str_at(a, "first_flight"),
                last_flight: str_at(a, "last_flight"),
                flights_count: int_at(a, "flights_count"),
                landings_count: int_at(a, "landings_count"),
                spacewalks_count: int_at(a, "spacewalks_count"),
                bio: str_at(a, "bio"),
                last_updated: str_at(a, "last_updated"),
            },
        ));
    }

    /// Spread the real payloads across launches round-robin so every launch has
    /// a plausible manifest for the count/mass aggregation. Synthetic linkage.
    fn synthesize_payload_flights(&mut self) {
        if self.launches.is_empty() {
            return;
        }
        let launch_ids: Vec<String> = self.launches.iter().map(|(id, _)| id.clone()).collect();
        for (i, (payload_id, _)) in self.payloads.iter().enumerate() {
            let launch_id = launch_ids[i % launch_ids.len()].clone();
            self.payload_flights.push((
                format!("pf-{payload_id}"),
                PayloadFlight {
                    launch_id: Some(launch_id),
                    payload_id: Some(payload_id.clone()),
                    destination: None,
                    amount: Some(1),
                    last_updated: None,
                },
            ));
        }
    }

    /// Assign a 4-person crew to every crewed-looking launch from the astronaut
    /// pool. Synthetic linkage (lldev ships no crew in `spacecraft_stage`).
    fn synthesize_launch_crew(&mut self) {
        const ROLES: [&str; 4] = [
            "Commander",
            "Pilot",
            "Mission Specialist",
            "Mission Specialist",
        ];
        if self.astronauts.is_empty() {
            return;
        }
        let pool: Vec<String> = self.astronauts.iter().map(|(id, _)| id.clone()).collect();
        let mut next = 0usize;
        let crewed: Vec<String> = self
            .launches
            .iter()
            .filter(|(_, l)| l.name.contains("Crew"))
            .map(|(id, _)| id.clone())
            .collect();
        for launch_id in crewed {
            for role in ROLES {
                let astronaut_id = pool[next % pool.len()].clone();
                next += 1;
                self.launch_crew.push((
                    format!("lc-{launch_id}-{astronaut_id}"),
                    LaunchCrew {
                        launch_id: Some(launch_id.clone()),
                        astronaut_id: Some(astronaut_id),
                        role: Some(role.to_string()),
                    },
                ));
            }
        }
    }

    // Upsert helpers for the two lookup shapes, returning the id.
    fn described(&mut self, v: &Value, kind: Kind) -> Option<String> {
        let id = id_of(v)?;
        let row = || {
            (
                str_at(v, "name").unwrap_or_default(),
                str_at(v, "abbrev").unwrap_or_default(),
                str_at(v, "description").unwrap_or_default(),
            )
        };
        match kind {
            Kind::LaunchStatus => {
                let (name, abbrev, description) = row();
                self.launch_statuses
                    .entry(id.clone())
                    .or_insert(LaunchStatus {
                        name,
                        abbrev,
                        description,
                    });
            }
            Kind::NetPrecision => {
                let (name, abbrev, description) = row();
                self.net_precisions
                    .entry(id.clone())
                    .or_insert(NetPrecision {
                        name,
                        abbrev,
                        description,
                    });
            }
            Kind::LandingType => {
                let (name, abbrev, description) = row();
                self.landing_types.entry(id.clone()).or_insert(LandingType {
                    name,
                    abbrev,
                    description,
                });
            }
            _ => unreachable!(),
        }
        Some(id)
    }

    fn named(&mut self, v: &Value, kind: Kind) -> Option<String> {
        let id = id_of(v)?;
        let name = str_at(v, "name").unwrap_or_default();
        match kind {
            Kind::AgencyType => {
                self.agency_types
                    .entry(id.clone())
                    .or_insert(AgencyType { name });
            }
            Kind::PayloadType => {
                self.payload_types
                    .entry(id.clone())
                    .or_insert(PayloadType { name });
            }
            Kind::LauncherStatus => {
                self.launcher_statuses
                    .entry(id.clone())
                    .or_insert(LauncherStatus { name });
            }
            Kind::AstronautStatus => {
                self.astronaut_statuses
                    .entry(id.clone())
                    .or_insert(AstronautStatus { name });
            }
            Kind::AstronautType => {
                self.astronaut_types
                    .entry(id.clone())
                    .or_insert(AstronautType { name });
            }
            _ => unreachable!(),
        }
        Some(id)
    }

    async fn write_all(&self, db: &SqliteDB) -> Result<()> {
        macro_rules! write_rows {
            ($ctor:path, $rows:expr) => {{
                let t = $ctor(db.clone());
                for (id, e) in $rows {
                    t.replace(id.clone(), e).await?;
                }
            }};
        }
        write_rows!(LaunchStatus::table, &self.launch_statuses);
        write_rows!(NetPrecision::table, &self.net_precisions);
        write_rows!(AgencyType::table, &self.agency_types);
        write_rows!(PayloadType::table, &self.payload_types);
        write_rows!(LandingType::table, &self.landing_types);
        write_rows!(Orbit::table, &self.orbits);
        write_rows!(LauncherStatus::table, &self.launcher_statuses);
        write_rows!(AstronautStatus::table, &self.astronaut_statuses);
        write_rows!(AstronautType::table, &self.astronaut_types);
        write_rows!(Agency::table, &self.agencies);
        write_rows!(LauncherConfiguration::table, &self.configs);
        write_rows!(Launcher::table, &self.launchers);
        write_rows!(Location::table, &self.locations);
        write_rows!(Pad::table, &self.pads);
        write_rows!(Mission::table, &self.missions);
        write_rows!(Landpad::table, &self.landpads);
        write_rows!(Payload::table, &self.payloads);
        write_rows!(Astronaut::table, &self.astronauts);
        write_rows!(Launch::table, &self.launches);
        write_rows!(Landing::table, &self.landings);
        write_rows!(PayloadFlight::table, &self.payload_flights);
        write_rows!(LaunchCrew::table, &self.launch_crew);
        Ok(())
    }

    fn report(&self) {
        println!(
            "seeded: {} launches, {} agencies, {} configs, {} pads, {} locations, {} launchers, {} landings, {} landpads, {} payloads, {} payload_flights, {} astronauts, {} launch_crew",
            self.launches.len(),
            self.agencies.len(),
            self.configs.len(),
            self.pads.len(),
            self.locations.len(),
            self.launchers.len(),
            self.landings.len(),
            self.landpads.len(),
            self.payloads.len(),
            self.payload_flights.len(),
            self.astronauts.len(),
            self.launch_crew.len(),
        );
    }
}

#[derive(Clone, Copy)]
enum Kind {
    LaunchStatus,
    NetPrecision,
    LandingType,
    AgencyType,
    PayloadType,
    LauncherStatus,
    AstronautStatus,
    AstronautType,
}
