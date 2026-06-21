use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::{Launch, Location};

/// A launch pad. Sits at a location; hosts many launches.
#[entity(SqliteType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Pad {
    pub name: String,
    pub country: Option<String>,
    pub location_id: Option<String>,
    pub active: Option<bool>,
    pub description: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub last_updated: Option<String>,
}

impl Pad {
    pub fn table(db: SqliteDB) -> Table<SqliteDB, Pad> {
        Table::new("pads", db)
            .with_id_column("id")
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("country")
            .with_column_of::<Option<String>>("location_id")
            .with_column_of::<Option<bool>>("active")
            .with_column_of::<Option<String>>("description")
            .with_column_of::<Option<f64>>("latitude")
            .with_column_of::<Option<f64>>("longitude")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("location", "location_id", Location::table)
            .with_many("launches", "pad_id", Launch::table)
            .with_expression("total_launch_count", |t| {
                t.query_launches().get_count_query()
            })
    }
}

trait PadTableExt {
    fn query_launches(&self) -> Table<SqliteDB, Launch>;
}

impl PadTableExt for Table<SqliteDB, Pad> {
    fn query_launches(&self) -> Table<SqliteDB, Launch> {
        self.get_subquery_as("launches").unwrap()
    }
}
