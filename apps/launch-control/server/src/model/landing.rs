use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::{Landpad, Launch, Launcher, LandingType};

/// A booster landing attempt for a launch. `success` is null until the attempt
/// resolves — the simulator flips it during a replay.
#[entity(SqliteType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Landing {
    pub launch_id: Option<String>,
    pub launcher_id: Option<String>,
    pub landing_location_id: Option<String>,
    pub type_id: Option<String>,
    pub success: Option<bool>,
    pub attempt: Option<bool>,
    pub description: Option<String>,
    pub last_updated: Option<String>,
}

impl Landing {
    pub fn table(db: SqliteDB) -> Table<SqliteDB, Landing> {
        Table::new("landings", db)
            .with_id_column("id")
            .with_column_of::<Option<String>>("launch_id")
            .with_column_of::<Option<String>>("launcher_id")
            .with_column_of::<Option<String>>("landing_location_id")
            .with_column_of::<Option<String>>("type_id")
            .with_column_of::<Option<bool>>("success")
            .with_column_of::<Option<bool>>("attempt")
            .with_column_of::<Option<String>>("description")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("launch", "launch_id", Launch::table)
            .with_one("launcher", "launcher_id", Launcher::table)
            .with_one("landing_location", "landing_location_id", Landpad::table)
            .with_one("type", "type_id", LandingType::table)
    }
}
