use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::Landing;
use crate::model::landing::LandingTableExt;

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
            .with_expression("total_landing_count", |t| {
                t.query_landings().get_count_query()
            })
            .with_expression("successful_landings", |t| {
                t.query_landings().count_successful()
            })
            .with_expression("failed_landings", |t| t.query_landings().count_failed())
    }
}

trait LandpadTableExt {
    fn query_landings(&self) -> Table<SqliteDB, Landing>;
}

impl LandpadTableExt for Table<SqliteDB, Landpad> {
    fn query_landings(&self) -> Table<SqliteDB, Landing> {
        self.get_subquery_as("landings").unwrap()
    }
}
