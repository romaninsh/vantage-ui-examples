//! cardroom — a multiplayer Texas Hold'em server, as a SpacetimeDB module.
//!
//! The whole game lives inside the database: the schema, the dealer, the
//! betting rules and the timers. Clients only call reducers and subscribe;
//! there is no application server in between.
//!
//! # The player journey
//!
//! `register` → browse the lobby (the `game` table) → `create_game` or
//! `join_game` → the game locks after a join window and deals → `act` on your
//! turn → chips move → repeat until someone holds them all. Anyone may
//! `observe_game` at any point, including after a game has ended.
//!
//! # Two pots of money
//!
//! [`Account::bankroll`] is money you own; [`Seat::chips`] is money currently on
//! a table. Joining moves bankroll → chips, leaving moves it back, and every
//! movement writes a [`LedgerEntry`]. Keeping them separate is what makes
//! "how much has this player won or lost" an exact question rather than an
//! approximate one, and it gives the invariant worth testing: for every account,
//! `bankroll + chips_on_tables == starting_capital + sum(ledger)`.
//!
//! # One game at a time
//!
//! [`Seat::account`] is `#[unique]`, so a player cannot hold two seats. That is
//! deliberately a *schema* constraint rather than a check inside `join_game`:
//! the database refuses a double-join even against a buggy client. The cost is
//! that seats must be released when a game ends — a lingering row would hold the
//! unique slot forever and lock that account out of every future game. Nothing
//! is lost by deleting them, because a finished game's history lives in
//! [`GameEvent`] and [`LedgerEntry`].
//!
//! # Shapes chosen for the client, not for elegance
//!
//! Two decisions look unusual and are deliberate, both driven by SpacetimeDB's
//! SQL dialect having **no `GROUP BY`** and clients preferring scalars:
//!
//! - Enum-ish fields (`Game::status`, `Seat::state`, `GameEvent::kind`) are
//!   `String`, not SATS sum types. A sum type would reach a Vantage grid as an
//!   opaque JSON blob; a string is readable, filterable with `WHERE`, and
//!   sortable client-side.
//! - Counts that a UI wants (`Game::seats_taken`, `Game::observers`) are
//!   denormalised onto the row, because no client can aggregate them.

pub mod dealer;
pub mod poker;

use spacetimedb::{
    AnonymousViewContext, Identity, ReducerContext, ScheduleAt, SpacetimeType, Table, Timestamp,
    ViewContext, table, view,
};
use std::time::Duration;

// ---------------------------------------------------------------------------
// Status vocabularies
//
// Free functions rather than constants so the values appear once and every
// comparison site reads the same.
// ---------------------------------------------------------------------------

pub const STATUS_WAITING: &str = "waiting";
pub const STATUS_PLAYING: &str = "playing";
pub const STATUS_ENDED: &str = "ended";

pub const SEAT_ACTIVE: &str = "active";
pub const SEAT_FOLDED: &str = "folded";
pub const SEAT_ALLIN: &str = "allin";
pub const SEAT_BUSTED: &str = "busted";

pub const STREET_PREFLOP: &str = "preflop";
pub const STREET_FLOP: &str = "flop";
pub const STREET_TURN: &str = "turn";
pub const STREET_RIVER: &str = "river";
pub const STREET_SHOWDOWN: &str = "showdown";

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/// A player account. Created by `register`, credited with the configured
/// starting capital, and thereafter the authoritative record of what a player
/// owns away from the table.
#[table(accessor = account, public)]
pub struct Account {
    #[primary_key]
    pub identity: Identity,
    #[unique]
    pub handle: String,
    /// Money owned and not currently staked at a table.
    ///
    /// Indexed so the `top_players` view can reach every account: a view reads
    /// through indexes rather than scanning, so a leaderboard needs an ordered
    /// column to range over.
    #[index(btree)]
    pub bankroll: i64,
    pub lifetime_won: i64,
    pub lifetime_lost: i64,
    pub games_played: u32,
    pub games_won: u32,
    pub registered_at: Timestamp,
    pub banned: bool,
}

/// A game — one row per table in the lobby, kept after it ends so observers can
/// review it and so the history has somewhere to hang.
#[derive(Clone)]
#[table(accessor = game, public)]
pub struct Game {
    #[primary_key]
    #[auto_inc]
    pub game_id: u64,
    pub name: String,
    pub created_by: Identity,
    pub small_blind: i64,
    pub big_blind: i64,
    pub buy_in: i64,
    /// `waiting` → `playing` → `ended`. See the `STATUS_*` constants.
    #[index(btree)]
    pub status: String,
    /// Denormalised so the lobby is a plain grid — clients cannot aggregate.
    pub seats_taken: u32,
    pub observers: u32,
    pub hand_no: u32,
    pub pot: i64,
    /// Community cards as `"As Td 7h"`, empty before the flop.
    pub board: String,
    pub street: String,
    /// Whose turn it is, or `None` when nobody is being waited on.
    pub to_act_seat: Option<u64>,
    /// Current bet a player must match to stay in this street.
    pub current_bet: i64,
    /// When the join window closes and the first hand is dealt.
    pub starts_at: Timestamp,
    pub created_at: Timestamp,
    pub ended_at: Option<Timestamp>,
    pub winner: Option<Identity>,
}

/// A player seated at a game. Live-only state: deleted on leaving or when the
/// game ends, so the `#[unique]` account slot is released.
#[table(accessor = seat, public)]
pub struct Seat {
    #[primary_key]
    #[auto_inc]
    pub seat_id: u64,
    #[index(btree)]
    pub game_id: u64,
    pub seat_no: u32,
    /// Unique across the whole table: **a player may hold at most one seat**.
    #[unique]
    pub account: Identity,
    pub handle: String,
    /// Money staked at this table.
    pub chips: i64,
    /// Chips committed to the pot during the current street.
    pub committed: i64,
    pub state: String,
    pub joined_at: Timestamp,
}

/// A spectator. Unlike [`Seat`] there is no uniqueness constraint — an account
/// may observe any number of games, including one it is seated at.
#[table(accessor = observer, public)]
pub struct Observer {
    #[primary_key]
    #[auto_inc]
    pub observer_id: u64,
    #[index(btree)]
    pub game_id: u64,
    pub account: Identity,
    pub handle: String,
    pub since: Timestamp,
}

/// Hole cards. **Private** — no `public` marker — so no client can read this
/// table at all. Players reach their own through the `my_hole_cards` view,
/// which the database scopes to the caller.
#[table(accessor = hole_cards)]
pub struct HoleCards {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub game_id: u64,
    #[index(btree)]
    pub seat_id: u64,
    /// Indexed so `my_hole_cards` can look the caller up directly — a view has
    /// no way to scan.
    #[index(btree)]
    pub account: Identity,
    pub card_a: u8,
    pub card_b: u8,
}

/// The per-game event log. A **normal** table, not a SpacetimeDB `event` table:
/// event-table rows are deleted in the transaction that inserts them, which
/// would leave an observer joining a finished game with nothing to read.
#[table(accessor = game_event, public)]
pub struct GameEvent {
    #[primary_key]
    #[auto_inc]
    pub event_id: u64,
    #[index(btree)]
    pub game_id: u64,
    pub seq: u32,
    pub at: Timestamp,
    pub kind: String,
    pub handle: String,
    pub amount: i64,
    pub detail: String,
}

/// Every movement of money, append-only. The spine of "what has this player won
/// or lost", and the audit trail that makes chip conservation checkable.
#[table(accessor = ledger, public)]
pub struct LedgerEntry {
    #[primary_key]
    #[auto_inc]
    pub entry_id: u64,
    pub at: Timestamp,
    #[index(btree)]
    pub account: Identity,
    pub handle: String,
    /// `signup_bonus` | `buy_in` | `cash_out` | `pot_win` | `admin_credit`.
    pub kind: String,
    pub amount: i64,
    pub balance_after: i64,
    pub game_id: Option<u64>,
}

/// Singleton knobs. Public so an admin console can read and adjust them.
#[table(accessor = config, public)]
pub struct Config {
    #[primary_key]
    pub id: u32,
    pub starting_capital: i64,
    pub join_window_secs: u64,
    pub turn_timeout_secs: u64,
    pub min_players: u32,
    pub max_seats: u32,
}

/// Fires once per game, when its join window closes.
#[table(accessor = start_timer, scheduled(start_game))]
pub struct StartTimer {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
    pub game_id: u64,
}

/// Fires when a player has sat on their turn for too long.
///
/// Load-bearing, not a nicety: the load client runs many dumb bots, and one that
/// stalls would otherwise wedge its game forever and hold its seat — which, with
/// the unique-account constraint, would lock that account out permanently.
#[table(accessor = turn_timer, scheduled(turn_timeout))]
pub struct TurnTimer {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
    pub game_id: u64,
    pub seat_id: u64,
    /// Guards against acting on a stale timer: a timer whose hand has already
    /// moved on is ignored rather than folding an innocent player.
    pub hand_no: u32,
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/// A player's own hole cards, and nobody else's.
///
/// This is the module's privacy mechanism. The underlying table is private, so
/// the *only* route to a card is this view, and the database scopes it to
/// `ctx.sender()` — an observer or opponent subscribing to it receives their own
/// rows, which is to say none. Enforcement is in the database, not in any UI.
///
/// Identity-scoped views are computed per subscriber, so this is deliberately
/// tiny: at most one row per caller.
#[view(accessor = my_hole_cards, public)]
pub fn my_hole_cards(ctx: &ViewContext) -> Vec<HoleCards> {
    // Index lookup rather than a scan-and-filter: a view's `ctx.db` exposes
    // tables through their indexes only. That happens to be exactly right here —
    // the caller's own row is the only one we ever want.
    ctx.db.hole_cards().account().filter(ctx.sender()).collect()
}

/// One row per account, ranked by bankroll.
#[derive(SpacetimeType)]
pub struct PlayerRanking {
    pub handle: String,
    pub identity: Identity,
    pub bankroll: i64,
    pub net: i64,
    pub games_played: u32,
    pub games_won: u32,
}

/// The leaderboard, computed server-side.
///
/// This exists because SpacetimeDB's SQL has no `GROUP BY` or `ORDER BY`: a
/// client cannot rank accounts itself without pulling every row. Being
/// *anonymous* matters for cost — an `AnonymousViewContext` view is computed
/// once for everyone, whereas an identity-scoped one is computed and
/// change-tracked per subscriber, which at load-client scale is the difference
/// between cheap and quadratic.
#[view(accessor = top_players, public)]
pub fn top_players(ctx: &AnonymousViewContext) -> Vec<PlayerRanking> {
    // Ranged over the bankroll index, because a view cannot scan a table. The
    // range is unbounded, so this reaches every account — the index is the
    // access path, not a filter.
    let mut rows: Vec<PlayerRanking> = ctx
        .db
        .account()
        .bankroll()
        .filter(i64::MIN..)
        .map(|a| PlayerRanking {
            net: a.lifetime_won - a.lifetime_lost,
            handle: a.handle,
            identity: a.identity,
            bankroll: a.bankroll,
            games_played: a.games_played,
            games_won: a.games_won,
        })
        .collect();
    rows.sort_by(|a, b| b.bankroll.cmp(&a.bankroll));
    rows.truncate(100);
    rows
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    ctx.db.config().insert(Config {
        id: 0,
        starting_capital: 10_000,
        join_window_secs: 10,
        turn_timeout_secs: 15,
        min_players: 2,
        max_seats: 6,
    });
    log::info!("cardroom initialised");
}

fn config(ctx: &ReducerContext) -> Config {
    ctx.db.config().id().find(0).unwrap_or(Config {
        id: 0,
        starting_capital: 10_000,
        join_window_secs: 10,
        turn_timeout_secs: 15,
        min_players: 2,
        max_seats: 6,
    })
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/// Move money and record it. Every change to a bankroll goes through here, so
/// the ledger can never disagree with the balance it describes.
fn credit(ctx: &ReducerContext, account: &mut Account, kind: &str, amount: i64, game_id: Option<u64>) {
    account.bankroll += amount;
    ctx.db.ledger().insert(LedgerEntry {
        entry_id: 0,
        at: ctx.timestamp,
        account: account.identity,
        handle: account.handle.clone(),
        kind: kind.to_string(),
        amount,
        balance_after: account.bankroll,
        game_id,
    });
}

/// Append to a game's event log.
///
/// Takes `&Game` rather than `&mut`: appending an event does not change the
/// game, and borrowing it immutably lets callers pass fields of the same game as
/// arguments (`log_event(ctx, &game, "join", …, game.buy_in, …)`) without
/// fighting the borrow checker.
fn log_event(ctx: &ReducerContext, game: &Game, kind: &str, handle: &str, amount: i64, detail: &str) {
    let seq = ctx.db.game_event().game_id().filter(game.game_id).count() as u32;
    ctx.db.game_event().insert(GameEvent {
        event_id: 0,
        game_id: game.game_id,
        seq,
        at: ctx.timestamp,
        kind: kind.to_string(),
        handle: handle.to_string(),
        amount,
        detail: detail.to_string(),
    });
}

// ---------------------------------------------------------------------------
// Player reducers
// ---------------------------------------------------------------------------

/// Create an account for the caller and credit the starting capital.
///
/// Idempotent by identity: calling it again just renames, so a client that
/// reconnects with a stored token keeps its balance instead of farming bonuses.
#[spacetimedb::reducer]
pub fn register(ctx: &ReducerContext, handle: String) -> Result<(), String> {
    let handle = handle.trim().to_string();
    if handle.is_empty() {
        return Err("handle must not be empty".into());
    }
    if let Some(mut existing) = ctx.db.account().identity().find(ctx.sender()) {
        existing.handle = handle;
        ctx.db.account().identity().update(existing);
        return Ok(());
    }
    if ctx.db.account().handle().find(&handle).is_some() {
        return Err(format!("handle '{handle}' is taken"));
    }

    let cfg = config(ctx);
    let mut account = Account {
        identity: ctx.sender(),
        handle,
        bankroll: 0,
        lifetime_won: 0,
        lifetime_lost: 0,
        games_played: 0,
        games_won: 0,
        registered_at: ctx.timestamp,
        banned: false,
    };
    credit(ctx, &mut account, "signup_bonus", cfg.starting_capital, None);
    ctx.db.account().insert(account);
    Ok(())
}

/// Open a table and take the first seat. The join window starts now.
#[spacetimedb::reducer]
pub fn create_game(ctx: &ReducerContext, name: String, small_blind: i64, buy_in: i64) -> Result<(), String> {
    let cfg = config(ctx);
    let account = require_account(ctx)?;
    if small_blind <= 0 || buy_in < small_blind * 4 {
        return Err("buy-in must be at least four big blinds".into());
    }
    if account.bankroll < buy_in {
        return Err("not enough bankroll for this buy-in".into());
    }
    if ctx.db.seat().account().find(ctx.sender()).is_some() {
        return Err("already seated at a game — leave it first".into());
    }

    let starts_at = ctx.timestamp + Duration::from_secs(cfg.join_window_secs);
    let game = ctx.db.game().insert(Game {
        game_id: 0,
        name: if name.trim().is_empty() { "Table".into() } else { name },
        created_by: ctx.sender(),
        small_blind,
        big_blind: small_blind * 2,
        buy_in,
        status: STATUS_WAITING.into(),
        seats_taken: 0,
        observers: 0,
        hand_no: 0,
        pot: 0,
        board: String::new(),
        street: STREET_PREFLOP.into(),
        to_act_seat: None,
        current_bet: 0,
        starts_at,
        created_at: ctx.timestamp,
        ended_at: None,
        winner: None,
    });

    // One-shot timer: the join window closing is what locks the play set.
    ctx.db.start_timer().insert(StartTimer {
        scheduled_id: 0,
        scheduled_at: starts_at.into(),
        game_id: game.game_id,
    });

    seat_player(ctx, game.game_id)?;
    Ok(())
}

/// Take a seat at a game that is still in its join window.
#[spacetimedb::reducer]
pub fn join_game(ctx: &ReducerContext, game_id: u64) -> Result<(), String> {
    let game = ctx.db.game().game_id().find(game_id).ok_or("no such game")?;
    if game.status != STATUS_WAITING {
        return Err("this game has already started — you can observe it instead".into());
    }
    seat_player(ctx, game_id)
}

fn seat_player(ctx: &ReducerContext, game_id: u64) -> Result<(), String> {
    let cfg = config(ctx);
    let mut game = ctx.db.game().game_id().find(game_id).ok_or("no such game")?;
    let mut account = require_account(ctx)?;

    if ctx.db.seat().account().find(ctx.sender()).is_some() {
        return Err("already seated at a game — a player may only join one at a time".into());
    }
    if game.seats_taken >= cfg.max_seats {
        return Err("this table is full".into());
    }
    if account.bankroll < game.buy_in {
        return Err("not enough bankroll for this buy-in".into());
    }

    // bankroll → chips. The seat now holds the stake.
    credit(ctx, &mut account, "buy_in", -game.buy_in, Some(game_id));
    let handle = account.handle.clone();
    ctx.db.account().identity().update(account);

    ctx.db.seat().insert(Seat {
        seat_id: 0,
        game_id,
        seat_no: game.seats_taken,
        account: ctx.sender(),
        handle: handle.clone(),
        chips: game.buy_in,
        committed: 0,
        state: SEAT_ACTIVE.into(),
        joined_at: ctx.timestamp,
    });

    game.seats_taken += 1;
    log_event(ctx, &game, "join", &handle, game.buy_in, "");
    ctx.db.game().game_id().update(game);
    Ok(())
}

/// Watch a game. Allowed at any status, including after it has ended.
#[spacetimedb::reducer]
pub fn observe_game(ctx: &ReducerContext, game_id: u64) -> Result<(), String> {
    let mut game = ctx.db.game().game_id().find(game_id).ok_or("no such game")?;
    let account = require_account(ctx)?;
    let already = ctx
        .db
        .observer()
        .game_id()
        .filter(game_id)
        .any(|o| o.account == ctx.sender());
    if already {
        return Ok(());
    }
    ctx.db.observer().insert(Observer {
        observer_id: 0,
        game_id,
        account: ctx.sender(),
        handle: account.handle,
        since: ctx.timestamp,
    });
    game.observers += 1;
    ctx.db.game().game_id().update(game);
    Ok(())
}

#[spacetimedb::reducer]
pub fn stop_observing(ctx: &ReducerContext, game_id: u64) -> Result<(), String> {
    let Some(observer) = ctx
        .db
        .observer()
        .game_id()
        .filter(game_id)
        .find(|o| o.account == ctx.sender())
    else {
        return Ok(());
    };
    ctx.db.observer().observer_id().delete(observer.observer_id);
    if let Some(mut game) = ctx.db.game().game_id().find(game_id) {
        game.observers = game.observers.saturating_sub(1);
        ctx.db.game().game_id().update(game);
    }
    Ok(())
}

/// Leave a table, cashing chips back into the bankroll and releasing the seat.
#[spacetimedb::reducer]
pub fn leave_game(ctx: &ReducerContext) -> Result<(), String> {
    let seat = ctx.db.seat().account().find(ctx.sender()).ok_or("not seated")?;
    cash_out(ctx, &seat);
    let game_id = seat.game_id;
    ctx.db.seat().seat_id().delete(seat.seat_id);
    if let Some(mut game) = ctx.db.game().game_id().find(game_id) {
        game.seats_taken = game.seats_taken.saturating_sub(1);
        let in_play = game.status == STATUS_PLAYING;
        ctx.db.game().game_id().update(game);
        if in_play {
            dealer::advance(ctx, game_id);
        }
    }
    Ok(())
}

/// Move a seat's chips back to its owner's bankroll, recording the movement.
fn cash_out(ctx: &ReducerContext, seat: &Seat) {
    let Some(mut account) = ctx.db.account().identity().find(seat.account) else {
        return;
    };
    if seat.chips > 0 {
        credit(ctx, &mut account, "cash_out", seat.chips, Some(seat.game_id));
    }
    ctx.db.account().identity().update(account);
}

fn require_account(ctx: &ReducerContext) -> Result<Account, String> {
    let account = ctx
        .db
        .account()
        .identity()
        .find(ctx.sender())
        .ok_or("register first")?;
    if account.banned {
        return Err("this account is banned".into());
    }
    Ok(account)
}

// ---------------------------------------------------------------------------
// Admin reducers
// ---------------------------------------------------------------------------

#[spacetimedb::reducer]
pub fn credit_account(ctx: &ReducerContext, handle: String, amount: i64) -> Result<(), String> {
    let mut account = ctx.db.account().handle().find(&handle).ok_or("no such account")?;
    credit(ctx, &mut account, "admin_credit", amount, None);
    ctx.db.account().identity().update(account);
    Ok(())
}

#[spacetimedb::reducer]
pub fn ban_account(ctx: &ReducerContext, handle: String, banned: bool) -> Result<(), String> {
    let mut account = ctx.db.account().handle().find(&handle).ok_or("no such account")?;
    account.banned = banned;
    ctx.db.account().identity().update(account);
    Ok(())
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

/// Take your turn. `action` is `fold` | `check` | `call` | `raise`; `amount` is
/// the total you want committed on this street, and is ignored except on a raise.
#[spacetimedb::reducer]
pub fn act(ctx: &ReducerContext, action: String, amount: i64) -> Result<(), String> {
    let seat = ctx.db.seat().account().find(ctx.sender()).ok_or("not seated")?;
    dealer::handle_action(ctx, seat, &action, amount)
}

// ---------------------------------------------------------------------------
// Scheduled reducers
//
// Thin wrappers: the rules live in `dealer`, and these only translate a fired
// timer into a call. Both are no-ops when the game has moved on, so a stale
// timer can never corrupt a hand.
// ---------------------------------------------------------------------------

/// Fires when a game's join window closes: locks the play set and deals.
#[spacetimedb::reducer]
pub fn start_game(ctx: &ReducerContext, timer: StartTimer) {
    dealer::start(ctx, timer.game_id);
}

/// Fires when a player has sat on their turn past the timeout: folds them.
#[spacetimedb::reducer]
pub fn turn_timeout(ctx: &ReducerContext, timer: TurnTimer) {
    dealer::timeout(ctx, timer.game_id, timer.seat_id, timer.hand_no);
}

/// Close a game early — the admin counterpart to letting it play out.
#[spacetimedb::reducer]
pub fn close_game(ctx: &ReducerContext, game_id: u64) -> Result<(), String> {
    let game = ctx.db.game().game_id().find(game_id).ok_or("no such game")?;
    if game.status == STATUS_ENDED {
        return Ok(());
    }
    dealer::end_game(ctx, game, None);
    Ok(())
}

#[spacetimedb::reducer]
pub fn set_config(
    ctx: &ReducerContext,
    starting_capital: i64,
    join_window_secs: u64,
    turn_timeout_secs: u64,
) -> Result<(), String> {
    let mut cfg = config(ctx);
    cfg.starting_capital = starting_capital;
    cfg.join_window_secs = join_window_secs;
    cfg.turn_timeout_secs = turn_timeout_secs;
    ctx.db.config().id().update(cfg);
    Ok(())
}
