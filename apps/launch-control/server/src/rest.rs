//! LL2-compatible REST API, served through the **Vista** facade (the same read
//! surface the api-client UI talks to) rather than raw Tables.
//!
//! One generic handler serves `GET /{table}/`:
//!   - `?mode=list|normal|detailed` — detailed nests belongs-to relations
//!   - `?limit` / `?offset` — windowed via `Vista::fetch_window`
//!   - `?ordering=net` / `?ordering=-net` — `Vista::add_order`
//!   - `?search=` — `Vista::add_search`
//!   - any other `field=value` — an LL2 filter param, mapped to a column and
//!     applied via `Vista::add_condition_eq` (so `?launch__id=…` actually
//!     filters, unlike real LL2)
//!
//! Response envelope matches LL2: `{ "count", "next", "previous", "results" }`.

use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use ciborium::Value as Cbor;
use serde_json::{Value, json};
use vantage_sql::sqlite::SqliteDB;
use vantage_vista::{SortDirection, Vista};

use crate::flaky::FlakyConfig;
use crate::model::*;
use crate::nest;

/// Deepest belongs-to nesting for `?mode=detailed` (launch → pad → location).
const NEST_DEPTH: u8 = 2;

#[derive(Clone)]
pub struct AppState {
    pub db: SqliteDB,
    pub flaky: FlakyConfig,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/{table}/", get(list))
        .route("/{table}", get(list))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::flaky::middleware,
        ))
        .with_state(state)
}

async fn list(
    State(state): State<AppState>,
    Path(table): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    let mode = params.get("mode").map(String::as_str).unwrap_or("list");
    let limit = parse(&params, "limit").unwrap_or(50);
    let offset = parse(&params, "offset").unwrap_or(0);

    let mut vista = vista_for(&state.db, &table)?;

    for (key, value) in &params {
        if is_reserved(key) {
            continue;
        }
        let column = to_column(key);
        if vista.get_column(&column).is_some() {
            let _ = vista.add_condition_eq(column, Cbor::Text(value.clone()));
        }
    }
    if let Some(text) = params.get("search") {
        let _ = vista.add_search(text.clone());
    }
    if let Some(ordering) = params.get("ordering") {
        let (column, dir) = match ordering.strip_prefix('-') {
            Some(rest) => (rest, SortDirection::Descending),
            None => (ordering.as_str(), SortDirection::Ascending),
        };
        let _ = vista.add_order(column, dir); // best-effort; ignore non-orderable
    }

    let count = vista.get_count().await?;
    let rows = vista.fetch_window(offset, limit).await?;

    let detailed = mode == "detailed";
    let mut results = Vec::with_capacity(rows.len());
    for (_id, row) in &rows {
        results.push(nest::row_to_json(&vista, row, detailed, NEST_DEPTH).await);
    }

    Ok(Json(json!({
        "count": count,
        "next": Value::Null,
        "previous": Value::Null,
        "results": results,
    })))
}

/// Build a Vista for a table name. One `match`; every arm yields a `Vista`.
fn vista_for(db: &SqliteDB, table: &str) -> Result<Vista, ApiError> {
    let f = db.vista_factory();
    let built = match table {
        "launches" => f.from_table(Launch::table(db.clone())),
        "agencies" => f.from_table(Agency::table(db.clone())),
        "launcher_configurations" => f.from_table(LauncherConfiguration::table(db.clone())),
        "launchers" => f.from_table(Launcher::table(db.clone())),
        "pads" => f.from_table(Pad::table(db.clone())),
        "locations" => f.from_table(Location::table(db.clone())),
        "missions" => f.from_table(Mission::table(db.clone())),
        "payloads" => f.from_table(Payload::table(db.clone())),
        "payload_flights" => f.from_table(PayloadFlight::table(db.clone())),
        "astronauts" => f.from_table(Astronaut::table(db.clone())),
        "landings" => f.from_table(Landing::table(db.clone())),
        "landpads" => f.from_table(Landpad::table(db.clone())),
        "launch_crew" => f.from_table(LaunchCrew::table(db.clone())),
        "launch_statuses" => f.from_table(LaunchStatus::table(db.clone())),
        "net_precisions" => f.from_table(NetPrecision::table(db.clone())),
        "agency_types" => f.from_table(AgencyType::table(db.clone())),
        "payload_types" => f.from_table(PayloadType::table(db.clone())),
        "landing_types" => f.from_table(LandingType::table(db.clone())),
        "orbits" => f.from_table(Orbit::table(db.clone())),
        "launcher_statuses" => f.from_table(LauncherStatus::table(db.clone())),
        "astronaut_statuses" => f.from_table(AstronautStatus::table(db.clone())),
        "astronaut_types" => f.from_table(AstronautType::table(db.clone())),
        other => {
            return Err(ApiError(
                StatusCode::NOT_FOUND,
                format!("unknown table `{other}`"),
            ));
        }
    };
    built.map_err(ApiError::from)
}

/// Map an LL2 filter parameter to one of our column names. LL2 uses `__` to
/// traverse (`lsp__id`, `rocket__configuration__id`); we flatten that to `_`.
/// `pad` is LL2's bare-id shorthand for the launch's pad.
fn to_column(param: &str) -> String {
    match param {
        "pad" => "pad_id".to_string(),
        other => other.replace("__", "_"),
    }
}

fn is_reserved(key: &str) -> bool {
    matches!(key, "mode" | "limit" | "offset" | "ordering" | "search" | "format")
}

fn parse(params: &HashMap<String, String>, key: &str) -> Option<usize> {
    params.get(key).and_then(|s| s.parse().ok())
}

/// JSON error envelope, rendered with an HTTP status.
struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "detail": self.1 }))).into_response()
    }
}

impl From<vantage_core::VantageError> for ApiError {
    fn from(e: vantage_core::VantageError) -> Self {
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    }
}
