use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::{
    Agency, LaunchCrew, LaunchStatus, Landing, LauncherConfiguration, Mission, NetPrecision, Pad,
    PayloadFlight,
};

/// The hub entity. Belongs to a status, provider (agency), rocket
/// configuration, mission and pad; has many payload flights, landings and
/// crew assignments.
#[entity(SqliteType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Launch {
    pub name: String,
    pub status_id: Option<String>,
    pub net: Option<String>,
    pub net_precision_id: Option<String>,
    pub window_start: Option<String>,
    pub window_end: Option<String>,
    pub launch_designator: Option<String>,
    pub probability: Option<i64>,
    pub webcast_live: Option<bool>,
    pub failreason: Option<String>,
    pub lsp_id: Option<String>,
    pub rocket_configuration_id: Option<String>,
    pub mission_id: Option<String>,
    pub pad_id: Option<String>,
    pub last_updated: Option<String>,
}

impl Launch {
    pub fn table(db: SqliteDB) -> Table<SqliteDB, Launch> {
        Table::new("launches", db)
            .with_id_column("id")
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("status_id")
            .with_column_of::<Option<String>>("net")
            .with_column_of::<Option<String>>("net_precision_id")
            .with_column_of::<Option<String>>("window_start")
            .with_column_of::<Option<String>>("window_end")
            .with_column_of::<Option<String>>("launch_designator")
            .with_column_of::<Option<i64>>("probability")
            .with_column_of::<Option<bool>>("webcast_live")
            .with_column_of::<Option<String>>("failreason")
            .with_column_of::<Option<String>>("lsp_id")
            .with_column_of::<Option<String>>("rocket_configuration_id")
            .with_column_of::<Option<String>>("mission_id")
            .with_column_of::<Option<String>>("pad_id")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("status", "status_id", LaunchStatus::table)
            .with_one("net_precision", "net_precision_id", NetPrecision::table)
            .with_one("launch_service_provider", "lsp_id", Agency::table)
            .with_one(
                "rocket_configuration",
                "rocket_configuration_id",
                LauncherConfiguration::table,
            )
            .with_one("mission", "mission_id", Mission::table)
            .with_one("pad", "pad_id", Pad::table)
            .with_many("payload_flights", "launch_id", PayloadFlight::table)
            .with_many("landings", "launch_id", Landing::table)
            .with_many("launch_crew", "launch_id", LaunchCrew::table)
    }
}
