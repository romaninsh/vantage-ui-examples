//! SQLite connection + schema. The schema stores only intrinsic ("raw") LL2
//! fields plus foreign keys and `last_updated`. Denormalized stat columns LL2
//! ships (total_launch_count, payload mass totals, landing counts, …) are
//! deliberately NOT stored here — they are recomputed as Vantage aggregate
//! expressions on the table models (see `model/`).
//!
//! Every id and foreign-key column is `TEXT`. LL2 mixes integer ids (agencies,
//! astronauts, launchers) with UUID ids (launches, payloads); storing them all
//! as text keeps Vantage's generated join predicates (`a.fk = b.id`) comparing
//! like-typed values, since SQLite does not coerce across storage classes.

use anyhow::Result;
use vantage_sql::sqlite::SqliteDB;

/// Open (creating if absent) the SQLite database at `path`.
pub async fn connect(path: &str) -> Result<SqliteDB> {
    let url = format!("sqlite:{path}?mode=rwc");
    Ok(SqliteDB::connect(&url).await?)
}

/// Create every table if it does not already exist.
pub async fn create_schema(db: &SqliteDB) -> Result<()> {
    for stmt in SCHEMA {
        sqlx::query(stmt).execute(db.pool()).await?;
    }
    Ok(())
}

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

    // Tables the mission simulator inserts into use a SQLite id DEFAULT so
    // `insert_return_id` (which omits the id) gets a generated id back. The
    // seeder always supplies explicit LL2 ids, so it is unaffected.
    "CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), name TEXT, mission_type TEXT, description TEXT,
        orbit_id TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS payloads (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), name TEXT, type_id TEXT, manufacturer_id TEXT,
        operator_id TEXT, mass REAL, description TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS payload_flights (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), launch_id TEXT, payload_id TEXT,
        destination TEXT, amount INTEGER, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS astronauts (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), name TEXT, status_id TEXT, type_id TEXT, agency_id TEXT,
        nationality TEXT, in_space INTEGER, time_in_space TEXT, eva_time TEXT, age INTEGER,
        date_of_birth TEXT, date_of_death TEXT, first_flight TEXT, last_flight TEXT,
        flights_count INTEGER, landings_count INTEGER, spacewalks_count INTEGER,
        bio TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS landpads (
        id TEXT PRIMARY KEY, name TEXT, abbrev TEXT, celestial_body_name TEXT,
        active INTEGER, description TEXT, latitude REAL, longitude REAL, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS landings (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), launch_id TEXT, launcher_id TEXT, landing_location_id TEXT,
        type_id TEXT, success INTEGER, attempt INTEGER, description TEXT, last_updated TEXT)",

    "CREATE TABLE IF NOT EXISTS launch_crew (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), launch_id TEXT, astronaut_id TEXT, role TEXT)",

    "CREATE TABLE IF NOT EXISTS launches (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), name TEXT, status_id TEXT, net TEXT, net_precision_id TEXT,
        window_start TEXT, window_end TEXT, launch_designator TEXT, probability INTEGER,
        webcast_live INTEGER, failreason TEXT, lsp_id TEXT, rocket_configuration_id TEXT,
        mission_id TEXT, pad_id TEXT, last_updated TEXT)",
];
