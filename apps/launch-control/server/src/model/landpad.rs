use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::aggregates;
use crate::model::Landing;

/// A landing location (ground pad or drone ship). Receives many landings.
#[entity(SqliteType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Landpad {
    pub name: String,
    pub abbrev: Option<String>,
    pub celestial_body_name: Option<String>,
    pub active: Option<bool>,
    pub description: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub last_updated: Option<String>,
}

impl Landpad {
    pub fn table(db: SqliteDB) -> Table<SqliteDB, Landpad> {
        Table::new("landpads", db)
            .with_id_column("id")
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("abbrev")
            .with_column_of::<Option<String>>("celestial_body_name")
            .with_column_of::<Option<bool>>("active")
            .with_column_of::<Option<String>>("description")
            .with_column_of::<Option<f64>>("latitude")
            .with_column_of::<Option<f64>>("longitude")
            .with_column_of::<Option<String>>("last_updated")
            .with_many("landings", "landing_location_id", Landing::table)
            .with_expression("total_landing_count", aggregates::landing_count)
            .with_expression("successful_landings", aggregates::successful_landings)
            .with_expression("failed_landings", aggregates::failed_landings)
    }
}
