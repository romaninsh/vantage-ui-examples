use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::aggregates;
use crate::model::{Landing, LauncherStatus};

/// A physical booster (a "core"), identified by serial number. Accumulates many
/// landing attempts across its flights.
#[entity(SqliteType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Launcher {
    pub serial_number: Option<String>,
    pub status_id: Option<String>,
    pub flight_proven: Option<bool>,
    pub details: Option<String>,
    pub first_launch_date: Option<String>,
    pub last_launch_date: Option<String>,
    pub last_updated: Option<String>,
}

impl Launcher {
    pub fn table(db: SqliteDB) -> Table<SqliteDB, Launcher> {
        Table::new("launchers", db)
            .with_id_column("id")
            .with_column_of::<Option<String>>("serial_number")
            .with_column_of::<Option<String>>("status_id")
            .with_column_of::<Option<bool>>("flight_proven")
            .with_column_of::<Option<String>>("details")
            .with_column_of::<Option<String>>("first_launch_date")
            .with_column_of::<Option<String>>("last_launch_date")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("status", "status_id", LauncherStatus::table)
            .with_many("landings", "launcher_id", Landing::table)
            .with_expression("total_landing_count", aggregates::landing_count)
            .with_expression("successful_landings", aggregates::successful_landings)
            .with_expression("failed_landings", aggregates::failed_landings)
    }
}
