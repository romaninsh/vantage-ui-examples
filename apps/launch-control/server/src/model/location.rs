use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::Pad;

/// A spaceport. Hosts many pads.
#[entity(SqliteType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Location {
    pub name: String,
    pub country: Option<String>,
    pub celestial_body_name: Option<String>,
    pub active: Option<bool>,
    pub description: Option<String>,
    pub timezone_name: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub last_updated: Option<String>,
}

impl Location {
    pub fn table(db: SqliteDB) -> Table<SqliteDB, Location> {
        Table::new("locations", db)
            .with_id_column("id")
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("country")
            .with_column_of::<Option<String>>("celestial_body_name")
            .with_column_of::<Option<bool>>("active")
            .with_column_of::<Option<String>>("description")
            .with_column_of::<Option<String>>("timezone_name")
            .with_column_of::<Option<f64>>("latitude")
            .with_column_of::<Option<f64>>("longitude")
            .with_column_of::<Option<String>>("last_updated")
            .with_many("pads", "location_id", Pad::table)
    }
}
