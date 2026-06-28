//! SQL connection + schema. The schema stores only intrinsic ("raw") LL2
//! fields plus foreign keys and `last_updated`. Denormalized stat columns LL2
//! ships (total_launch_count, payload mass totals, landing counts, …) are
//! deliberately NOT stored here — they are recomputed as Vantage aggregate
//! expressions on the table models (see `model/`).
//!
//! The backend is selected at compile time: SQLite by default, PostgreSQL under
//! `--features pg`. [`Db`] is the chosen datasource and [`Cell`] its value type;
//! the rest of the app is written against those aliases, never a concrete
//! backend. Models carry both [`AnySqliteType`] and [`AnyPostgresType`] markers
//! (`#[entity(SqliteType, PostgresType)]`) so the same struct works either way.
//!
//! Every id and foreign-key column is `TEXT`. LL2 mixes integer ids (agencies,
//! astronauts, launchers) with UUID ids (launches, payloads); storing them all
//! as text keeps Vantage's generated join predicates (`a.fk = b.id`) comparing
//! like-typed values across both backends. Ids are generated client-side
//! (`IdGenerator::UuidV7` on every table), so no column carries a DB-side
//! default.

use anyhow::Result;
use vantage_table::prelude::TableSource;

// Both backend markers are always in scope for the `#[entity(SqliteType,
// PostgresType)]` annotations, regardless of which `Db` is selected.
pub use vantage_sql::postgres::AnyPostgresType;
pub use vantage_sql::sqlite::AnySqliteType;

/// The selected datasource. SQLite by default; PostgreSQL under `--features pg`.
#[cfg(not(feature = "pg"))]
pub type Db = vantage_sql::sqlite::SqliteDB;
#[cfg(feature = "pg")]
pub type Db = vantage_sql::postgres::PostgresDB;

/// The value/cell type of the selected datasource (`AnySqliteType` /
/// `AnyPostgresType`). Computed columns and the `count_*` helpers are typed
/// `Expression<Cell>` so they are portable across backends.
pub type Cell = <Db as TableSource>::Value;

/// The selected backend's condition-builder trait (`.eq()`, `.in_list()`, …).
/// Re-exported under one name so models bring the right operators into scope
/// with `use crate::db::DbOperation;` regardless of backend.
#[cfg(not(feature = "pg"))]
pub use vantage_sql::sqlite::operation::SqliteOperation as DbOperation;
#[cfg(feature = "pg")]
pub use vantage_sql::postgres::operation::PostgresOperation as DbOperation;

/// Open (creating if absent) the database. SQLite takes a file path; PostgreSQL
/// ignores it and connects via `DATABASE_URL`.
#[cfg_attr(feature = "pg", allow(unused_variables))]
pub async fn connect(path: &str) -> Result<Db> {
    #[cfg(not(feature = "pg"))]
    let url = format!("sqlite:{path}?mode=rwc");
    #[cfg(feature = "pg")]
    let url = std::env::var("DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL must be set for the postgres (`pg`) build"))?;

    Ok(Db::connect(&url).await?)
}

/// Create every table if it does not already exist.
pub async fn create_schema(db: &Db) -> Result<()> {
    for stmt in SCHEMA {
        sqlx::query(stmt).execute(db.pool()).await?;
    }
    // `CREATE TABLE IF NOT EXISTS` never alters an already-seeded `launches`
    // table, so the SQLite build adds the telemetry columns separately. SQLite
    // has no `ADD COLUMN IF NOT EXISTS`; a duplicate-column error just means the
    // migration already ran, so swallow it and keep going. The Postgres schema
    // is greenfield (its `launches` table already lists every column), so it
    // needs no migrations.
    #[cfg(not(feature = "pg"))]
    for stmt in MIGRATIONS {
        if let Err(e) = sqlx::query(stmt).execute(db.pool()).await {
            let msg = e.to_string();
            if !msg.contains("duplicate column name") {
                return Err(e.into());
            }
        }
    }
    Ok(())
}

#[cfg(not(feature = "pg"))]
const SCHEMA: &[&str] = &[
    // ── Lookups (LL2 `config/*` collections) ────────────────────────────────
    "CREATE TABLE IF NOT EXISTS launch_statuses (id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, description TEXT)",
    "CREATE TABLE IF NOT EXISTS net_precisions  (id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, description TEXT)",
    "CREATE TABLE IF NOT EXISTS agency_types     (id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE IF NOT EXISTS payload_types    (id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE IF NOT EXISTS landing_types    (id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, description TEXT)",
    "CREATE TABLE IF NOT EXISTS orbits           (id TEXT PRIMARY KEY, name TEXT, abbrev TEXT)",
    "CREATE TABLE IF NOT EXISTS launcher_statuses(id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE IF NOT EXISTS astronaut_statuses(id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE IF NOT EXISTS astronaut_types  (id TEXT PRIMARY KEY, name TEXT)",

    // ── Core entities ────────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS agencies (
        id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, type_id TEXT,
        featured INTEGER, description TEXT, administrator TEXT,
        founding_year INTEGER, country TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS launcher_configurations (
        id TEXT PRIMARY KEY, name TEXT, full_name TEXT, variant TEXT, family TEXT,
        manufacturer_id TEXT, active INTEGER, reusable INTEGER, description TEXT,
        length REAL, diameter REAL, launch_mass REAL, leo_capacity REAL,
        gto_capacity REAL, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS launchers (
        id TEXT PRIMARY KEY, serial_number TEXT, status_id TEXT, flight_proven INTEGER,
        details TEXT, first_launch_date TEXT, last_launch_date TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY, name TEXT, country TEXT, celestial_body_name TEXT,
        active INTEGER, description TEXT, timezone_name TEXT,
        latitude REAL, longitude REAL, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS pads (
        id TEXT PRIMARY KEY, name TEXT, country TEXT, location_id TEXT, active INTEGER,
        description TEXT, latitude REAL, longitude REAL, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY, name TEXT, mission_type TEXT, description TEXT,
        orbit_id TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS payloads (
        id TEXT PRIMARY KEY, name TEXT, type_id TEXT, manufacturer_id TEXT,
        operator_id TEXT, mass REAL, description TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS payload_flights (
        id TEXT PRIMARY KEY, launch_id TEXT, payload_id TEXT,
        destination TEXT, amount INTEGER, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS astronauts (
        id TEXT PRIMARY KEY, name TEXT, status_id TEXT, type_id TEXT, agency_id TEXT,
        nationality TEXT, in_space INTEGER, time_in_space TEXT, eva_time TEXT, age INTEGER,
        date_of_birth TEXT, date_of_death TEXT, first_flight TEXT, last_flight TEXT,
        flights_count INTEGER, landings_count INTEGER, spacewalks_count INTEGER,
        bio TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS landpads (
        id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, celestial_body_name TEXT,
        active INTEGER, description TEXT, latitude REAL, longitude REAL, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS landings (
        id TEXT PRIMARY KEY, launch_id TEXT, launcher_id TEXT, landing_location_id TEXT,
        type_id TEXT, success INTEGER, attempt INTEGER, description TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS launch_crew (
        id TEXT PRIMARY KEY, launch_id TEXT, astronaut_id TEXT, role TEXT)",

    "CREATE TABLE IF NOT EXISTS launches (
        id TEXT PRIMARY KEY, name TEXT, status_id TEXT, net TEXT, net_precision_id TEXT,
        window_start TEXT, window_end TEXT, launch_designator TEXT, probability INTEGER,
        webcast_live INTEGER, failreason TEXT, lsp_id TEXT, rocket_configuration_id TEXT,
        mission_id TEXT, pad_id TEXT, last_updated TEXT,
        phase TEXT, met_seconds INTEGER, altitude_km REAL, velocity_ms REAL,
        acceleration_ms2 REAL, downrange_km REAL,
        vertical_speed_ms REAL, ground_speed_ms REAL, thrust_kn REAL,
        created_at TEXT, updated_at TEXT)",
];

/// Additive column migrations applied on every SQLite boot. Each runs once; a
/// repeat raises "duplicate column name", which [`create_schema`] treats as
/// success. The Postgres schema is greenfield, so it has no migrations.
#[cfg(not(feature = "pg"))]
const MIGRATIONS: &[&str] = &[
    "ALTER TABLE launches ADD COLUMN phase TEXT",
    "ALTER TABLE launches ADD COLUMN met_seconds INTEGER",
    "ALTER TABLE launches ADD COLUMN altitude_km REAL",
    "ALTER TABLE launches ADD COLUMN velocity_ms REAL",
    "ALTER TABLE launches ADD COLUMN acceleration_ms2 REAL",
    "ALTER TABLE launches ADD COLUMN downrange_km REAL",
    "ALTER TABLE launches ADD COLUMN vertical_speed_ms REAL",
    "ALTER TABLE launches ADD COLUMN ground_speed_ms REAL",
    "ALTER TABLE launches ADD COLUMN thrust_kn REAL",
    "ALTER TABLE launches ADD COLUMN created_at TEXT",
    "ALTER TABLE launches ADD COLUMN updated_at TEXT",
];

// PostgreSQL schema. Identical to the SQLite one except booleans are real
// `BOOLEAN` columns (SQLite has no bool type and stores them as INTEGER), and
// the `launches` table lists every column up front (no additive migrations).
#[cfg(feature = "pg")]
const SCHEMA: &[&str] = &[
    // ── Lookups (LL2 `config/*` collections) ────────────────────────────────
    "CREATE TABLE IF NOT EXISTS launch_statuses (id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, description TEXT)",
    "CREATE TABLE IF NOT EXISTS net_precisions  (id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, description TEXT)",
    "CREATE TABLE IF NOT EXISTS agency_types     (id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE IF NOT EXISTS payload_types    (id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE IF NOT EXISTS landing_types    (id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, description TEXT)",
    "CREATE TABLE IF NOT EXISTS orbits           (id TEXT PRIMARY KEY, name TEXT, abbrev TEXT)",
    "CREATE TABLE IF NOT EXISTS launcher_statuses(id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE IF NOT EXISTS astronaut_statuses(id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE IF NOT EXISTS astronaut_types  (id TEXT PRIMARY KEY, name TEXT)",

    // ── Core entities ────────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS agencies (
        id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, type_id TEXT,
        featured BOOLEAN, description TEXT, administrator TEXT,
        founding_year INTEGER, country TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS launcher_configurations (
        id TEXT PRIMARY KEY, name TEXT, full_name TEXT, variant TEXT, family TEXT,
        manufacturer_id TEXT, active BOOLEAN, reusable BOOLEAN, description TEXT,
        length REAL, diameter REAL, launch_mass REAL, leo_capacity REAL,
        gto_capacity REAL, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS launchers (
        id TEXT PRIMARY KEY, serial_number TEXT, status_id TEXT, flight_proven BOOLEAN,
        details TEXT, first_launch_date TEXT, last_launch_date TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY, name TEXT, country TEXT, celestial_body_name TEXT,
        active BOOLEAN, description TEXT, timezone_name TEXT,
        latitude REAL, longitude REAL, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS pads (
        id TEXT PRIMARY KEY, name TEXT, country TEXT, location_id TEXT, active BOOLEAN,
        description TEXT, latitude REAL, longitude REAL, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY, name TEXT, mission_type TEXT, description TEXT,
        orbit_id TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS payloads (
        id TEXT PRIMARY KEY, name TEXT, type_id TEXT, manufacturer_id TEXT,
        operator_id TEXT, mass REAL, description TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS payload_flights (
        id TEXT PRIMARY KEY, launch_id TEXT, payload_id TEXT,
        destination TEXT, amount INTEGER, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS astronauts (
        id TEXT PRIMARY KEY, name TEXT, status_id TEXT, type_id TEXT, agency_id TEXT,
        nationality TEXT, in_space BOOLEAN, time_in_space TEXT, eva_time TEXT, age INTEGER,
        date_of_birth TEXT, date_of_death TEXT, first_flight TEXT, last_flight TEXT,
        flights_count INTEGER, landings_count INTEGER, spacewalks_count INTEGER,
        bio TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS landpads (
        id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, celestial_body_name TEXT,
        active BOOLEAN, description TEXT, latitude REAL, longitude REAL, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS landings (
        id TEXT PRIMARY KEY, launch_id TEXT, launcher_id TEXT, landing_location_id TEXT,
        type_id TEXT, success BOOLEAN, attempt BOOLEAN, description TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS launch_crew (
        id TEXT PRIMARY KEY, launch_id TEXT, astronaut_id TEXT, role TEXT)",

    "CREATE TABLE IF NOT EXISTS launches (
        id TEXT PRIMARY KEY, name TEXT, status_id TEXT, net TEXT, net_precision_id TEXT,
        window_start TEXT, window_end TEXT, launch_designator TEXT, probability INTEGER,
        webcast_live BOOLEAN, failreason TEXT, lsp_id TEXT, rocket_configuration_id TEXT,
        mission_id TEXT, pad_id TEXT, last_updated TEXT,
        phase TEXT, met_seconds INTEGER, altitude_km REAL, velocity_ms REAL,
        acceleration_ms2 REAL, downrange_km REAL,
        vertical_speed_ms REAL, ground_speed_ms REAL, thrust_kn REAL,
        created_at TEXT, updated_at TEXT)",
];
