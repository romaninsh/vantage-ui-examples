use vantage_dataset::prelude::InsertableDataSet;
use vantage_expressions::{Expression, expr_any};
use vantage_table::prelude::IdGenerator;
use vantage_table::table::Table;
use vantage_types::entity;

#[cfg(not(feature = "pg"))]
use crate::db::AnySqliteType;
#[cfg(feature = "pg")]
use crate::db::AnyPostgresType;
use crate::db::{Cell, Db, DbOperation};
use crate::model::{
    Agency, Landing, LaunchCrew, LaunchStatus, LauncherConfiguration, Mission, NetPrecision, Pad,
    Payload, PayloadFlight,
};

/// The hub entity. Belongs to a status, provider (agency), rocket
/// configuration, mission and pad; has many payload flights, landings and
/// crew assignments.
#[cfg_attr(not(feature = "pg"), entity(SqliteType))]
#[cfg_attr(feature = "pg", entity(PostgresType))]
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
    // Flight telemetry — written live by the mission simulator's ascent phase.
    pub phase: Option<String>,
    pub met_seconds: Option<i64>,
    pub altitude_km: Option<f64>,
    pub velocity_ms: Option<f64>,
    pub acceleration_ms2: Option<f64>,
    pub downrange_km: Option<f64>,
    // Per-axis speed components and engine thrust (0 after MECO). The summary
    // view projects altitude/downrange from these rates between samples.
    pub vertical_speed_ms: Option<f64>,
    pub ground_speed_ms: Option<f64>,
    pub thrust_kn: Option<f64>,
    // Audit stamps, filled by the table's `with_timestamps` hook: `created_at`
    // once on insert, `updated_at` on every write.
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

impl Launch {
    pub fn table(db: Db) -> Table<Db, Launch> {
        Table::new("launches", db)
            .with_id_column("id")
            .with_text_id()
            .with_generated_id(IdGenerator::UuidV7)
            .with_timestamps()
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
            .with_column_of::<Option<String>>("phase")
            .with_column_of::<Option<i64>>("met_seconds")
            .with_column_of::<Option<f64>>("altitude_km")
            .with_column_of::<Option<f64>>("velocity_ms")
            .with_column_of::<Option<f64>>("acceleration_ms2")
            .with_column_of::<Option<f64>>("downrange_km")
            .with_column_of::<Option<f64>>("vertical_speed_ms")
            .with_column_of::<Option<f64>>("ground_speed_ms")
            .with_column_of::<Option<f64>>("thrust_kn")
            .with_column_of::<Option<String>>("created_at")
            .with_column_of::<Option<String>>("updated_at")
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
            // Computed aggregates (phase 3) — LL2 stores these denormalized; we don't.
            .with_expression("payload_count", |t| {
                t.query_payload_flights().get_count_query()
            })
            .with_expression("crew_count", |t| t.query_launch_crew().get_count_query())
            // Two-hop rollup: sum payload mass across this launch's payloads.
            // Built from relation traversal, not raw SQL: launch → payload_flights
            // (correlated) → payloads (`IN (subquery)`), then a portable
            // `get_sum_query` over `mass`. `COALESCE(..., 0)` keeps an empty
            // launch at 0 rather than null.
            .with_expression("total_payload_mass", |t| {
                let payloads = t
                    .query_payload_flights()
                    .get_ref_as::<Payload>("payload")
                    .unwrap();
                expr_any!("COALESCE({}, 0)", (payloads.get_sum_query(&payloads["mass"])))
            })
    }
}

/// The few fields a launch is born with; the rest are populated by the mission
/// simulator over its lifetime. Maps from the `POST /sim/launches` body.
pub(crate) struct NewLaunch {
    pub name: String,
    pub lsp_id: Option<String>,
    pub pad_id: Option<String>,
    pub rocket_configuration_id: Option<String>,
}

/// Launch-side query helpers.
/// - `new_launch` is the domain create verb: insert an unscheduled launch and
///   return its generated id.
/// - The `query_*` methods produce correlated subqueries used by Launch's own
///   computed expressions.
/// - The `count_*` methods narrow a Launches subquery by status and return its
///   `COUNT(*)` — used by the launch-count aggregates on agencies, rocket
///   configurations and pads.
pub(crate) trait LaunchTableExt {
    async fn new_launch(&self, args: NewLaunch) -> anyhow::Result<String>;
    fn query_payload_flights(&self) -> Table<Db, PayloadFlight>;
    fn query_launch_crew(&self) -> Table<Db, LaunchCrew>;
    fn count_successful(self) -> Expression<Cell>;
    fn count_failed(self) -> Expression<Cell>;
    fn count_pending(self) -> Expression<Cell>;
}

impl LaunchTableExt for Table<Db, Launch> {
    async fn new_launch(&self, args: NewLaunch) -> anyhow::Result<String> {
        let launch = Launch {
            name: args.name,
            status_id: Some("2".into()), // To Be Determined
            phase: Some("countdown".into()),
            lsp_id: args.lsp_id,
            pad_id: args.pad_id,
            rocket_configuration_id: args.rocket_configuration_id,
            last_updated: Some(now_ll2()),
            ..Default::default()
        };
        let id = self.insert_return_id(&launch).await?;
        Ok(id)
    }

    fn query_payload_flights(&self) -> Table<Db, PayloadFlight> {
        self.get_subquery_as("payload_flights").unwrap()
    }

    fn query_launch_crew(&self) -> Table<Db, LaunchCrew> {
        self.get_subquery_as("launch_crew").unwrap()
    }

    fn count_successful(self) -> Expression<Cell> {
        let cond = self["status_id"].eq("3");
        self.with_condition(cond).get_count_query()
    }

    fn count_failed(self) -> Expression<Cell> {
        let cond = self["status_id"].in_list(&["4", "7"]);
        self.with_condition(cond).get_count_query()
    }

    fn count_pending(self) -> Expression<Cell> {
        let cond = self["status_id"].not_in_list(&["3", "4", "7"]);
        self.with_condition(cond).get_count_query()
    }
}

/// Current time in LL2's `last_updated` format, e.g. `2026-06-21T12:00:00Z`.
fn now_ll2() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}
