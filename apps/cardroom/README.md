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

### `client/src/module_bindings/` is client code, not server code

It looks server-ish because it is *derived* from the module, but nothing in it runs in the database.
`spacetime generate` reads the module's schema and emits the client half of the contract: row structs
for what this client receives into its cache, typed table handles (`ctx.db.account()`), and reducer
**call stubs** that send `CallReducer` messages over the wire. The relationship is the one an
OpenAPI-generated client has to its API — one schema, two derived sides.

It is committed so `cargo build` works with neither the SpacetimeDB CLI nor Docker installed. The
cost is that it can go stale, so **run `./regenerate-bindings.sh` after any change to a table, view
or reducer** in `module/src/lib.rs`. The directory is marked `linguist-generated`, so reviews collapse
it.

## Run

```bash
# 1. a local host (pinned to the version the CLI is built from)
docker run -d --name cardroom-stdb -p 3000:3000 \
    clockworklabs/spacetime:v2.7.0-hotfix3 start --listen-addr 0.0.0.0:3000

# 2. publish the module
cd module && spacetime publish --server local --yes cardroom

# 3. deal some players in — outcomes plus a running fleet total
cargo run -p cardroom-client -- -n 5 --prefix fleet

# 4. in another terminal, one player with a full hand history
cargo run -p cardroom-client -- -n 1 --prefix solo

# 5. point vantage-ui at the inventory (in the vantage-ui repo)
cargo run -p vantage-ui -- --config ../vantage-ui-examples/apps/cardroom/inventory
```

**Use a different `--prefix` for each process.** It names the players' saved identity tokens, so two
runs do not fight over the same accounts — and so a restart reconnects as the same players rather
than collecting fresh signup bonuses.

## The client has two modes, because it has two jobs

`-n 1` is a debugging lens: a full hand history from that player's point of view, including what
opponents show at a showdown.

```
            dealt Js 7d
            ── hand 3 ──
            fleet-3 posts 25 (small blind)
            flop: board Ac Kc Kd  (pot 500)
            my turn — pot 500, to call 50, my chips 950 → call
            fleet-0 shows pair with Ks Td
            fleet-4 wins 1000 (showdown)
```

Opponents' cards appear **only** at showdown, and that is the database's doing rather than the
client's restraint: `hole_cards` is private, and `my_hole_cards` is a view scoped to the caller. If
this ever prints an opponent's cards early, it is a server bug.

`-n 5` and above drops the play-by-play — twenty streams of it is unreadable — and prints one line
per outcome plus a periodic fleet total:

```
[00:00:40]  players 5 (5 playing, 0 busted)  games 5  pots won 3
            bankroll 45,000  staked 5,000  granted 50,000  ✓ conserved
```

**The `conserved` marker is the point.** Players cannot create money — the only inflow is the signup
bonus — so `bankroll + staked` must always equal what was granted, where `staked` counts both seat
chips and the live pots of tables we sit at. That makes the load client a continuous
chip-conservation check on the dealer: a leak shows up as drift within seconds instead of being found
later by reading a ledger. Drift is reported loudly and the client keeps running, because the size
and direction of the drift is the diagnostic.

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
