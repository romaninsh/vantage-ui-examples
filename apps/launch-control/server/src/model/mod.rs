//! Vantage table models — one entity per file, bakery_model3-style. Each
//! `Type::table(db)` builds a `Table<SqliteDB, Type>` with its raw columns,
//! relations, and computed aggregate expressions (LL2 stores these stats
//! denormalized; we recompute them inline as correlated subqueries via
//! `with_expression`). LL2 launch-status ids: 3 = success, 4/7 = failure,
//! everything else pending.

mod agency;
mod astronaut;
mod landing;
mod landpad;
mod launch;
mod launch_crew;
mod launcher;
mod launcher_configuration;
mod location;
mod lookups;
mod mission;
mod orbit;
mod pad;
mod payload;
mod payload_flight;

pub use agency::Agency;
pub use astronaut::Astronaut;
pub use landing::Landing;
pub use landpad::Landpad;
pub use launch::Launch;
pub(crate) use launch::{LaunchTableExt, NewLaunch};
pub use launch_crew::LaunchCrew;
pub use launcher::Launcher;
pub use launcher_configuration::LauncherConfiguration;
pub use location::Location;
pub use lookups::{
    AgencyType, AstronautStatus, AstronautType, LandingType, LaunchStatus, LauncherStatus,
    NetPrecision, PayloadType,
};
pub use mission::Mission;
pub use orbit::Orbit;
pub use pad::Pad;
pub use payload::Payload;
pub use payload_flight::PayloadFlight;
