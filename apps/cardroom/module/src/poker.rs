//! Cards and hand evaluation.
//!
//! Deliberately dependency-free: this compiles to `wasm32-unknown-unknown`
//! inside the database, and a table-driven evaluator is both smaller and easier
//! to reason about than pulling a crate in for one function.
//!
//! A card is a `u8` in `0..52`, with `rank = card / 4` (0 = deuce … 12 = ace)
//! and `suit = card % 4`. Packing it this way keeps the deck a plain byte array
//! and makes rank histograms a 13-element count.

/// Number of cards in a deck.
pub const DECK: u8 = 52;

pub fn rank_of(card: u8) -> u8 {
    card / 4
}

pub fn suit_of(card: u8) -> u8 {
    card % 4
}

/// `"As"`, `"Td"`, `"2c"` — the conventional shorthand, for event logs and the UI.
pub fn card_name(card: u8) -> String {
    const RANKS: [char; 13] = [
        '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A',
    ];
    const SUITS: [char; 4] = ['c', 'd', 'h', 's'];
    format!(
        "{}{}",
        RANKS[rank_of(card) as usize],
        SUITS[suit_of(card) as usize]
    )
}

/// Render a slice of cards as `"As Td 2c"`.
pub fn cards_name(cards: &[u8]) -> String {
    cards
        .iter()
        .map(|c| card_name(*c))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Hand categories, ordered so a larger value always beats a smaller one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Category {
    HighCard = 0,
    Pair = 1,
    TwoPair = 2,
    Trips = 3,
    Straight = 4,
    Flush = 5,
    FullHouse = 6,
    Quads = 7,
    StraightFlush = 8,
}

impl Category {
    pub fn name(self) -> &'static str {
        match self {
            Category::HighCard => "high card",
            Category::Pair => "pair",
            Category::TwoPair => "two pair",
            Category::Trips => "three of a kind",
            Category::Straight => "straight",
            Category::Flush => "flush",
            Category::FullHouse => "full house",
            Category::Quads => "four of a kind",
            Category::StraightFlush => "straight flush",
        }
    }
}

/// A comparable hand strength.
///
/// The score packs the category above five rank tiebreakers, four bits each, so
/// a plain integer comparison ranks any two hands correctly and ties compare
/// equal — which is what lets the showdown split a pot without a special case.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct HandRank {
    pub score: u32,
    pub category: Category,
}

impl HandRank {
    fn new(category: Category, ranks: [u8; 5]) -> Self {
        let mut score = category as u32;
        for r in ranks {
            score = (score << 4) | r as u32;
        }
        Self { score, category }
    }
}

/// Best five-card hand from any 5–7 cards.
///
/// Works directly on rank histograms rather than enumerating the 21 five-card
/// subsets: with at most seven cards there is only ever one best category, and
/// the tiebreakers fall out of the sorted histogram.
pub fn evaluate(cards: &[u8]) -> HandRank {
    let mut rank_counts = [0u8; 13];
    let mut suit_counts = [0u8; 4];
    // Per-suit rank bitsets, so a straight flush can be found without a second pass.
    let mut suit_ranks = [0u16; 4];

    for &card in cards {
        let r = rank_of(card) as usize;
        let s = suit_of(card) as usize;
        rank_counts[r] += 1;
        suit_counts[s] += 1;
        suit_ranks[s] |= 1 << r;
    }

    let rank_bits: u16 = (0..13).fold(0u16, |acc, r| {
        if rank_counts[r] > 0 {
            acc | (1 << r)
        } else {
            acc
        }
    });

    let flush_suit = (0..4).find(|&s| suit_counts[s] >= 5);

    // Straight flush first: it outranks everything, and it is only ever found
    // within the flush suit's own ranks.
    if let Some(suit) = flush_suit
        && let Some(high) = straight_high(suit_ranks[suit])
    {
        return HandRank::new(Category::StraightFlush, [high, 0, 0, 0, 0]);
    }

    // Ranks grouped by multiplicity, each group ordered high to low. `by_count`
    // is what every remaining category reads its tiebreakers from.
    let mut by_count: Vec<(u8, u8)> = (0..13u8)
        .filter(|r| rank_counts[*r as usize] > 0)
        .map(|r| (rank_counts[r as usize], r))
        .collect();
    by_count.sort_unstable_by(|a, b| b.cmp(a));

    let quad = by_count.iter().find(|(c, _)| *c == 4).map(|(_, r)| *r);
    let trips: Vec<u8> = by_count
        .iter()
        .filter(|(c, _)| *c == 3)
        .map(|(_, r)| *r)
        .collect();
    let pairs: Vec<u8> = by_count
        .iter()
        .filter(|(c, _)| *c == 2)
        .map(|(_, r)| *r)
        .collect();

    if let Some(q) = quad {
        let kicker = high_ranks_excluding(&by_count, &[q], 1);
        return HandRank::new(Category::Quads, [q, kicker[0], 0, 0, 0]);
    }

    // A full house can be trips + pair, or two sets of trips (the lower set
    // playing as the pair) — possible with seven cards.
    if !trips.is_empty() && (!pairs.is_empty() || trips.len() > 1) {
        let three = trips[0];
        let pair = if trips.len() > 1 {
            trips[1].max(pairs.first().copied().unwrap_or(0))
        } else {
            pairs[0]
        };
        return HandRank::new(Category::FullHouse, [three, pair, 0, 0, 0]);
    }

    if let Some(suit) = flush_suit {
        let mut ranks: Vec<u8> = (0..13u8)
            .rev()
            .filter(|r| suit_ranks[suit] & (1 << r) != 0)
            .collect();
        ranks.truncate(5);
        return HandRank::new(
            Category::Flush,
            [ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]],
        );
    }

    if let Some(high) = straight_high(rank_bits) {
        return HandRank::new(Category::Straight, [high, 0, 0, 0, 0]);
    }

    if !trips.is_empty() {
        let t = trips[0];
        let k = high_ranks_excluding(&by_count, &[t], 2);
        return HandRank::new(Category::Trips, [t, k[0], k[1], 0, 0]);
    }

    if pairs.len() >= 2 {
        let (hi, lo) = (pairs[0], pairs[1]);
        let k = high_ranks_excluding(&by_count, &[hi, lo], 1);
        return HandRank::new(Category::TwoPair, [hi, lo, k[0], 0, 0]);
    }

    if pairs.len() == 1 {
        let p = pairs[0];
        let k = high_ranks_excluding(&by_count, &[p], 3);
        return HandRank::new(Category::Pair, [p, k[0], k[1], k[2], 0]);
    }

    let k = high_ranks_excluding(&by_count, &[], 5);
    HandRank::new(Category::HighCard, [k[0], k[1], k[2], k[3], k[4]])
}

/// Highest rank completing a five-in-a-row within `bits`, or `None`.
///
/// Ranks index 0 = deuce … 12 = ace, and the returned value is the straight's
/// top card. The ace is the one irregular case: it plays high everywhere else,
/// but also completes the wheel (A-2-3-4-5), where the straight is *five*-high
/// and so loses to every other straight.
fn straight_high(bits: u16) -> Option<u8> {
    // Walk down from ace-high; the first window found is the best one.
    for high in (4..=12u8).rev() {
        if (0..5).all(|i| bits & (1 << (high - i)) != 0) {
            return Some(high);
        }
    }
    // Wheel: five, four, three, deuce (ranks 3..0) plus the ace (rank 12).
    let wheel = (0..=3u8).all(|r| bits & (1 << r) != 0) && bits & (1 << 12) != 0;
    wheel.then_some(3)
}

/// The `n` highest ranks in `by_count`, skipping any in `exclude`.
///
/// Padded with zeroes so callers can index fixed positions without bounds
/// checks; a hand always has enough cards for the kickers its category needs.
fn high_ranks_excluding(by_count: &[(u8, u8)], exclude: &[u8], n: usize) -> Vec<u8> {
    let mut ranks: Vec<u8> = by_count
        .iter()
        .map(|(_, r)| *r)
        .filter(|r| !exclude.contains(r))
        .collect();
    ranks.sort_unstable_by(|a, b| b.cmp(a));
    ranks.truncate(n);
    while ranks.len() < n {
        ranks.push(0);
    }
    ranks
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build cards from shorthand like `"As Kd"`, so tests read as poker.
    fn parse(s: &str) -> Vec<u8> {
        s.split_whitespace()
            .map(|t| {
                let mut chars = t.chars();
                let r = chars.next().unwrap();
                let suit = chars.next().unwrap();
                let rank = "23456789TJQKA".find(r).unwrap() as u8;
                let suit = "cdhs".find(suit).unwrap() as u8;
                rank * 4 + suit
            })
            .collect()
    }

    fn cat(s: &str) -> Category {
        evaluate(&parse(s)).category
    }

    #[test]
    fn categories_are_recognised() {
        assert_eq!(cat("As Ks Qs Js Ts"), Category::StraightFlush);
        assert_eq!(cat("As Ac Ad Ah Kd"), Category::Quads);
        assert_eq!(cat("As Ac Ad Kh Kd"), Category::FullHouse);
        assert_eq!(cat("As Ks 9s 5s 2s"), Category::Flush);
        assert_eq!(cat("9c 8d 7h 6s 5c"), Category::Straight);
        assert_eq!(cat("As Ac Ad Kh Qd"), Category::Trips);
        assert_eq!(cat("As Ac Kd Kh Qd"), Category::TwoPair);
        assert_eq!(cat("As Ac Kd Qh Jd"), Category::Pair);
        assert_eq!(cat("As Kc Qd Jh 9d"), Category::HighCard);
    }

    #[test]
    fn the_wheel_is_a_straight_with_the_five_high() {
        // A-2-3-4-5 is the lowest straight, and the ace does not make it ace-high.
        assert_eq!(cat("Ac 2d 3h 4s 5c"), Category::Straight);
        let wheel = evaluate(&parse("Ac 2d 3h 4s 5c"));
        let six_high = evaluate(&parse("2d 3h 4s 5c 6d"));
        assert!(six_high > wheel, "6-high straight must beat the wheel");
    }

    #[test]
    fn best_five_of_seven_is_selected() {
        // Seven cards containing a flush that only appears if the right five are
        // chosen; a naive five-card read of the first cards would miss it.
        assert_eq!(cat("2s 7d As Ks 9s 4s 3h"), Category::Flush);
        // Two sets of trips make a full house, using the lower set as the pair.
        assert_eq!(cat("As Ac Ad Kh Kd Kc 2h"), Category::FullHouse);
    }

    #[test]
    fn higher_kickers_win_within_a_category() {
        let ace_kicker = evaluate(&parse("Ks Kc Ad 7h 2d"));
        let queen_kicker = evaluate(&parse("Ks Kc Qd 7h 2d"));
        assert!(ace_kicker > queen_kicker);
    }

    #[test]
    fn identical_hands_tie_so_pots_can_split() {
        let a = evaluate(&parse("Ks Kc Ad 7h 2d"));
        let b = evaluate(&parse("Kd Kh Ac 7s 2c"));
        assert_eq!(a, b, "same ranks in different suits must compare equal");
    }

    #[test]
    fn straight_flush_beats_quads_beats_full_house() {
        let sf = evaluate(&parse("9s 8s 7s 6s 5s"));
        let quads = evaluate(&parse("As Ac Ad Ah Kd"));
        let boat = evaluate(&parse("As Ac Ad Kh Kd"));
        assert!(sf > quads && quads > boat);
    }
}
