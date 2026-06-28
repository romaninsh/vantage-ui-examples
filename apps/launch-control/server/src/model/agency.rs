use vantage_expressions::{Expressive, expr_any};
use vantage_sql::primitives::Case;
use vantage_table::table::Table;
use vantage_types::entity;

use crate::db::{AnyPostgresType, AnySqliteType, Db};
use crate::model::launch::LaunchTableExt;
use crate::model::{AgencyType, Launch, LauncherConfiguration};

/// A launch service provider / manufacturer. Has many launches (as the LSP).
#[entity(SqliteType, PostgresType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Agency {
    pub name: String,
    pub abbrev: Option<String>,
    pub type_id: Option<String>,
    pub featured: Option<bool>,
    pub description: Option<String>,
    pub administrator: Option<String>,
    pub founding_year: Option<i64>,
    pub country: Option<String>,
    pub last_updated: Option<String>,
}

impl Agency {
    pub fn table(db: Db) -> Table<Db, Agency> {
        Table::new("agencies", db)
            .with_id_column("id")
            .with_text_id()
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("abbrev")
            .with_column_of::<Option<String>>("type_id")
            .with_column_of::<Option<bool>>("featured")
            .with_column_of::<Option<String>>("description")
            .with_column_of::<Option<String>>("administrator")
            .with_column_of::<Option<i64>>("founding_year")
            .with_column_of::<Option<String>>("country")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("type", "type_id", AgencyType::table)
            .with_many("launches", "lsp_id", Launch::table)
            .with_many("configs", "manufacturer_id", LauncherConfiguration::table)
            .with_expression("total_launch_count", |t| {
                t.query_launches().get_count_query()
            })
            .with_expression("successful_launches", |t| {
                t.query_launches().count_successful()
            })
            .with_expression("failed_launches", |t| t.query_launches().count_failed())
            .with_expression("pending_launches", |t| t.query_launches().count_pending())
            // Exercise (see the launch-control tour): add a `success_rate`
            // aggregate here — successful / total as a percentage, computed on
            // read like the counts above — then surface it in table/agencies.yaml.
            // `has_rockets` is computed, not stored: `"true"` when the agency
            // manufactures at least one launcher configuration. Text-valued so
            // the server-side `add_condition_eq("has_rockets", true)` (query
            // param `has_rockets=true`, compared as text) matches. Built from the
            // portable `Case` primitive so it renders on either backend.
            .with_expression("has_rockets", |t| {
                Case::new()
                    .when(
                        expr_any!("({}) > 0", (t.query_configs().get_count_query())),
                        expr_any!("'true'"),
                    )
                    .else_(expr_any!("'false'"))
                    .expr()
            })
    }
}

trait AgencyTableExt {
    fn query_launches(&self) -> Table<Db, Launch>;
    fn query_configs(&self) -> Table<Db, LauncherConfiguration>;
}

impl AgencyTableExt for Table<Db, Agency> {
    fn query_launches(&self) -> Table<Db, Launch> {
        self.get_subquery_as("launches").unwrap()
    }
    fn query_configs(&self) -> Table<Db, LauncherConfiguration> {
        self.get_subquery_as("configs").unwrap()
    }
}
