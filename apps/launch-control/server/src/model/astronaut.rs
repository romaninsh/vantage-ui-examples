#[cfg(not(feature = "pg"))]
use crate::db::AnySqliteType;
#[cfg(feature = "pg")]
use crate::db::AnyPostgresType;
use crate::db::Db;
use vantage_table::prelude::IdGenerator;
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::{Agency, AstronautStatus, AstronautType, LaunchCrew};

/// A crew member. Career counts (flights/landings/spacewalks) are intrinsic LL2
/// fields describing the person, kept verbatim — distinct from the stats we
/// recompute from our own launch data. Linked to launches via `launch_crew`.
#[cfg_attr(not(feature = "pg"), entity(SqliteType))]
#[cfg_attr(feature = "pg", entity(PostgresType))]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Astronaut {
    pub name: String,
    pub status_id: Option<String>,
    pub type_id: Option<String>,
    pub agency_id: Option<String>,
    pub nationality: Option<String>,
    pub in_space: Option<bool>,
    pub time_in_space: Option<String>,
    pub eva_time: Option<String>,
    pub age: Option<i64>,
    pub date_of_birth: Option<String>,
    pub date_of_death: Option<String>,
    pub first_flight: Option<String>,
    pub last_flight: Option<String>,
    pub flights_count: Option<i64>,
    pub landings_count: Option<i64>,
    pub spacewalks_count: Option<i64>,
    pub bio: Option<String>,
    pub last_updated: Option<String>,
}

impl Astronaut {
    pub fn table(db: Db) -> Table<Db, Astronaut> {
        Table::new("astronauts", db)
            .with_id_column("id")
            .with_text_id()
            .with_generated_id(IdGenerator::UuidV7)
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("status_id")
            .with_column_of::<Option<String>>("type_id")
            .with_column_of::<Option<String>>("agency_id")
            .with_column_of::<Option<String>>("nationality")
            .with_column_of::<Option<bool>>("in_space")
            .with_column_of::<Option<String>>("time_in_space")
            .with_column_of::<Option<String>>("eva_time")
            .with_column_of::<Option<i64>>("age")
            .with_column_of::<Option<String>>("date_of_birth")
            .with_column_of::<Option<String>>("date_of_death")
            .with_column_of::<Option<String>>("first_flight")
            .with_column_of::<Option<String>>("last_flight")
            .with_column_of::<Option<i64>>("flights_count")
            .with_column_of::<Option<i64>>("landings_count")
            .with_column_of::<Option<i64>>("spacewalks_count")
            .with_column_of::<Option<String>>("bio")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("status", "status_id", AstronautStatus::table)
            .with_one("type", "type_id", AstronautType::table)
            .with_one("agency", "agency_id", Agency::table)
            .with_many("crew_assignments", "astronaut_id", LaunchCrew::table)
    }
}
