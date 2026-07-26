//! The dealer: dealing, betting rounds, street progression and showdown.
//!
//! Plain functions rather than reducers, so the thin scheduled reducers in
//! `lib.rs` stay readable and the rules can be reasoned about in one place.
//!
//! The betting model is a simplified but honest Texas Hold'em: blinds, four
//! streets, fold/check/call/raise, all-in as a capped call, and a showdown that
//! splits ties. It is deliberately *not* a full implementation — there are no
//! side pots. A player who is all-in for less than the current bet still
//! contests the whole pot, which is wrong at a real table and completely
//! adequate for a demo whose purpose is to generate correct, continuous change
//! for a change feed to carry. The simplification is contained here, and chips
//! are still conserved.

use spacetimedb::{ReducerContext, ScheduleAt, Table, Timestamp};
use std::time::Duration;

use crate::poker::{DECK, cards_name, evaluate};
// Glob import on purpose: `#[table]` generates an accessor trait per table
// (`ctx.db.seat()`, `ctx.db.game()`, …) and those traits must be in scope for
// the calls below to resolve. Naming each one individually would be a long list
// that has to be edited every time a table is added.
use crate::*;

/// Seats still able to act (not folded, not busted).
fn live_seats(ctx: &ReducerContext, game_id: u64) -> Vec<Seat> {
    let mut seats: Vec<Seat> = ctx
        .db
        .seat()
        .game_id()
        .filter(game_id)
        .filter(|s| s.state == SEAT_ACTIVE || s.state == SEAT_ALLIN)
        .collect();
    seats.sort_by_key(|s| s.seat_no);
    seats
}

/// Seats that can still be asked to act — all-in players cannot.
fn actionable(ctx: &ReducerContext, game_id: u64) -> Vec<Seat> {
    let mut seats: Vec<Seat> = ctx
        .db
        .seat()
        .game_id()
        .filter(game_id)
        .filter(|s| s.state == SEAT_ACTIVE)
        .collect();
    seats.sort_by_key(|s| s.seat_no);
    seats
}

/// Decide whether a waiting table is ready to deal.
///
/// Called by every start timer — the one armed at creation, and the shorter one
/// armed when the table reaches `min_players`. Several may be in flight at once,
/// so this is written to be safe to run repeatedly: it re-reads the game, and
/// does nothing unless the table is still waiting and its countdown has expired.
///
/// An under-subscribed table is **kept open** and re-armed rather than
/// abandoned. Binning it after a single window is what made a lone player churn
/// through tables: every 10 seconds it lost its seat, found no one waiting, and
/// opened another — so two lone players could never find each other.
pub fn start(ctx: &ReducerContext, game_id: u64) {
    let Some(mut game) = ctx.db.game().game_id().find(game_id) else {
        return;
    };
    if game.status != crate::STATUS_WAITING {
        return;
    }

    let cfg = config(ctx);
    let seated = ctx.db.seat().game_id().filter(game_id).count() as u32;

    if seated < cfg.min_players {
        game.wait_rounds += 1;
        if game.wait_rounds >= cfg.max_wait_rounds {
            log_event(ctx, &game, "abandoned", "", 0, "not enough players joined");
            end_game(ctx, game, None);
            return;
        }
        // Still hopeful: hold the table open and look again after another window.
        let next = ctx.timestamp + Duration::from_secs(cfg.join_window_secs);
        game.starts_at = next;
        ctx.db.game().game_id().update(game);
        ctx.db.start_timer().insert(StartTimer {
            scheduled_id: 0,
            scheduled_at: next.into(),
            game_id,
        });
        return;
    }

    // Enough players, but a later joiner may have pushed the countdown back.
    if ctx.timestamp < game.starts_at {
        let starts_at = game.starts_at;
        ctx.db.start_timer().insert(StartTimer {
            scheduled_id: 0,
            scheduled_at: starts_at.into(),
            game_id,
        });
        return;
    }

    game.status = STATUS_PLAYING.into();
    log_event(ctx, &game, "start", "", 0, &format!("{seated} players"));
    ctx.db.game().game_id().update(game);
    deal_hand(ctx, game_id);
}

/// A player vanished: cash their seat out and free it.
///
/// Without this a dropped client leaves a seat behind that the turn timer folds
/// forever — a zombie occupying one of `max_seats` and, because `seat.account`
/// is unique, locking that account out of every future table. The chips are
/// returned rather than forfeited, so a disconnect cannot mint or destroy money.
pub fn abandon_seat(ctx: &ReducerContext, account: spacetimedb::Identity) {
    let Some(seat) = ctx.db.seat().account().find(account) else {
        return;
    };
    let game_id = seat.game_id;
    let handle = seat.handle.clone();
    let seat_id = seat.seat_id;
    let was_to_act = ctx
        .db
        .game()
        .game_id()
        .find(game_id)
        .map(|g| g.to_act_seat == Some(seat_id))
        .unwrap_or(false);

    crate::cash_out(ctx, &seat);
    ctx.db.seat().seat_id().delete(seat_id);

    if let Some(mut game) = ctx.db.game().game_id().find(game_id) {
        game.seats_taken = game.seats_taken.saturating_sub(1);
        let playing = game.status == STATUS_PLAYING;
        log_event(ctx, &game, "disconnect", &handle, 0, "left the table");
        ctx.db.game().game_id().update(game);
        // If it was their turn, the hand would otherwise stall until the turn
        // timer fired; move it along now.
        if playing || was_to_act {
            advance(ctx, game_id);
        }
    }
}

/// Shuffle, deal two cards to each live seat, post blinds, and put the action on
/// the first player.
pub fn deal_hand(ctx: &ReducerContext, game_id: u64) {
    let Some(mut game) = ctx.db.game().game_id().find(game_id) else {
        return;
    };

    // Anyone out of chips is done; if that leaves one player, the game is over.
    for mut seat in ctx.db.seat().game_id().filter(game_id) {
        if seat.chips <= 0 && seat.state != SEAT_BUSTED {
            seat.state = SEAT_BUSTED.into();
            ctx.db.seat().seat_id().update(seat);
        }
    }
    let mut contenders: Vec<Seat> = ctx
        .db
        .seat()
        .game_id()
        .filter(game_id)
        .filter(|s| s.chips > 0)
        .collect();
    contenders.sort_by_key(|s| s.seat_no);

    if contenders.len() < 2 {
        let winner = contenders.first().map(|s| s.account);
        log_event(ctx, &game, "game_over", "", 0, "one player left standing");
        end_game(ctx, game, winner);
        return;
    }

    // Fresh deck each hand. `ctx.rng()` is the host's RNG — a module must not
    // reach for thread-local randomness, because reducers have to be replayable.
    let mut deck: Vec<u8> = (0..DECK).collect();
    shuffle(ctx, &mut deck);

    ctx.db.hole_cards().game_id().delete(game_id);
    for seat in &contenders {
        let card_a = deck.pop().unwrap();
        let card_b = deck.pop().unwrap();
        ctx.db.hole_cards().insert(HoleCards {
            id: 0,
            game_id,
            seat_id: seat.seat_id,
            account: seat.account,
            card_a,
            card_b,
        });
    }

    // The board is dealt up front and revealed street by street, which is how a
    // real deal works and keeps street progression a pure state change.
    let board: Vec<u8> = (0..5).map(|_| deck.pop().unwrap()).collect();

    for mut seat in ctx.db.seat().game_id().filter(game_id) {
        seat.committed = 0;
        seat.state = if seat.chips > 0 {
            SEAT_ACTIVE.into()
        } else {
            SEAT_BUSTED.into()
        };
        ctx.db.seat().seat_id().update(seat);
    }

    game.hand_no += 1;
    game.pot = 0;
    game.street = STREET_PREFLOP.into();
    game.board = board_cache(&board);
    game.current_bet = 0;
    log_event(ctx, &game, "deal", "", 0, &format!("hand {}", game.hand_no));
    ctx.db.game().game_id().update(game.clone());

    // Blinds: the first two seats in rotation, offset by the hand number so the
    // burden moves around the table.
    let n = contenders.len();
    let sb_idx = (game.hand_no as usize) % n;
    let bb_idx = (sb_idx + 1) % n;
    post_blind(
        ctx,
        game_id,
        contenders[sb_idx].seat_id,
        game.small_blind,
        "small_blind",
    );
    post_blind(
        ctx,
        game_id,
        contenders[bb_idx].seat_id,
        game.big_blind,
        "big_blind",
    );

    let first = contenders[(bb_idx + 1) % n].seat_id;
    set_to_act(ctx, game_id, Some(first));
}

/// Fisher-Yates over the host RNG.
fn shuffle(ctx: &ReducerContext, deck: &mut [u8]) {
    for i in (1..deck.len()).rev() {
        let j = (ctx.random::<u32>() as usize) % (i + 1);
        deck.swap(i, j);
    }
}

/// The five board cards, stored as text and revealed progressively by
/// [`visible_board`].
fn board_cache(board: &[u8]) -> String {
    cards_name(board)
}

/// How much of the board the current street shows.
pub fn visible_board(game: &Game) -> Vec<String> {
    let all: Vec<String> = game.board.split_whitespace().map(str::to_string).collect();
    let n = match game.street.as_str() {
        STREET_PREFLOP => 0,
        STREET_FLOP => 3,
        STREET_TURN => 4,
        _ => 5,
    };
    all.into_iter().take(n).collect()
}

fn post_blind(ctx: &ReducerContext, game_id: u64, seat_id: u64, blind: i64, kind: &str) {
    let Some(mut seat) = ctx.db.seat().seat_id().find(seat_id) else {
        return;
    };
    let Some(mut game) = ctx.db.game().game_id().find(game_id) else {
        return;
    };
    let amount = blind.min(seat.chips);
    seat.chips -= amount;
    seat.committed += amount;
    if seat.chips == 0 {
        seat.state = SEAT_ALLIN.into();
    }
    game.pot += amount;
    game.current_bet = game.current_bet.max(seat.committed);
    let handle = seat.handle.clone();
    ctx.db.seat().seat_id().update(seat);
    log_event(ctx, &game, kind, &handle, amount, "");
    ctx.db.game().game_id().update(game);
}

/// Put the action on a seat and arm its turn timer.
fn set_to_act(ctx: &ReducerContext, game_id: u64, seat_id: Option<u64>) {
    let Some(mut game) = ctx.db.game().game_id().find(game_id) else {
        return;
    };
    game.to_act_seat = seat_id;
    let hand_no = game.hand_no;
    ctx.db.game().game_id().update(game);

    if let Some(seat_id) = seat_id {
        let cfg = config(ctx);
        ctx.db.turn_timer().insert(TurnTimer {
            scheduled_id: 0,
            scheduled_at: (ctx.timestamp + Duration::from_secs(cfg.turn_timeout_secs)).into(),
            game_id,
            seat_id,
            hand_no,
        });
    }
}

/// Apply a player's action, then move the game forward.
pub fn handle_action(
    ctx: &ReducerContext,
    seat: Seat,
    action: &str,
    amount: i64,
) -> Result<(), String> {
    let game_id = seat.game_id;
    let Some(mut game) = ctx.db.game().game_id().find(game_id) else {
        return Err("no such game".into());
    };
    if game.status != STATUS_PLAYING {
        return Err("this game is not in play".into());
    }
    if game.to_act_seat != Some(seat.seat_id) {
        return Err("not your turn".into());
    }

    let mut seat = seat;
    let owed = (game.current_bet - seat.committed).max(0);
    let handle = seat.handle.clone();

    match action {
        "fold" => {
            seat.state = SEAT_FOLDED.into();
            log_event(ctx, &game, "fold", &handle, 0, "");
        }
        "check" | "call" => {
            let pay = owed.min(seat.chips);
            seat.chips -= pay;
            seat.committed += pay;
            game.pot += pay;
            if seat.chips == 0 {
                seat.state = SEAT_ALLIN.into();
            }
            log_event(
                ctx,
                &mut game,
                if pay == 0 { "check" } else { "call" },
                &handle,
                pay,
                "",
            );
        }
        "raise" | "bet" => {
            // `amount` is the total this player wants to have committed.
            let target = amount.max(game.current_bet + game.big_blind);
            let pay = (target - seat.committed).min(seat.chips);
            if pay <= owed {
                return Err("a raise must exceed the current bet".into());
            }
            seat.chips -= pay;
            seat.committed += pay;
            game.pot += pay;
            game.current_bet = game.current_bet.max(seat.committed);
            if seat.chips == 0 {
                seat.state = SEAT_ALLIN.into();
            }
            log_event(ctx, &game, "raise", &handle, pay, "");
        }
        other => return Err(format!("unknown action '{other}'")),
    }

    ctx.db.seat().seat_id().update(seat);
    ctx.db.game().game_id().update(game);
    advance(ctx, game_id);
    Ok(())
}

/// Move the game on: next player, next street, or showdown.
pub fn advance(ctx: &ReducerContext, game_id: u64) {
    let Some(game) = ctx.db.game().game_id().find(game_id) else {
        return;
    };
    if game.status != STATUS_PLAYING {
        return;
    }

    let live = live_seats(ctx, game_id);
    if live.len() <= 1 {
        // Everyone else folded — the pot goes over uncontested, no showdown.
        award(
            ctx,
            game_id,
            live.iter().map(|s| s.seat_id).collect(),
            "uncontested",
        );
        return;
    }

    let can_act = actionable(ctx, game_id);
    let everyone_matched = can_act.iter().all(|s| s.committed >= game.current_bet);

    // A street ends once every player who *can* act has matched the bet. If
    // nobody can act (all-in), streets run out automatically to showdown.
    if can_act.is_empty() || (everyone_matched && street_had_action(ctx, game_id, &game)) {
        next_street(ctx, game_id);
        return;
    }

    // Next actionable seat after the current one, wrapping.
    let current = game.to_act_seat;
    let next = can_act
        .iter()
        .find(|s| Some(s.seat_id) != current && s.committed < game.current_bet)
        .or_else(|| can_act.iter().find(|s| Some(s.seat_id) != current))
        .map(|s| s.seat_id);
    set_to_act(ctx, game_id, next);
}

/// Whether anyone has acted on this street yet.
///
/// Without this a street would close the instant it opened, since with no bet
/// posted every player trivially "matches" zero.
fn street_had_action(ctx: &ReducerContext, game_id: u64, game: &Game) -> bool {
    game.current_bet > 0
        || ctx
            .db
            .seat()
            .game_id()
            .filter(game_id)
            .any(|s| s.state == SEAT_FOLDED || s.state == SEAT_ALLIN)
        || game.to_act_seat.is_none()
}

fn next_street(ctx: &ReducerContext, game_id: u64) {
    let Some(mut game) = ctx.db.game().game_id().find(game_id) else {
        return;
    };

    let next = match game.street.as_str() {
        STREET_PREFLOP => STREET_FLOP,
        STREET_FLOP => STREET_TURN,
        STREET_TURN => STREET_RIVER,
        _ => STREET_SHOWDOWN,
    };

    if next == STREET_SHOWDOWN {
        showdown(ctx, game_id);
        return;
    }

    game.street = next.into();
    game.current_bet = 0;
    for mut seat in ctx.db.seat().game_id().filter(game_id) {
        seat.committed = 0;
        ctx.db.seat().seat_id().update(seat);
    }
    let shown = visible_board(&game).join(" ");
    log_event(ctx, &game, next, "", game.pot, &shown);
    ctx.db.game().game_id().update(game);

    let first = actionable(ctx, game_id).first().map(|s| s.seat_id);
    set_to_act(ctx, game_id, first);
}

/// Compare hands and award the pot, splitting on a tie.
fn showdown(ctx: &ReducerContext, game_id: u64) {
    let Some(mut game) = ctx.db.game().game_id().find(game_id) else {
        return;
    };
    game.street = STREET_SHOWDOWN.into();
    ctx.db.game().game_id().update(game.clone());

    let board = parse_board(&game.board);
    let mut best: Option<(u32, Vec<u64>)> = None;

    for seat in live_seats(ctx, game_id) {
        let Some(hole) = ctx.db.hole_cards().seat_id().filter(seat.seat_id).next() else {
            continue;
        };
        let mut cards = board.clone();
        cards.push(hole.card_a);
        cards.push(hole.card_b);
        let rank = evaluate(&cards);
        let detail = format!(
            "{} with {}",
            rank.category.name(),
            cards_name(&[hole.card_a, hole.card_b])
        );
        log_event(ctx, &game, "show", &seat.handle, 0, &detail);

        // Ties accumulate rather than replace, which is what lets `award` split a
        // pot instead of arbitrarily picking one of two identical hands.
        best = match best {
            None => Some((rank.score, vec![seat.seat_id])),
            Some((score, _)) if rank.score > score => Some((rank.score, vec![seat.seat_id])),
            Some((score, mut ids)) if rank.score == score => {
                ids.push(seat.seat_id);
                Some((score, ids))
            }
            other => other,
        };
    }
    ctx.db.game().game_id().update(game);

    let winners = best.map(|(_, ids)| ids).unwrap_or_default();
    award(ctx, game_id, winners, "showdown");
}

fn parse_board(board: &str) -> Vec<u8> {
    board
        .split_whitespace()
        .filter_map(|t| {
            let mut chars = t.chars();
            let r = "23456789TJQKA".find(chars.next()?)? as u8;
            let s = "cdhs".find(chars.next()?)? as u8;
            Some(r * 4 + s)
        })
        .collect()
}

/// Hand the pot to the winners and start the next hand.
///
/// The remainder of an odd split goes to the first winner rather than being
/// dropped — chips must be conserved exactly, or the ledger stops balancing.
fn award(ctx: &ReducerContext, game_id: u64, winners: Vec<u64>, why: &str) {
    let Some(mut game) = ctx.db.game().game_id().find(game_id) else {
        return;
    };
    if winners.is_empty() {
        ctx.db.game().game_id().update(game);
        return;
    }

    let share = game.pot / winners.len() as i64;
    let mut remainder = game.pot - share * winners.len() as i64;

    for seat_id in &winners {
        let Some(mut seat) = ctx.db.seat().seat_id().find(*seat_id) else {
            continue;
        };
        let mut take = share;
        if remainder > 0 {
            take += remainder;
            remainder = 0;
        }
        seat.chips += take;
        let handle = seat.handle.clone();
        let account_id = seat.account;
        ctx.db.seat().seat_id().update(seat);
        log_event(ctx, &game, "win", &handle, take, why);

        if let Some(mut account) = ctx.db.account().identity().find(account_id) {
            account.lifetime_won += take;
            ctx.db.account().identity().update(account);
        }
    }

    game.pot = 0;
    game.to_act_seat = None;
    ctx.db.game().game_id().update(game);
    deal_hand(ctx, game_id);
}

/// Close a game: cash every seat out, release the seats, and stamp the result.
pub fn end_game(ctx: &ReducerContext, mut game: Game, winner: Option<spacetimedb::Identity>) {
    for seat in ctx.db.seat().game_id().filter(game.game_id) {
        crate::cash_out(ctx, &seat);
        if let Some(mut account) = ctx.db.account().identity().find(seat.account) {
            account.games_played += 1;
            if Some(account.identity) == winner {
                account.games_won += 1;
            }
            ctx.db.account().identity().update(account);
        }
        // Releasing the seat is what frees the unique-account slot, letting the
        // player join another game. A lingering row would lock them out forever.
        ctx.db.seat().seat_id().delete(seat.seat_id);
    }
    ctx.db.hole_cards().game_id().delete(game.game_id);

    game.status = STATUS_ENDED.into();
    game.ended_at = Some(ctx.timestamp);
    game.winner = winner;
    game.to_act_seat = None;
    game.seats_taken = 0;
    ctx.db.game().game_id().update(game);
}

/// A player who ran out of time folds, so one stalled client cannot wedge a
/// table — and, with the unique-account constraint, lock its own account out of
/// every future game.
pub fn timeout(ctx: &ReducerContext, game_id: u64, seat_id: u64, hand_no: u32) {
    let Some(game) = ctx.db.game().game_id().find(game_id) else {
        return;
    };
    // Ignore a timer whose hand has already moved on, or whose player has
    // already acted — otherwise a slow-but-not-stalled client gets punished.
    if game.status != STATUS_PLAYING || game.hand_no != hand_no || game.to_act_seat != Some(seat_id)
    {
        return;
    }
    let Some(seat) = ctx.db.seat().seat_id().find(seat_id) else {
        return;
    };
    let _ = handle_action(ctx, seat, "fold", 0);
}

/// Unused import guard: `Timestamp` and `ScheduleAt` are referenced through
/// `.into()` conversions above.
#[allow(dead_code)]
fn _type_anchors(_t: Timestamp, _s: ScheduleAt) {}
