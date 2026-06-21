use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::launch::LaunchTableExt;
use crate::model::{Agency, Launch};

/// A rocket design (e.g. "Falcon 9 Block 5"). Built by a manufacturer (agency);
/// flown by many launches.
#[entity(SqliteType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct LauncherConfiguration {
    pub name: String,
    pub full_name: Option<String>,
    pub variant: Option<String>,
    pub family: Option<String>,
    pub manufacturer_id: Option<String>,
    pub active: Option<bool>,
    pub reusable: Option<bool>,
    pub description: Option<String>,
    pub length: Option<f64>,
    pub diameter: Option<f64>,
    pub launch_mass: Option<f64>,
    pub leo_capacity: Option<f64>,
    pub gto_capacity: Option<f64>,
    pub last_updated: Option<String>,
}

impl LauncherConfiguration {
    pub fn table(db: SqliteDB) -> Table<SqliteDB, LauncherConfiguration> {
        Table::new("launcher_configurations", db)
            .with_id_column("id")
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("full_name")
            .with_column_of::<Option<String>>("variant")
            .with_column_of::<Option<String>>("family")
            .with_column_of::<Option<String>>("manufacturer_id")
            .with_column_of::<Option<bool>>("active")
            .with_column_of::<Option<bool>>("reusable")
            .with_column_of::<Option<String>>("description")
            .with_column_of::<Option<f64>>("length")
            .with_column_of::<Option<f64>>("diameter")
            .with_column_of::<Option<f64>>("launch_mass")
            .with_column_of::<Option<f64>>("leo_capacity")
            .with_column_of::<Option<f64>>("gto_capacity")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("manufacturer", "manufacturer_id", Agency::table)
            .with_many("launches", "rocket_configuration_id", Launch::table)
            .with_expression("total_launch_count", |t| {
                t.query_launches().get_count_query()
            })
            .with_expression("successful_launches", |t| {
                t.query_launches().count_successful()
            })
            .with_expression("failed_launches", |t| t.query_launches().count_failed())
            .with_expression("pending_launches", |t| t.query_launches().count_pending())
    }
}

trait LauncherConfigurationTableExt {
    fn query_launches(&self) -> Table<SqliteDB, Launch>;
}

impl LauncherConfigurationTableExt for Table<SqliteDB, LauncherConfiguration> {
    fn query_launches(&self) -> Table<SqliteDB, Launch> {
        self.get_subquery_as("launches").unwrap()
    }
}
