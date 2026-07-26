//! cardroom-client — spawns players that register, join games and play until broke.
//!
//! The point is not poker skill. It is to give the database genuinely
//! concurrent, continuously-changing data, so a change-feed driver has something
//! real to read and the server's own timers and constraints get exercised.
//!
//! ```sh
//! # a fleet: outcomes only, plus a running total
//! cargo run -p cardroom-client -- -n 5
//!
//! # one player: full hand history from that player's point of view
//! cargo run -p cardroom-client -- -n 1
//! ```
//!
//! Run both at once and they share tables. Every run registers **new** players,
//! each with a fresh identity from the host and a name of its own.

mod module_bindings;
mod names;
mod player;
mod report;

use std::sync::Arc;
use std::time::Duration;

use clap::Parser;

use report::Fleet;

#[derive(Parser, Debug, Clone)]
#[command(
    name = "cardroom-client",
    about = "Spawn poker players against a cardroom module"
)]
struct Args {
    /// How many players to spawn.
    ///
    /// With `-n 1` the output is a full hand history from that player's point of
    /// view. With more, it drops to one line per outcome plus a periodic fleet
    /// total — twenty streams of play-by-play is unreadable.
    #[arg(short = 'n', long = "players", default_value_t = 1)]
    players: usize,

    #[arg(long, default_value = "http://127.0.0.1:3000")]
    server: String,

    #[arg(long, default_value = "cardroom")]
    db: String,

    /// Buy-in for games this run creates.
    #[arg(long, default_value_t = 1000)]
    buy_in: i64,

    /// Small blind for games this run creates.
    #[arg(long, default_value_t = 25)]
    small_blind: i64,

    /// Stop after this many games. `0` means play forever.
    ///
    /// Only honoured for a single player: a fleet exists to generate continuous
    /// load, so `-n 5 -c 3` keeps the five playing and says so rather than
    /// quietly doing something you did not ask for.
    #[arg(short = 'c', long = "games", default_value_t = 0)]
    games: u32,

    /// Seconds between fleet scoreboard lines. Ignored with `-n 1`, where the
    /// hand history is the output.
    #[arg(long, default_value_t = 5)]
    report_every: u64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    if args.players == 0 {
        anyhow::bail!("-n must be at least 1");
    }

    // One player is a debugging session; many is a load test. That single fact
    // decides the whole output style.
    let verbose = args.players == 1;
    let fleet = Arc::new(Fleet::new(verbose));

    if args.games > 0 && args.players > 1 {
        println!(
            "note: -c {} ignored — a fleet plays continuously; use -n 1 to bound the games",
            args.games
        );
    }

    println!(
        "cardroom-client → {} / {}   {} player{}   mode: {}",
        args.server,
        args.db,
        args.players,
        if args.players == 1 { "" } else { "s" },
        if verbose {
            "verbose (single player)"
        } else {
            "outcomes only"
        }
    );

    // Each player draws its own name; the number the server ends up accepting is
    // what tells two Ingrid Marchettis apart, whether they are in this run or an
    // earlier one.
    let mut tasks = Vec::with_capacity(args.players);
    for name in (0..args.players).map(|_| names::random_name()) {
        let args = args.clone();
        let fleet = Arc::clone(&fleet);
        // Stagger the starts a little, so players do not all try to create the
        // same first game in the same instant.
        tokio::time::sleep(Duration::from_millis(120)).await;
        tasks.push(tokio::spawn(async move {
            let label = name.clone();
            if let Err(e) = player::run(args, name, Arc::clone(&fleet)).await {
                fleet.outcome(&label, &format!("stopped: {e}"));
            }
        }));
    }

    // The scoreboard only makes sense for a fleet; with one player the hand
    // history already says everything.
    if !verbose {
        let fleet = Arc::clone(&fleet);
        let every = Duration::from_secs(args.report_every.max(1));
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(every).await;
                fleet.report();
            }
        });
    }

    for task in tasks {
        let _ = task.await;
    }

    println!("\n─── final ───");
    fleet.report();
    Ok(())
}

