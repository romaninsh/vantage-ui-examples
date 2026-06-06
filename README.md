# vantage-ui-examples

Example apps and a black-box BDD UI test suite for **Vantage UI** — the
API-driven low-code admin app.

This repo serves a dual purpose:

1. **Examples** — each folder under `apps/` is a self-contained Vantage app
   (a YAML "inventory" catalog) you can open in Vantage UI.
2. **Tests** — a BDD suite that launches the *published* Vantage UI binary
   against each app and drives it over the app's MCP interface, asserting on
   behavior. It runs on GitHub's free public-repo CI minutes.

The suite is strictly **black-box**: it never links Vantage UI source, it only
talks to the running binary over MCP. See [`.rules`](.rules) for the working
agreement and [`todo/`](todo/) for the roadmap.

## Layout

```
apps/<name>/            # example apps (inventory + tests + docs)
test-framework/         # the BDD engine + `vantage-ui-test` driver binary
  features/common/      # scenarios run against every app (e.g. clean startup)
  src/                  # World, MCP client, process launcher, steps, driver
.github/workflows/      # CI: download the published binary, run the suite
todo/                   # roadmap / out-of-scope-but-needed items
```

## Running locally

You need a Vantage UI binary. Either set `VANTAGE_UI_BIN` to one, or build a
sibling checkout:

```sh
# option A: build the sibling repo (../vantage-ui)
(cd ../vantage-ui && cargo build --release)

# option B: point at any binary
export VANTAGE_UI_BIN=/path/to/vantage-ui

# run one app, or all of them
cargo run -p test-framework -- apps/bakery
cargo run -p test-framework -- --all
```

The driver launches the binary against each app's `inventory/`, waits for the
catalog to finish loading (observed over MCP), and asserts there are no
ERROR-level logs.

## How it works

- Each scenario spawns `vantage-ui <app>/inventory` with `VANTAGE_MCP_ADDR`
  pointed at a loopback port.
- The harness connects to the app's MCP server and polls the `list_logs` tool
  until the catalog has settled, then inspects the logs.
- The child process is killed when the scenario ends.

CI runs on a macOS runner (the published binary is a macOS DMG); it downloads
the latest build from S3, extracts the binary, and runs `--all`.
