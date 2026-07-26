//! One player: connect, register, find a game, and act when it is your turn.
//!
//! Each player is a separate connection with its own identity, because that is
//! what the server sees at a real table — and because `my_hole_cards` is scoped
//! to the caller, so a shared connection could not give each player their own
//! cards.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use spacetimedb_sdk::{DbContext, Table};

use crate::module_bindings::*;
use crate::report::Fleet;
use crate::Args;

pub async fn run(args: Args, name: String, fleet: Arc<Fleet>) -> anyhow::Result<()> {
    // No saved credentials: each run is a new player, so we connect anonymously
    // and let the host mint us an identity.
    let connection = DbConnection::builder()
        .with_uri(&args.server)
        .with_database_name(&args.db)
        .build()?;

    connection.run_threaded();

    // Subscribe to what this player needs to decide: the lobby, the seats, its
    // own account, and its own cards. `my_hole_cards` is a view the database
    // scopes to us — an opponent subscribing to it sees their own row, not ours.
    let ready = Arc::new(AtomicBool::new(false));
    {
        let ready = Arc::clone(&ready);
        connection
            .subscription_builder()
            .on_applied(move |_ctx| ready.store(true, Ordering::Relaxed))
            .subscribe([
                "SELECT * FROM game",
                "SELECT * FROM seat",
                "SELECT * FROM account",
                "SELECT * FROM my_hole_cards",
                "SELECT * FROM game_event",
            ]);
    }

    // Wait for the initial state before deciding anything.
    for _ in 0..100 {
        if ready.load(Ordering::Relaxed) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    // A name may already belong to a player from an earlier run — handles are
    // unique across every account the module has ever seen, and this client
    // registers new accounts each time. That is not a failure, so take another
    // name rather than giving up. (The old accounts stay behind on purpose:
    // they are the history the dashboard reads.)
    let mut seq = 1;
    let mut handle = format!("{name} {seq}");
    loop {
        match register_account(&connection, &handle).await {
            Ok(()) => break,
            Err(e) if e.to_string().contains("is taken") && seq < 500 => {
                seq += 1;
                handle = format!("{name} {seq}");
            }
            // A different refusal, or five hundred of the same name already at
            // the tables — either way, not something to paper over.
            Err(e) => return Err(e),
        }
    }

    let me = connection.identity();
    let bankroll = connection
        .db()
        .account()
        .identity()
        .find(&me)
        .map(|a| a.bankroll)
        // Registration is confirmed before we get here, so a missing account
        // means the cache has not caught up rather than that we have no money.
        .unwrap_or_else(|| starting_capital(&connection));
    fleet.registered(starting_capital(&connection));
    fleet.outcome(&handle, &format!("registered with {bankroll} chips"));

    // Chip movement is counted in every mode — it is the scoreboard's `pots won`
    // column. Only the play-by-play narration is verbose-only.
    track_chip_movement(&connection, &handle, Arc::clone(&fleet));
    if fleet.verbose {
        install_commentary(&connection, &handle, Arc::clone(&fleet));
    }

    play_until_broke(&connection, &args, &handle, &fleet).await;

    fleet.outcome(&handle, "out of chips — leaving");
    fleet.busted();
    let _ = connection.disconnect();
    Ok(())
}

/// Register, and *wait for the server to say whether it worked*.
///
/// `reducers().register(..)` returns `Ok` as soon as the request is sent — it
/// says nothing about whether the reducer succeeded. Ignoring that is how a
/// rejected registration used to surface as "registered with 0 chips" followed
/// by a player that could never do anything: the account simply did not exist.
/// Waiting for the outcome turns a server-side refusal into the server's own
/// error message.
async fn register_account(connection: &DbConnection, handle: &str) -> anyhow::Result<()> {
    let (callback, rx) = outcome_channel();
    connection
        .reducers()
        .register_then(handle.to_string(), callback)?;
    awaited(rx, &format!("registering '{handle}'")).await
}

/// Join a table, and find out whether we actually got a seat.
async fn join_table(connection: &DbConnection, game_id: u64) -> anyhow::Result<()> {
    let (callback, rx) = outcome_channel();
    connection.reducers().join_game_then(game_id, callback)?;
    awaited(rx, &format!("joining game {game_id}")).await
}

/// Cash out and free the seat.
async fn leave_table(connection: &DbConnection) -> anyhow::Result<()> {
    let (callback, rx) = outcome_channel();
    connection.reducers().leave_game_then(callback)?;
    awaited(rx, "leaving the table").await
}

/// Open a table, and find out whether it was created.
async fn open_table(
    connection: &DbConnection,
    name: String,
    small_blind: i64,
    buy_in: i64,
) -> anyhow::Result<()> {
    let (callback, rx) = outcome_channel();
    connection
        .reducers()
        .create_game_then(name, small_blind, buy_in, callback)?;
    awaited(rx, "opening a table").await
}

/// The receiver half of an awaited reducer call.
type Outcome = tokio::sync::oneshot::Receiver<Result<(), String>>;

/// Build a reducer callback that reports its outcome through a channel.
#[allow(clippy::type_complexity)]
fn outcome_channel() -> (
    impl FnOnce(
            &ReducerEventContext,
            Result<Result<(), String>, spacetimedb_sdk::error::InternalError>,
        ) + Send
        + 'static,
    Outcome,
) {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let callback =
        move |_ctx: &ReducerEventContext,
              result: Result<Result<(), String>, spacetimedb_sdk::error::InternalError>| {
            let _ = tx.send(match result {
                Ok(Ok(())) => Ok(()),
                Ok(Err(message)) => Err(message),
                Err(internal) => Err(internal.to_string()),
            });
        };
    (callback, rx)
}

/// Wait for a reducer's real outcome.
///
/// This matters more than it looks. `reducers().join_game(..)` returns `Ok` as
/// soon as the request is *sent*; it says nothing about whether the reducer
/// succeeded. Treating that as success is how a refused registration surfaced as
/// "registered with 0 chips", and how a refused join printed "joined game 26"
/// dozens of times while the player sat there unseated. Waiting turns a
/// server-side refusal into the server's own words.
async fn awaited(rx: Outcome, what: &str) -> anyhow::Result<()> {
    match tokio::time::timeout(Duration::from_secs(15), rx).await {
        Ok(Ok(Ok(()))) => Ok(()),
        Ok(Ok(Err(message))) => anyhow::bail!("{what} refused: {message}"),
        Ok(Err(_)) => anyhow::bail!("connection closed before {what} completed"),
        Err(_) => anyhow::bail!("{what} timed out after 15s — is the module published?"),
    }
}

fn starting_capital(connection: &DbConnection) -> i64 {
    connection
        .db()
        .config()
        .iter()
        .next()
        .map(|c| c.starting_capital)
        .unwrap_or(10_000)
}

/// The main loop: get seated, act when it is our turn, and stop when broke.
async fn play_until_broke(
    connection: &DbConnection,
    args: &Args,
    handle: &str,
    fleet: &Arc<Fleet>,
) {
    // Consecutive tables we opened that nobody joined. Drives both the advice we
    // print and how long we wait before opening another.
    let mut lonely_rounds: u32 = 0;
    // Games seen through to the end. `-c` is honoured only for a single player;
    // a fleet is here to generate load.
    let mut games_finished: u32 = 0;
    let game_limit = if args.players == 1 { args.games } else { 0 };

    loop {
        let me = connection.identity();

        let Some(account) = connection.db().account().identity().find(&me) else {
            tokio::time::sleep(Duration::from_millis(500)).await;
            continue;
        };

        // Report where this player's money is, so the fleet total stays current.
        let staked = connection
            .db()
            .seat()
            .iter()
            .filter(|s| s.account == me)
            .map(|s| s.chips)
            .sum::<i64>();
        fleet.set_money(handle, account.bankroll, staked);
        // Report the pot of whatever table we sit at, so money in flight is not
        // mistaken for money lost.
        if let Some(seat) = seat_of(connection, &me) {
            if let Some(game) = connection.db().game().game_id().find(&seat.game_id) {
                fleet.set_pot(game.game_id, game.pot);
            }
        }

        if account.bankroll <= 0 && staked <= 0 {
            return;
        }

        match seat_of(connection, &me) {
            // Seated: act if it is our turn.
            Some(seat) => {
                let Some(game) = connection.db().game().game_id().find(&seat.game_id) else {
                    tokio::time::sleep(Duration::from_millis(300)).await;
                    continue;
                };

                // Busted: chips gone, but the bankroll may still afford a
                // rebuy. Leaving frees the seat — a busted player who stays is
                // never dealt in again and never asked to act, so the client
                // sits there silently forever looking like it has hung.
                if seat.chips <= 0 && game.status != "ended" {
                    fleet.outcome(handle, &format!("busted out of game {}", game.game_id));
                    match leave_table(connection).await {
                        Ok(()) => fleet.left(),
                        Err(e) => fleet.detail(|| format!("could not leave the table: {e}")),
                    }
                    tokio::time::sleep(Duration::from_millis(400)).await;
                    continue;
                }

                if game.status == "ended" {
                    games_finished += 1;
                    fleet.outcome(
                        handle,
                        &format!("game {} ended ({games_finished} played)", game.game_id),
                    );
                    fleet.left();
                    if game_limit > 0 && games_finished >= game_limit {
                        fleet.outcome(handle, &format!("played {game_limit} game(s) — done"));
                        return;
                    }
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    continue;
                }

                if game.to_act_seat == Some(seat.seat_id) {
                    let (action, amount) = decide(&game, &seat);
                    fleet.detail(|| {
                        format!(
                            "my turn — pot {}, to call {}, my chips {} → {action}",
                            game.pot,
                            (game.current_bet - seat.committed).max(0),
                            seat.chips
                        )
                    });
                    let _ = connection.reducers().act(action.to_string(), amount);
                }
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
            // Not seated: join something we can afford, or open a table.
            None => {
                if account.bankroll < args.buy_in {
                    // Can't afford a seat any more.
                    return;
                }

                // Prefer joining. A table only stays `waiting` for the join
                // window, so look for one for a while rather than glancing once
                // and immediately opening our own — two players each opening
                // tables at the wrong moment never meet.
                let patience = joining_patience(lonely_rounds);
                if let Some(game) = wait_for_joinable(connection, account.bankroll, patience).await
                {
                    match join_table(connection, game.game_id).await {
                        Ok(()) => {
                            fleet.outcome(handle, &format!("joined game {}", game.game_id));
                            fleet.joined();
                            lonely_rounds = 0;
                            continue;
                        }
                        Err(e) => {
                            // Losing a race for the last seat is ordinary; say so
                            // quietly and look again rather than pretending we
                            // are seated.
                            fleet.detail(|| format!("could not join game {}: {e}", game.game_id));
                        }
                    }
                }

                let name = format!("{handle}'s table");
                if open_table(connection, name, args.small_blind, args.buy_in)
                    .await
                    .is_ok()
                {
                    lonely_rounds += 1;
                    fleet.outcome(
                        handle,
                        &format!(
                            "opened a table, waiting {}s for players",
                            join_window_secs(connection)
                        ),
                    );
                    fleet.joined();

                    // A table nobody joins is abandoned when its window closes,
                    // and a lone player would otherwise burn one every few
                    // seconds in silence. Say what is actually wrong, once.
                    if lonely_rounds == LONELY_LIMIT {
                        fleet.hint(&format!(
                            "no one has joined {LONELY_LIMIT} tables in a row — a game needs at \
                             least {} players.\n            Start more in another terminal:  \
                             cargo run -p cardroom-client -- -n 5\n            \
                             (waiting longer between tables now, so players finishing other \
                             games have time to find yours)",
                            min_players(connection)
                        ));
                    }
                }
                tokio::time::sleep(Duration::from_millis(900)).await;
            }
        }
    }
}

fn seat_of(connection: &DbConnection, me: &spacetimedb_sdk::Identity) -> Option<Seat> {
    connection.db().seat().iter().find(|s| &s.account == me)
}

/// How many tables may go unjoined before we explain what is wrong.
const LONELY_LIMIT: u32 = 3;

/// How long to keep looking for a table to join before opening one.
///
/// Grows with consecutive failures. The first round is brief — if a table is
/// already waiting we want to be in it — but a player who keeps ending up alone
/// should wait out other tables rather than churning through join windows nobody
/// is free to answer.
fn joining_patience(lonely_rounds: u32) -> Duration {
    match lonely_rounds {
        0 => Duration::from_secs(2),
        1..=2 => Duration::from_secs(8),
        _ => Duration::from_secs(30),
    }
}

/// Poll for a joinable table until one appears or `patience` runs out.
async fn wait_for_joinable(
    connection: &DbConnection,
    bankroll: i64,
    patience: Duration,
) -> Option<Game> {
    let deadline = tokio::time::Instant::now() + patience;
    loop {
        let found = connection
            .db()
            .game()
            .iter()
            .find(|g| g.status == "waiting" && g.buy_in <= bankroll);
        if found.is_some() {
            return found;
        }
        if tokio::time::Instant::now() >= deadline {
            return None;
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
}

fn join_window_secs(connection: &DbConnection) -> u64 {
    connection
        .db()
        .config()
        .iter()
        .next()
        .map(|c| c.join_window_secs)
        .unwrap_or(10)
}

fn min_players(connection: &DbConnection) -> u32 {
    connection
        .db()
        .config()
        .iter()
        .next()
        .map(|c| c.min_players)
        .unwrap_or(2)
}

/// A deliberately simple policy: fold hopeless spots, call cheap ones, raise
/// occasionally. Poker strength is not the point — movement is.
fn decide(game: &Game, seat: &Seat) -> (&'static str, i64) {
    let owed = (game.current_bet - seat.committed).max(0);

    if owed == 0 {
        // Free to see the next card; occasionally put in a bet to keep pots moving.
        if rand::random::<f32>() < 0.15 {
            return ("raise", game.current_bet + game.big_blind);
        }
        return ("check", 0);
    }
    // Fold when calling would cost a large share of our stack.
    if owed as f64 > seat.chips as f64 * 0.4 && rand::random::<f32>() < 0.6 {
        return ("fold", 0);
    }
    if rand::random::<f32>() < 0.1 {
        return ("raise", game.current_bet + game.big_blind);
    }
    ("call", owed)
}

/// Whether a row arrived because something *just happened*, rather than because
/// a subscription is replaying history.
///
/// The distinction that matters is not "did I cause this". `Event::Reducer` is
/// only ever a reducer **this client** invoked; a transaction anyone else caused
/// — another player acting, a turn timing out, the sweeper — arrives as
/// `Event::Transaction`. Testing for `Reducer` alone therefore drops most of the
/// game: pots won when an opponent closed the hand went uncounted, and the hand
/// history showed an opponent's actions only when our own action happened to
/// trigger them in the same transaction.
fn is_live(event: &spacetimedb_sdk::Event<Reducer>) -> bool {
    matches!(
        event,
        spacetimedb_sdk::Event::Reducer(_) | spacetimedb_sdk::Event::Transaction
    )
}

/// Count pots this player wins, from the server's own `win` events.
///
/// Only our own handle: every client sees every event, so counting them all
/// would multiply the fleet's total by the number of players watching.
fn track_chip_movement(connection: &DbConnection, handle: &str, fleet: Arc<Fleet>) {
    let me = handle.to_string();
    connection.db().game_event().on_insert(move |ctx, ev| {
        if !is_live(&ctx.event) {
            return;
        }
        if ev.kind == "win" && ev.handle == me {
            fleet.pot_won();
        }
    });
}

/// With one player, narrate everything that player is entitled to see.
///
/// Deliberately built only from what the server sends *this* client: our own
/// cards come from the `my_hole_cards` view, and opponents' cards only ever
/// appear in `show` events, which the module writes at showdown. If this ever
/// prints an opponent's cards early, that is a server bug, not a client feature.
fn install_commentary(connection: &DbConnection, handle: &str, fleet: Arc<Fleet>) {
    // Which table we are sitting at. Every other client's play arrives here too —
    // the subscription is `SELECT * FROM game_event`, server-wide — so without
    // this the hand history is half a dozen tables shuffled together, with two
    // different boards and two different pots under the same "turn:" heading.
    //
    // Remembered rather than looked up each time, because a seat is deleted the
    // moment its game ends and the last few events of a hand would otherwise be
    // dropped as belonging to nobody.
    let my_game = Arc::new(std::sync::atomic::AtomicU64::new(0));

    {
        let fleet = Arc::clone(&fleet);
        connection.db().my_hole_cards().on_insert(move |_ctx, row| {
            fleet.detail(|| format!("dealt {} {}", card_name(row.card_a), card_name(row.card_b)));
        });
    }

    // Watch our own table fill up. Sitting through a join window with no idea
    // whether anyone else is coming is the single most confusing thing about
    // running one player.
    {
        let fleet = Arc::clone(&fleet);
        let me = handle.to_string();
        let my_game = Arc::clone(&my_game);
        connection.db().seat().on_insert(move |ctx, seat| {
            // Our own seat is what tells us which table to narrate.
            if seat.handle == me {
                my_game.store(seat.game_id, Ordering::Relaxed);
                return;
            }
            if !is_live(&ctx.event) || seat.game_id != my_game.load(Ordering::Relaxed) {
                return;
            }
            let seated = ctx
                .db
                .seat()
                .iter()
                .filter(|s| s.game_id == seat.game_id)
                .count();
            let needed = ctx
                .db
                .config()
                .iter()
                .next()
                .map(|c| c.min_players as usize)
                .unwrap_or(2);
            let countdown = ctx
                .db
                .config()
                .iter()
                .next()
                .map(|c| c.start_countdown_secs)
                .unwrap_or(3);
            fleet.detail(|| {
                if seated >= needed {
                    format!(
                        "{} joined — {seated} at the table, starting in {countdown}s",
                        seat.handle
                    )
                } else {
                    format!(
                        "{} joined — {seated} at the table, need {needed}",
                        seat.handle
                    )
                }
            });
        });
    }

    {
        let fleet = Arc::clone(&fleet);
        let me = handle.to_string();
        let my_game = Arc::clone(&my_game);
        connection.db().game_event().on_insert(move |ctx, ev| {
            // The initial subscription replays every historical event at once and
            // in no particular order. Narrating those would print a scrambled
            // backlog before the first live hand.
            if !is_live(&ctx.event) || ev.game_id != my_game.load(Ordering::Relaxed) {
                return;
            }
            let who = if ev.handle == me {
                "me"
            } else {
                ev.handle.as_str()
            };
            fleet.detail(|| match ev.kind.as_str() {
                "deal" => format!("── {} ──", ev.detail),
                "flop" | "turn" | "river" => {
                    format!("{}: board {}  (pot {})", ev.kind, ev.detail, ev.amount)
                }
                "show" => format!("{who} shows {}", ev.detail),
                "win" => format!("{who} wins {} ({})", ev.amount, ev.detail),
                "small_blind" | "big_blind" => {
                    format!("{who} posts {} ({})", ev.amount, ev.kind.replace('_', " "))
                }
                "join" => format!("{who} sits down with {}", ev.amount),
                "start" => format!("game on — {}", ev.detail),
                "abandoned" => format!("table abandoned — {}", ev.detail),
                "game_over" => format!("game over — {}", ev.detail),
                "fold" => format!("{who} folds"),
                "check" => format!("{who} checks"),
                "call" => format!("{who} calls {}", ev.amount),
                "raise" => format!("{who} raises to {}", ev.amount),
                other => format!("{who} {other} {}", ev.detail),
            });
        });
    }
}

/// `41` → `"Js"`. Mirrors the module's own encoding: `rank = card / 4`,
/// `suit = card % 4`.
fn card_name(card: u8) -> String {
    const RANKS: [char; 13] = [
        '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A',
    ];
    const SUITS: [char; 4] = ['c', 'd', 'h', 's'];
    let (r, s) = ((card / 4) as usize, (card % 4) as usize);
    match (RANKS.get(r), SUITS.get(s)) {
        (Some(r), Some(s)) => format!("{r}{s}"),
        _ => format!("?{card}"),
    }
}
