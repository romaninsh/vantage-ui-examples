use crate::db::{AnyPostgresType, AnySqliteType, Db};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::{Launch, Pad};

/// A spaceport. Hosts many pads.
#[entity(SqliteType, PostgresType)]
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
    pub fn table(db: Db) -> Table<Db, Location> {
        Table::new("locations", db)
            .with_id_column("id")
            .with_text_id()
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
            // Two-hop rollup: launches whose pad sits at this location.
            .with_expression("total_launch_count", |t| {
                t.query_launches().get_count_query()
            })
    }
}

trait LocationTableExt {
    fn query_launches(&self) -> Table<Db, Launch>;
}

impl LocationTableExt for Table<Db, Location> {
    fn query_launches(&self) -> Table<Db, Launch> {
        // Location → pads (correlated), then pads → launches (IN subquery).
        // get_ref_as embeds the pads condition inside the IN subquery,
        // keeping the location correlation intact.
        let pads = self.get_subquery_as::<Pad>("pads").unwrap();
        pads.get_ref_as::<Launch>("launches").unwrap()
    }
}
