use vantage_expressions::Expression;
use vantage_table::table::Table;
use vantage_types::entity;

#[cfg(not(feature = "pg"))]
use crate::db::AnySqliteType;
#[cfg(feature = "pg")]
use crate::db::AnyPostgresType;
use crate::db::{Cell, Db, DbOperation};
use crate::model::{LandingType, Landpad, Launch, Launcher};

/// A booster landing attempt for a launch. `success` is null until the attempt
/// resolves — the simulator flips it during a replay.
#[cfg_attr(not(feature = "pg"), entity(SqliteType))]
#[cfg_attr(feature = "pg", entity(PostgresType))]
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
    pub fn table(db: Db) -> Table<Db, Landing> {
        Table::new("landings", db)
            .with_id_column("id")
            .with_text_id()
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

/// Landing-side query helper, parallel to [`LaunchTableExt`]: narrow a
/// landings subquery by outcome and return its `COUNT(*)` expression.
pub(crate) trait LandingTableExt {
    fn count_successful(self) -> Expression<Cell>;
    fn count_failed(self) -> Expression<Cell>;
}

impl LandingTableExt for Table<Db, Landing> {
    fn count_successful(self) -> Expression<Cell> {
        let cond = self["success"].eq(true);
        self.with_condition(cond).get_count_query()
    }

    fn count_failed(self) -> Expression<Cell> {
        let cond = self["success"].eq(false);
        self.with_condition(cond).get_count_query()
    }
}
