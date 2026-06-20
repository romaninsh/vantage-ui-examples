# Launch Control

A self-contained spaceflight demo: a bundled REST server that mirrors the
[Launch Library 2](https://lldev.thespacedevs.com/docs) API — but self-hosted,
deliberately **slow and flaky**, with a background **launch-replay simulator**
that mutates a live launch in real time — and a single-screen `vantage-ui`
inventory that drives it all through relations and a Binder.

Two halves:

- `server/` — a Rust crate: SQLite + vantage table models + an axum REST API
  (LL2 envelope, `?mode=detailed` nesting, LL2 filter params), seeded from
  committed LL2 fixtures. Aggregate stats (`total_launch_count`,
  `total_payload_mass`, landing counts…) are **computed, not stored**. Latency +
  random 503s are injected on purpose. A simulator replays launches through their
  status timeline, stamping `last_updated`.
- `inventory/` — the YAML app: a launches Binder board with relation drilldowns
  (provider / rocket / pad → location / payloads / crew / landings → landpad),
  live-refreshing off `last_updated` and never blanking on a flaky 503.

## Run

```bash
# 1. seed SQLite from the committed LL2 fixtures (once)
cargo run -p launch-control-server -- seed

# 2. start the flaky API + the live launch simulator
cargo run -p launch-control-server -- serve

# 3. point vantage-ui at the inventory (in the vantage-ui repo)
cargo run -p vantage-ui -- --config ../vantage-ui-examples/apps/launch-control/inventory
```

## Server commands

```bash
cargo run -p launch-control-server -- seed --refetch        # re-pull fixtures from lldev
cargo run -p launch-control-server -- query launches         # introspect a table
cargo run -p launch-control-server -- serve --error-rate 0.3 # crank up the flakiness
cargo run -p launch-control-server -- serve --sim-step 10    # faster replays
cargo run -p launch-control-server -- serve --no-sim         # static data
```
