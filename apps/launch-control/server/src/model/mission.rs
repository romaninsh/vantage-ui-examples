#[cfg(not(feature = "pg"))]
use crate::db::AnySqliteType;
#[cfg(feature = "pg")]
use crate::db::AnyPostgresType;
use crate::db::Db;
use vantage_table::prelude::IdGenerator;
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::Orbit;

/// A launch's mission. Targets an orbit.
#[cfg_attr(not(feature = "pg"), entity(SqliteType))]
#[cfg_attr(feature = "pg", entity(PostgresType))]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Mission {
    pub name: String,
    pub mission_type: Option<String>,
    pub description: Option<String>,
    pub orbit_id: Option<String>,
    pub last_updated: Option<String>,
}

impl Mission {
    pub fn table(db: Db) -> Table<Db, Mission> {
        Table::new("missions", db)
            .with_id_column("id")
            .with_text_id()
            .with_generated_id(IdGenerator::UuidV7)
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("mission_type")
            .with_column_of::<Option<String>>("description")
            .with_column_of::<Option<String>>("orbit_id")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("orbit", "orbit_id", Orbit::table)
    }
}
