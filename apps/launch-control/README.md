# Launch Control

A self-contained spaceflight demo: a bundled REST server that mirrors the
[Launch Library 2](https://lldev.thespacedevs.com/docs) API — but self-hosted,
deliberately **slow and flaky**, with an **on-demand mission simulator** that
creates and ticks a launch through a real-time countdown — and a single-screen
`vantage-ui` inventory that drives it all through relations and a Binder.

Two halves:

- `server/` — a Rust crate: SQLite + vantage table models + an axum REST API
  (LL2 envelope, `?mode=detailed` nesting, LL2 filter params), seeded from
  committed LL2 fixtures. Aggregate stats (`total_launch_count`,
  `total_payload_mass`, landing counts…) are **computed, not stored**. Latency +
  random 503s are injected on purpose. The server is dormant by default; a
  mission simulation is triggered on demand (see below), stamping `last_updated`.
- the app root (`datasource/`, `table/`, `page/`, `view/`, `action/`, `menu/`) — the YAML app: a launches Binder board with relation drilldowns
  (provider / rocket / pad → location / payloads / crew / landings → landpad),
  live-refreshing off `last_updated` and never blanking on a flaky 503.

## Run

Open the app in Vantage and press Start on the Services indicator in the title
bar. `composer.yaml` builds the server image inside Docker (no Rust toolchain
needed; the first build takes a few minutes) and runs it on a loopback port that
docker picks. The datasource addresses the service as `http://api:8080` and
Vantage rewrites that to the published port. The database lives on a named
volume and seeds itself from the bundled fixtures on first start.

```bash
# in the vantage-ui repo
cargo run -p vantage-ui -- ../vantage-ui-examples/apps/launch-control
```

Without Docker, run the server yourself and point the datasource at it:

```bash
cargo run -p launch-control-server -- serve      # seeds SQLite on first start
# then set datasource/local.yaml `url` to http://127.0.0.1:8080 (and the
# action/submit-launch.yaml url to match)
```

## Server commands

```bash
cargo run -p launch-control-server -- seed --refetch        # re-pull fixtures from lldev
cargo run -p launch-control-server -- query launches         # introspect a table
cargo run -p launch-control-server -- serve --error-rate 0.3 # crank up the flakiness

# Trigger a simulated mission on demand (ids come from `query agencies` / `query pads`)
curl -X POST localhost:8080/sim/launches \
  -H 'content-type: application/json' \
  -d '{"lsp_id":"121","pad_id":"80","rocket_configuration_id":"164","name":"Demo"}'
# Or use the "New simulated launch" toolbar button on the launches page in the UI.
```
