//! cardroom-client — spawns players that register, join games and play until broke.
//!
//! The point is not poker skill. It is to give the database genuinely
//! concurrent, continuously-changing data, so a change-feed driver has something
//! real to read and the server's own timers and constraints get exercised.
//!
//! ```sh
//! # a fleet: outcomes only, plus a running total
//! cargo run -p cardroom-client -- -n 5 --prefix fleet
//!
//! # one player: full hand history from that player's point of view
//! cargo run -p cardroom-client -- -n 1 --prefix solo
//! ```
//!
//! Run both at once and they share tables. Every run registers **new** players
//! with fresh identities and a random tag, so repeated and concurrent runs never
//! collide; `--prefix` is only there to make the output readable.

mod module_bindings;
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

    /// Labels this run's players, e.g. `fleet-k3f9-0`.
    ///
    /// Every run generates fresh identities and a random tag, so two runs never
    /// collide even with the same prefix — the prefix is only there to make the
    /// output readable when several are going at once.
    #[arg(long, default_value = "player")]
    prefix: String,

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

    // A short random tag per run. Handles are unique in the module, so without
    // this a second run would try to register names the first run already owns —
    // under a different identity, which the server rightly refuses.
    let run_tag = random_tag();

    println!(
        "cardroom-client → {} / {}   {} player{} as {}-{}-*   mode: {}",
        args.server,
        args.db,
        args.players,
        if args.players == 1 { "" } else { "s" },
        args.prefix,
        run_tag,
        if verbose {
            "verbose (single player)"
        } else {
            "outcomes only"
        }
    );

    let mut tasks = Vec::with_capacity(args.players);
    for index in 0..args.players {
        let args = args.clone();
        let fleet = Arc::clone(&fleet);
        let tag = run_tag.clone();
        // Stagger the starts a little, so players do not all try to create the
        // same first game in the same instant.
        tokio::time::sleep(Duration::from_millis(120)).await;
        tasks.push(tokio::spawn(async move {
            if let Err(e) = player::run(args, &tag, index, Arc::clone(&fleet)).await {
                fleet.outcome(&format!("player{index}"), &format!("stopped: {e}"));
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

/// Four base-36 characters — enough to keep concurrent and repeated runs apart
/// without making the handles unreadable.
fn random_tag() -> String {
    let mut n: u32 = rand::random::<u32>() % (36u32.pow(4));
    let digits = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = [b'0'; 4];
    for slot in out.iter_mut().rev() {
        *slot = digits[(n % 36) as usize];
        n /= 36;
    }
    String::from_utf8_lossy(&out).into_owned()
}
