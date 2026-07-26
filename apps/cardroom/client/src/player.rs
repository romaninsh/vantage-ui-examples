//! One player: connect, register, find a game, and act when it is your turn.
//!
//! Each player is a separate connection with its own identity, because that is
//! what the server sees at a real table — and because `my_hole_cards` is scoped
//! to the caller, so a shared connection could not give each player their own
//! cards.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use spacetimedb_sdk::{credentials, DbContext, Table};

use crate::module_bindings::*;
use crate::report::Fleet;
use crate::Args;

pub async fn run(args: Args, index: usize, fleet: Arc<Fleet>) -> anyhow::Result<()> {
    let handle = format!("{}-{index}", args.prefix);
    // `credentials::File::load` consumes the handle, so keep two — one to read
    // the saved token now, one for the connect callback to write it back.
    let token_path = format!("{}/{}", args.token_dir, handle);

    // Reconnect as the same account if we have played before. Without this a
    // restart would mint a fresh identity and collect another signup bonus,
    // which would quietly break the fleet's chip-conservation check.
    let saved = credentials::File::new(&token_path).load().ok().flatten();
    let token_file = credentials::File::new(&token_path);

    let connection = DbConnection::builder()
        .with_uri(&args.server)
        .with_database_name(&args.db)
        .with_token(saved)
        .on_connect(move |_ctx, _identity, token| {
            let _ = token_file.save(token);
        })
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

    let me = connection.identity();

    if connection.db().account().identity().find(&me).is_none() {
        connection.reducers().register(handle.clone())?;
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
    let bankroll = connection
        .db()
        .account()
        .identity()
        .find(&me)
        .map(|a| a.bankroll)
        .unwrap_or(0);
    fleet.registered(starting_capital(&connection));
    fleet.outcome(&handle, &format!("registered with {bankroll} chips"));

    // Chip movement is counted in every mode — it is the scoreboard's `won`/`lost`
    // columns. Only the play-by-play narration is verbose-only.
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

                if game.status == "ended" {
                    fleet.outcome(handle, &format!("game {} ended", game.game_id));
                    fleet.left();
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
                let joinable = connection
                    .db()
                    .game()
                    .iter()
                    .find(|g| g.status == "waiting" && g.buy_in <= account.bankroll);

                match joinable {
                    Some(game) => {
                        if connection.reducers().join_game(game.game_id).is_ok() {
                            fleet.outcome(handle, &format!("joined game {}", game.game_id));
                            fleet.joined();
                        }
                    }
                    None => {
                        let name = format!("{handle}'s table");
                        if connection
                            .reducers()
                            .create_game(name, args.small_blind, args.buy_in)
                            .is_ok()
                        {
                            fleet.outcome(handle, "opened a table, waiting for players");
                            fleet.joined();
                        }
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

/// Count pots this player wins, from the server's own `win` events.
///
/// Only our own handle: every client sees every event, so counting them all
/// would multiply the fleet's total by the number of players watching.
fn track_chip_movement(connection: &DbConnection, handle: &str, fleet: Arc<Fleet>) {
    let me = handle.to_string();
    connection.db().game_event().on_insert(move |ctx, ev| {
        if !matches!(ctx.event, spacetimedb_sdk::Event::Reducer(_)) {
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
    {
        let fleet = Arc::clone(&fleet);
        connection.db().my_hole_cards().on_insert(move |_ctx, row| {
            fleet.detail(|| format!("dealt {} {}", card_name(row.card_a), card_name(row.card_b)));
        });
    }

    {
        let fleet = Arc::clone(&fleet);
        let me = handle.to_string();
        connection.db().game_event().on_insert(move |ctx, ev| {
            // The initial subscription replays every historical event at once and
            // in no particular order. Narrating those would print a scrambled
            // backlog before the first live hand; only reducer-driven events are
            // things that just happened.
            if !matches!(ctx.event, spacetimedb_sdk::Event::Reducer(_)) {
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
