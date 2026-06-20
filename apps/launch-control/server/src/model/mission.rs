use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::Orbit;

/// A launch's mission. Targets an orbit.
#[entity(SqliteType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Mission {
    pub name: String,
    pub mission_type: Option<String>,
    pub description: Option<String>,
    pub orbit_id: Option<String>,
    pub last_updated: Option<String>,
}

impl Mission {
    pub fn table(db: SqliteDB) -> Table<SqliteDB, Mission> {
        Table::new("missions", db)
            .with_id_column("id")
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("mission_type")
            .with_column_of::<Option<String>>("description")
            .with_column_of::<Option<String>>("orbit_id")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("orbit", "orbit_id", Orbit::table)
    }
}
