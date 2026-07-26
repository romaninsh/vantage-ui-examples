# Cardroom

A multiplayer Texas Hold'em server that lives **entirely inside the database** — schema, dealer,
betting rules and timers are all a [SpacetimeDB](https://spacetimedb.com) module. There is no
application server between the clients and the data.

It exists to give `vantage-spacetimedb` something genuinely alive to read: many parallel games,
per-account balances, an append-only event log, and continuous change with no operator input.

Three parts:

- `module/` — the Rust WASM module: tables, two views, reducers, and scheduled timers that deal
  hands and fold players who stall.
- `client/` — a dumb load client. `-n` spawns tasks; each registers an account and plays until its
  bankroll is gone.
- `inventory/` — the YAML app: live game list, player rankings, and per-game drill-down.

## Run

```bash
# 1. a local host (pinned to the version the CLI is built from)
docker run -d --name cardroom-stdb -p 3000:3000 \
    clockworklabs/spacetime:v2.7.0-hotfix3 start --listen-addr 0.0.0.0:3000

# 2. publish the module
cd module && spacetime publish --server local --yes cardroom

# 3. deal some players in
cargo run -p cardroom-client -- -n 20

# 4. point vantage-ui at the inventory (in the vantage-ui repo)
cargo run -p vantage-ui -- --config ../vantage-ui-examples/apps/cardroom/inventory
```

The CLI on crates.io is far behind the server, so install it from the matching release tag:

```bash
cargo install --git https://github.com/clockworklabs/SpacetimeDB \
    --tag v2.7.0-hotfix3 spacetimedb-cli --locked
```

`spacetime login` needs a TTY. Against a local host you can mint an identity over HTTP instead:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/v1/identity | jq -r .token)
spacetime login --token "$TOKEN"
```

## The player journey

`register` → browse the lobby (the `game` table) → `create_game` or `join_game` → the game locks
after a 10-second join window and deals → `act` on your turn → chips move → repeat until one player
holds them all.

Anyone may `observe_game` at any point, **including after a game has ended** — which is why the
event log is a normal table rather than a SpacetimeDB `event` table, whose rows are deleted in the
same transaction that inserts them.

## Three decisions worth knowing

**Two pots of money.** `account.bankroll` is money you own; `seat.chips` is money on a table.
Joining moves bankroll → chips, leaving moves it back, and every movement writes a `ledger` row.
That separation is what makes "how much has this player won or lost" exact, and it gives a testable
invariant: for every account, `bankroll + chips == starting_capital + sum(ledger)`.

**One game at a time, enforced by the schema.** `seat.account` is `#[unique]`, so a double-join is
impossible rather than merely rejected — the database refuses it even against a buggy client. The
consequence is that seats are deleted when a game ends; a lingering row would hold the unique slot
and lock that account out of every future game. Nothing is lost, because the history lives in
`game_event` and `ledger`.

**Hole cards are private, and the boundary is the database's.** The `hole_cards` table has no
`public` marker, so no client can read it — `SELECT * FROM hole_cards` is refused outright. Players
reach their own cards through the `my_hole_cards` view, which SpacetimeDB scopes to the caller.
Nothing in any UI enforces this.

The second view, `top_players`, computes the leaderboard server-side, because SpacetimeDB's SQL has
no `GROUP BY` or `ORDER BY` — a client cannot rank accounts without pulling every row. It is
deliberately *anonymous* (caller-independent): a per-caller view is recomputed and change-tracked
once per subscriber, which at load-client scale is the difference between cheap and quadratic.

## Turn timeouts are load-bearing

A player who does not act within `turn_timeout_secs` is folded automatically. With many dumb bots
this is not a nicety: one stalled client would otherwise wedge its table forever *and* hold its
unique seat, locking that account out permanently.

It also means the module is self-driving. With two registered identities and no client acting at
all, a game will start, deal, post blinds, fold on timeout, award the pot and deal again — which is
exactly the continuous change a change-feed driver needs to be tested against.
