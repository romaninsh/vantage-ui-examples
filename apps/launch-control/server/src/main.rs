//! launch-control demo server CLI.
//!
//!   launch-control-server seed [--refetch]      seed SQLite from the LL2 fixtures
//!   launch-control-server query <table> [f=v]   introspect a table (raw rows)
//!
//! `serve` (the flaky REST API + launch simulator) arrives in phase 2.

mod db;
mod flaky;
mod model;
mod nest;
mod rest;
mod seed;
mod sim;

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
    /// Serve the deliberately-flaky LL2-compatible REST API.
    Serve {
        #[arg(long, default_value_t = 8080)]
        port: u16,
        /// Probability (0..1) a request is answered with 503.
        #[arg(long, default_value_t = 0.10)]
        error_rate: f64,
        #[arg(long, default_value_t = 150)]
        latency_min: u64,
        #[arg(long, default_value_t = 1200)]
        latency_max: u64,
        /// Seconds per launch-replay step (a full replay is ~3.5 steps).
        #[arg(long, default_value_t = 30)]
        sim_step: u64,
        /// Disable the background launch-replay simulator.
        #[arg(long)]
        no_sim: bool,
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
        Cmd::Serve {
            port,
            error_rate,
            latency_min,
            latency_max,
            sim_step,
            no_sim,
        } => {
            if !no_sim {
                let sim_db = database.clone();
                tokio::spawn(sim::run(
                    sim_db,
                    std::time::Duration::from_secs(sim_step),
                ));
            }
            let state = rest::AppState {
                db: database.clone(),
                flaky: flaky::FlakyConfig {
                    error_rate,
                    latency_min_ms: latency_min,
                    latency_max_ms: latency_max,
                },
            };
            let app = rest::router(state);
            let addr = format!("0.0.0.0:{port}");
            let listener = tokio::net::TcpListener::bind(&addr).await?;
            println!(
                "launch-control serving on http://127.0.0.1:{port}  \
                 (error_rate={error_rate}, latency={latency_min}-{latency_max}ms, \
                 sim={})",
                if no_sim { "off" } else { "on" }
            );
            axum::serve(listener, app).await?;
        }
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
