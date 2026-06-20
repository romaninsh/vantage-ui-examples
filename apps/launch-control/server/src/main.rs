//! launch-control demo server CLI.
//!
//!   launch-control-server seed [--refetch]      seed SQLite from the LL2 fixtures
//!   launch-control-server query <table> [f=v]   introspect a table (raw rows)
//!
//! `serve` (the flaky REST API + launch simulator) arrives in phase 2.

mod db;
mod model;
mod seed;

use anyhow::Result;
use clap::{Parser, Subcommand};
use indexmap::IndexMap;
use vantage_dataset::traits::ReadableValueSet;
use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_types::Record;

const DB_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/launch.sqlite");

#[derive(Parser)]
#[command(name = "launch-control-server", about = "Self-hosted, flaky LL2 demo server")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Seed the SQLite database from the committed LL2 fixtures.
    Seed {
        /// Re-pull the fixtures from lldev before seeding.
        #[arg(long)]
        refetch: bool,
    },
    /// List a table's raw rows, optionally filtered by `field=value`.
    Query {
        /// Table name, e.g. launches, agencies, payload_flights.
        table: String,
        /// Optional `field=value` filter (substring match).
        filter: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let database = db::connect(DB_PATH).await?;
    db::create_schema(&database).await?;

    match cli.cmd {
        Cmd::Seed { refetch } => {
            if refetch {
                seed::refetch().await?;
            }
            seed::seed(&database).await?;
        }
        Cmd::Query { table, filter } => query(&database, &table, filter.as_deref()).await?,
    }
    Ok(())
}

type Rows = IndexMap<String, Record<AnySqliteType>>;

async fn query(db: &SqliteDB, table: &str, filter: Option<&str>) -> Result<()> {
    let rows = list_table(db, table).await?;
    let (field, value) = match filter.and_then(|f| f.split_once('=')) {
        Some((f, v)) => (Some(f), Some(v)),
        None => (None, None),
    };

    let mut shown = 0;
    for (id, record) in &rows {
        if let (Some(field), Some(value)) = (field, value) {
            let matches = record
                .get(field)
                .map(|cell| cell.to_string().trim_matches('\'') == value)
                .unwrap_or(false);
            if !matches {
                continue;
            }
        }
        println!("{id}");
        for (k, v) in record.iter() {
            println!("  {k}: {v}");
        }
        shown += 1;
    }
    println!("({shown} row{})", if shown == 1 { "" } else { "s" });
    Ok(())
}

/// Build the requested table and return its rows as raw value records. One
/// `match` over the table name; every arm yields the same uniform type.
async fn list_table(db: &SqliteDB, table: &str) -> Result<Rows> {
    use model::*;
    let rows = match table {
        "launches" => Launch::table(db.clone()).list_values().await?,
        "agencies" => Agency::table(db.clone()).list_values().await?,
        "launcher_configurations" => LauncherConfiguration::table(db.clone()).list_values().await?,
        "launchers" => Launcher::table(db.clone()).list_values().await?,
        "pads" => Pad::table(db.clone()).list_values().await?,
        "locations" => Location::table(db.clone()).list_values().await?,
        "missions" => Mission::table(db.clone()).list_values().await?,
        "payloads" => Payload::table(db.clone()).list_values().await?,
        "payload_flights" => PayloadFlight::table(db.clone()).list_values().await?,
        "astronauts" => Astronaut::table(db.clone()).list_values().await?,
        "landings" => Landing::table(db.clone()).list_values().await?,
        "landpads" => Landpad::table(db.clone()).list_values().await?,
        "launch_crew" => LaunchCrew::table(db.clone()).list_values().await?,
        "launch_statuses" => LaunchStatus::table(db.clone()).list_values().await?,
        "net_precisions" => NetPrecision::table(db.clone()).list_values().await?,
        "agency_types" => AgencyType::table(db.clone()).list_values().await?,
        "payload_types" => PayloadType::table(db.clone()).list_values().await?,
        "landing_types" => LandingType::table(db.clone()).list_values().await?,
        "orbits" => Orbit::table(db.clone()).list_values().await?,
        "launcher_statuses" => LauncherStatus::table(db.clone()).list_values().await?,
        "astronaut_statuses" => AstronautStatus::table(db.clone()).list_values().await?,
        "astronaut_types" => AstronautType::table(db.clone()).list_values().await?,
        other => anyhow::bail!("unknown table `{other}`"),
    };
    Ok(rows)
}
