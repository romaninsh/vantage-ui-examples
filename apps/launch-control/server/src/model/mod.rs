//! Vantage table models — one entity per file, bakery_model3-style. Each
//! `Type::table(db)` builds a `Table<SqliteDB, Type>` with its raw columns and
//! relations. Computed aggregate expressions are added in phase 3.

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
mod pad;
mod payload;
mod payload_flight;

pub use agency::Agency;
pub use astronaut::Astronaut;
pub use landing::Landing;
pub use landpad::Landpad;
pub use launch::Launch;
pub use launch_crew::LaunchCrew;
pub use launcher::Launcher;
pub use launcher_configuration::LauncherConfiguration;
pub use location::Location;
pub use lookups::{
    AgencyType, AstronautStatus, AstronautType, LandingType, LaunchStatus, LauncherStatus,
    NetPrecision, Orbit, PayloadType,
};
pub use mission::Mission;
pub use pad::Pad;
pub use payload::Payload;
pub use payload_flight::PayloadFlight;
