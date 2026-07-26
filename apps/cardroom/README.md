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

# 2. publish the module — the trailing `cardroom` is the database NAME and is
#    required; omit it and you silently get a new nameless database instead
cd module && spacetimedb-cli publish --server local --yes cardroom

# 3. deal some players in — outcomes plus a running fleet total
cargo run -p cardroom-client -- -n 5 --prefix fleet

# 4. in another terminal, one player with a full hand history
cargo run -p cardroom-client -- -n 1 --prefix solo

# 5. point vantage-ui at the inventory (in the vantage-ui repo)
cargo run -p vantage-ui -- --config ../vantage-ui-examples/apps/cardroom/inventory
```

```admonish warning title="The database name is a positional argument"
`spacetimedb-cli publish --server local` with no name **succeeds** — it creates a fresh, nameless
database and prints its identity. Nothing warns you, and every later command that says `cardroom`
then talks to a different database than the one you just published. If a publish reports
*"Created new database with identity: …"* rather than *"…with name: cardroom"*, that is what
happened. Delete it and republish with the name:

    spacetimedb-cli delete --server local <that-identity>
    spacetimedb-cli publish --server local --yes cardroom
```

**Every run creates new players.** Each gets a fresh identity from the host and a handle tagged with
a random per-run string (`fleet-a1hk-0`), because handles are unique in the module — reusing one
would collide with the account that already owns it. `--prefix` is only there to keep the output
readable when several runs are going at once. Old accounts stay behind, which is the point: they are
the history the dashboard reads.

**Running one player alone will not deal a hand.** A game needs at least two. The table now *stays
open* while it waits rather than being binned every join window, so a second player arriving a minute
later still finds it — but nothing happens until one does. After three unfilled tables the client
says so and tells you what to run.

`-c N` stops after N games. It is honoured only with `-n 1`; a fleet exists to generate continuous
load, and says so rather than quietly stopping.

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

The last figure is this run's **profit and loss** against everyone else at the tables — `staked`
counts both seat chips and the live pots of tables these players sit at.

```admonish note title="Why P&L and not a conservation check"
This started life as a chip-conservation check: players cannot create money, so `bankroll + staked`
*should* equal what was granted. It reported drift constantly, and the drift was real — but the
conclusion was wrong. Tables are shared between runs, so these players win chips from, and lose them
to, players started by other processes. Their total is *supposed* to diverge from this run's signup
bonuses.

House-wide conservation genuinely is an invariant, and it holds — summing every account, seat and pot
in the database against total bonuses comes to exactly zero. It just cannot be checked from one run's
slice of the accounts, which is the mistake this line used to make.
```

## Installing the CLI

The `spacetimedb-cli` crate on crates.io is far behind the server (1.3.0 against a 2.7 host), and an
old CLI generates stale-protocol bindings. Install from the tag that matches the image instead:

```bash
cargo install --git https://github.com/clockworklabs/SpacetimeDB \
    --tag v2.7.0-hotfix3 spacetimedb-cli --locked
```

```admonish note title="It installs as `spacetimedb-cli`, not `spacetime`"
The official docs all say `spacetime …`, but `cargo install` names the binary after the crate. This
README uses `spacetimedb-cli` throughout to match what you actually get. If you would rather follow
the upstream docs verbatim, alias it:

    ln -s ~/.cargo/bin/spacetimedb-cli ~/.cargo/bin/spacetime
```

`spacetimedb-cli login` needs a TTY, which makes it awkward from a script. Against a local host you
can mint an identity over HTTP instead:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/v1/identity | jq -r .token)
spacetimedb-cli login --token "$TOKEN"
```

Publishing also prints *"Could not find wasm-opt to optimise the module"*. That is harmless — the
module is published unoptimised, which is fine for a demo. Install
[binaryen](https://github.com/WebAssembly/binaryen/releases) if you want it quiet.

## Writes need the owner's identity

SpacetimeDB restricts SQL `INSERT`/`UPDATE`/`DELETE` to the identity that **published** the database.
Any other valid token is refused with *"not authorized to run SQL DML statements"*. Reducers are the
write path open to everyone else, which is the idiomatic route anyway — they enforce the module's own
rules, and raw DML bypasses them.

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
