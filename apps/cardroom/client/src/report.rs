//! Output: a hand history for one player, or a fleet scoreboard for many.
//!
//! The two modes exist because the client has two jobs. With `-n 1` you are
//! trying to understand what the server did, so everything that player can see
//! is printed as it happens. With `-n 20` you are generating load, and a
//! per-action log is unreadable — what matters is throughput and where the money
//! went.

use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

/// Fleet-wide counters, shared by every player task.
///
/// Individual players never print totals; one reporter task does. That is what
/// keeps twenty streams readable.
pub struct Fleet {
    pub verbose: bool,
    started: Instant,
    registered: AtomicU64,
    playing: AtomicU64,
    busted: AtomicU64,
    games_joined: AtomicU64,
    pots_won: AtomicU64,
    /// Per-player money, keyed by handle: bankroll and chips staked at a table.
    ///
    /// Deliberately per-player rather than two running totals. A shared counter
    /// that each player *stores* into would report whichever player wrote last,
    /// and comparing one player's bankroll against the whole fleet's granted
    /// total invents a drift that is not there.
    money: Mutex<std::collections::HashMap<String, (i64, i64)>>,
    /// Current pot of each game our players sit at, keyed by game id.
    ///
    /// Chips committed during a hand leave `seat.chips` and live in `game.pot`
    /// until it is awarded, so a total that counts only bankrolls and seats
    /// reports the pot as missing money and cries drift on every hand. Keyed by
    /// game rather than by player so a shared table is counted once.
    pots: Mutex<std::collections::HashMap<u64, i64>>,
    /// What the fleet was given in signup bonuses — the only inflow that exists.
    granted: AtomicI64,
    drift_reported: AtomicBool,
    /// Serialises printing so lines from different tasks do not interleave.
    pen: Mutex<()>,
}

impl Fleet {
    pub fn new(verbose: bool) -> Self {
        Self {
            verbose,
            started: Instant::now(),
            registered: AtomicU64::new(0),
            playing: AtomicU64::new(0),
            busted: AtomicU64::new(0),
            games_joined: AtomicU64::new(0),
            pots_won: AtomicU64::new(0),
            money: Mutex::new(std::collections::HashMap::new()),
            pots: Mutex::new(std::collections::HashMap::new()),
            granted: AtomicI64::new(0),
            drift_reported: AtomicBool::new(false),
            pen: Mutex::new(()),
        }
    }

    /// One line of outcome, printed in both modes.
    pub fn outcome(&self, who: &str, what: &str) {
        let _guard = self.pen.lock().unwrap();
        println!("{}  {who:<12} {what}", stamp(self.started));
    }

    /// Play-by-play, printed only with `-n 1`.
    ///
    /// Takes a closure so a busy fleet does not pay to format strings it will
    /// never print.
    pub fn detail(&self, f: impl FnOnce() -> String) {
        if !self.verbose {
            return;
        }
        let _guard = self.pen.lock().unwrap();
        println!("            {}", f());
    }

    pub fn registered(&self, granted: i64) {
        self.registered.fetch_add(1, Ordering::Relaxed);
        self.granted.fetch_add(granted, Ordering::Relaxed);
    }

    pub fn joined(&self) {
        self.games_joined.fetch_add(1, Ordering::Relaxed);
        self.playing.fetch_add(1, Ordering::Relaxed);
    }

    pub fn left(&self) {
        // Saturating: a player can see its game end more than once while it
        // waits to be re-seated, and the counter must not wrap.
        let _ = self
            .playing
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
                Some(n.saturating_sub(1))
            });
    }

    pub fn busted(&self) {
        self.busted.fetch_add(1, Ordering::Relaxed);
    }

    /// A pot awarded to one of our players.
    ///
    /// Counted from the server's own `win` event rather than from a seat's chips
    /// going up, because chips also move on blinds, calls and rebuys — "chips
    /// increased" is not the same thing as "won a hand".
    pub fn pot_won(&self) {
        self.pots_won.fetch_add(1, Ordering::Relaxed);
    }

    /// Record where one player's money is. Totals are summed at report time.
    pub fn set_money(&self, who: &str, bankroll: i64, staked: i64) {
        self.money
            .lock()
            .unwrap()
            .insert(who.to_string(), (bankroll, staked));
    }

    /// Record the pot of a game one of our players is seated at.
    pub fn set_pot(&self, game_id: u64, pot: i64) {
        self.pots.lock().unwrap().insert(game_id, pot);
    }

    /// Fleet totals: (bankroll, staked including live pots).
    fn totals(&self) -> (i64, i64) {
        let (bankroll, seats) = self
            .money
            .lock()
            .unwrap()
            .values()
            .fold((0, 0), |(b, s), (pb, ps)| (b + pb, s + ps));
        let pots: i64 = self.pots.lock().unwrap().values().sum();
        (bankroll, seats + pots)
    }

    /// The scoreboard line.
    ///
    /// `net` is the reason this exists. Players cannot create money — the only
    /// inflow is the signup bonus — so `bankroll + staked` must always equal what
    /// was granted. Tracking it here turns the load client into a continuous
    /// chip-conservation check on the server: a dealer that leaks or mints chips
    /// shows up as a drifting `net` within seconds, rather than being found later
    /// by reading a ledger.
    pub fn scoreboard(&self) -> String {
        let (bankroll, staked) = self.totals();
        let granted = self.granted.load(Ordering::Relaxed);
        let net = bankroll + staked - granted;

        let conserved = if net == 0 {
            "✓ conserved".to_string()
        } else {
            // Same thousands separators as every other figure on the line —
            // this is the number you squint at.
            let sign = if net > 0 { "+" } else { "" };
            format!("⚠ DRIFT {sign}{}", thousands(net))
        };

        format!(
            "{}  players {} ({} playing, {} busted)  games {}  pots won {}\n            \
             bankroll {}  staked {}  granted {}  {}",
            stamp(self.started),
            self.registered.load(Ordering::Relaxed),
            self.playing.load(Ordering::Relaxed),
            self.busted.load(Ordering::Relaxed),
            self.games_joined.load(Ordering::Relaxed),
            self.pots_won.load(Ordering::Relaxed),
            thousands(bankroll),
            thousands(staked),
            thousands(granted),
            conserved,
        )
    }

    /// Print the scoreboard. Drift is called out once, loudly, and the client
    /// keeps running — the size and direction of the drift is the diagnostic, so
    /// exiting would throw away the evidence.
    pub fn report(&self) {
        let line = self.scoreboard();
        let _guard = self.pen.lock().unwrap();
        println!("{line}");
        if line.contains("DRIFT") && !self.drift_reported.swap(true, Ordering::Relaxed) {
            println!(
                "            ^ chips are not conserved: the fleet's bankroll plus staked \
                 chips no longer equals what was granted. This is a server bug — keep \
                 running and watch which way it moves."
            );
        }
    }
}

fn stamp(started: Instant) -> String {
    let secs = started.elapsed().as_secs();
    format!(
        "[{:02}:{:02}:{:02}]",
        secs / 3600,
        (secs / 60) % 60,
        secs % 60
    )
}

/// `168400` → `168,400`, because these numbers are read at a glance.
fn thousands(n: i64) -> String {
    let negative = n < 0;
    let digits = n.abs().to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    if negative {
        format!("-{out}")
    } else {
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thousands_separates_groups() {
        assert_eq!(thousands(0), "0");
        assert_eq!(thousands(999), "999");
        assert_eq!(thousands(1_000), "1,000");
        assert_eq!(thousands(168_400), "168,400");
        assert_eq!(thousands(-2_500), "-2,500");
    }

    #[test]
    fn conservation_is_reported_from_granted_not_from_a_guess() {
        let fleet = Fleet::new(false);
        fleet.registered(10_000);
        fleet.registered(10_000);

        // Both players still holding everything: conserved. This only adds up if
        // the two players are summed rather than overwriting each other — the bug
        // this test exists to catch.
        fleet.set_money("a", 10_000, 0);
        fleet.set_money("b", 10_000, 0);
        assert!(fleet.scoreboard().contains("conserved"));

        // One buys in: money moved, not created.
        fleet.set_money("a", 9_000, 1_000);
        assert!(fleet.scoreboard().contains("conserved"));

        // Mid-hand: the chips are in the pot, not on the seat. Still conserved —
        // this is the case that made the check cry wolf every hand.
        fleet.set_money("a", 9_000, 500);
        fleet.set_pot(1, 500);
        assert!(fleet.scoreboard().contains("conserved"));

        // Chips vanished — this is what a dealer bug actually looks like.
        fleet.set_pot(1, 0);
        fleet.set_money("a", 9_000, 0);
        assert!(fleet.scoreboard().contains("DRIFT -1,000"));
    }
}
