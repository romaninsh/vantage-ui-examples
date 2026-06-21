# On-demand launch simulation — P1: backbone + trigger

**Date:** 2026-06-21
**App:** `apps/launch-control` (the bundled `launch-control-server` crate)
**Status:** design approved, ready for implementation plan

## Context: the larger effort

The launch-control server currently boots a background task (`sim::run`) that
auto-replays *existing* launches through a status timeline. We are replacing
this with an **on-demand, deterministic, extensible mission-simulation engine**
triggered by an API call and a UI button.

A mission is a sequence of **phases**, each its own simulation:

1. **Pre-launch data population** (T-60s → T-0): the launch record is filled in
   *as if a person were typing* — inserting, **updating** (fixing mistakes), and
   **deleting** wrongly-added rows — so the frontend's live-refresh and local
   cache correctness can be observed without manual reload.
2. **Flight / ascent** (from lift-off): real-time telemetry and trajectory
   computed from payload mass + pad location + launcher specs, grounded in real
   flight events (max-Q, MECO, stage separation, SECO, orbit insertion, payload
   deploy), running 5–10 min wall-clock, ending in success or failure.
3. **Future** — docking, lunar transfer, etc.: added by implementing one more
   `Phase`.

This effort is decomposed into shippable increments, built in order:

- **P1 (this spec)** — the engine backbone + trigger endpoint + dormant thread +
  UI button, shipping one trivial phase to prove it end-to-end.
- **P2** — the pre-launch data-population phase (human-churn CRUD).
- **P3** — the flight/telemetry phase (telemetry table, trajectory, deploy).

Each increment gets its own spec → plan → implementation cycle. P1 must get the
backbone abstractions right because P2/P3/future phases depend on them.

## P1 goals

1. The server no longer runs any simulation on boot; missions exist only after a
   trigger.
2. `POST /sim/launches` creates a launch row instantly from a few user inputs,
   returns it, then runs a background mission in real time.
3. A pluggable, seed-deterministic **phase engine** that can play events in real
   time (the API path) or with no delays (the unit-test path), producing an
   identical final data state for a given seed.
4. A launches-page toolbar button that collects the inputs and fires the POST.

Non-goals for P1: the rich human-churn population (P2), flight/telemetry and the
telemetry table (P3), any sped-up/seed control over HTTP (test-only, never
exposed by the API).

## Endpoint contract

```
POST /sim/launches
  body (JSON):
    lsp_id                    (required)  launch service provider / agency id
    pad_id                    (required)  pad id (also fixes the location)
    rocket_configuration_id   (optional)  launcher config id
    name                      (optional)  mission / launch name

  validation (all failures → 400 with a JSON detail message):
    - lsp_id, pad_id, rocket_configuration_id must reference existing rows
    - if rocket_configuration_id is given, it MUST belong to lsp_id
      (the agency). (See "Cross-field validation".)

  on success:
    - insert a launch row NOW via the Table interface:
        status_id = "2"  (To Be Determined — unscheduled)
        net       = null
        lsp_id, pad_id, rocket_configuration_id, name set; everything else blank
    - 201 { "id": "<launch-id>", "status": "unscheduled" }   (returns at once)
    - spawn the background mission task (real-time pace)
```

The HTTP API is **real-time only** — it exposes no seed/speed/pace parameters.
The background task's first event (mission-time 0) sets `net = now + 60s`,
moves status into countdown, and bumps `last_updated`. Everything richer is P2/P3.

### Cross-field validation

`rocket_configuration_id` must belong to the chosen agency: selecting SpaceX as
`lsp_id` limits valid configurations to SpaceX's. The exact link
(`launcher_configurations` → manufacturer/agency) is to be confirmed in
`model/launcher_configuration.rs` during planning; the server enforces it and
returns `400` on mismatch regardless of the UI.

The UI **requires** a dependent dropdown: choosing an agency filters the
configuration choices to that agency's. This is a known **implementation gap in
vantage-ui** — its form system does not yet support filtering one field's
choices by another field's value. Closing that gap (a change in the `vantage-ui`
repo / the rendered form) is therefore part of this work, scheduled for the
increment that builds the form UI. The server-side `400` remains as a backstop,
but the dependent dropdown is a hard requirement, not best-effort.

## The engine

A new `sim/` module in the server crate, built on a **plan-then-play** model.

```rust
/// Everything a phase needs to plan, resolved once at trigger time.
struct MissionContext {
    launch_id: String,
    lsp_id: String,
    pad_id: String,
    rocket_configuration_id: Option<String>,
    name: Option<String>,
    // P3 extends with: payload mass, pad lat/lon, launcher specs, target orbit.
}

/// One scheduled mutation. `at` is the intended real-time offset from trigger.
struct TimedEvent {
    at: Duration,
    label: String,   // "T-1min", "MECO", "deploy" — for logs / future telemetry
    action: Action,  // Box<dyn FnOnce(SqliteDB) -> BoxFuture<'static, Result<()>> + Send>
}

/// A pluggable simulation step. Adding docking/lunar later = one more impl.
trait Phase {
    fn name(&self) -> &str;
    /// PURE: builds the event list from context + seeded RNG.
    /// Never touches the DB and never sleeps.
    fn plan(&self, ctx: &MissionContext, rng: &mut SeededRng) -> Vec<TimedEvent>;
}

enum Pace { RealTime, NoDelay }   // RealTime = API/demo; NoDelay = unit tests

async fn run_mission(
    db: SqliteDB,
    ctx: MissionContext,
    seed: u64,
    phases: Vec<Box<dyn Phase>>,
    pace: Pace,
) -> anyhow::Result<()>;
```

**Determinism.** `plan` is pure and seeded, so a given `(ctx, seed)` always
produces the same event data and therefore the same final DB state, independent
of pace. The unit-test path runs `NoDelay` and asserts on the resulting rows;
the same seed run twice yields identical rows.

**The runner** concatenates every phase's events, sorts by `at`, and applies each
`action` in order — sleeping the gap to the next event in `RealTime`, applying
back-to-back in `NoDelay`. Each phase owns its own realism↔watchability mapping
by choosing its `at` offsets (P3 compresses ~1 h of nominal flight into a 5–10
min spread of offsets). There is deliberately **no global speed knob**, matching
"the API is real mode only." Real-time update resolution is ~1 s: phases emit
events no finer than ~1 s apart (a ~7-min flight ≈ a few hundred events), and the
runner writes each change immediately so the API sees fresh values as soon as
possible.

**Concurrency.** At most one mission runs against a given launch, so the engine
needs no per-row locking or race handling; events apply sequentially and write
through as they go.

**`Action` representation.** A boxed async closure over the typed `Table`
interface (the same `table.replace(...)` path `sim.rs` already uses), built at
plan time capturing seed-derived data and executed by the runner. Consequence:
events are not introspectable, so tests assert on **DB state**, not on the event
list. (A serializable data-enum of mutations was considered and rejected — it is
more verbose and would discard the typed models.)

All record creation and mutation goes through the vantage `Table` interface
(`ReadableDataSet` / `WritableDataSet`), not raw SQL. This currently drops
managed timestamps; that is accepted for now (the engine still sets
`last_updated` explicitly where it matters as a refresh trigger).

## P1's concrete phase

A single `CountdownPhase` proving the engine end-to-end with ~2–3 events:

- `at = 0s`: set `net = now + 60s`, status → "To Be Confirmed", bump `last_updated`.
- `at = 30s`: bump `last_updated` (demonstrates a timed mid-countdown update).
- `at = 60s`: status → "Go for Launch", bump `last_updated`.

Enough to watch a triggered launch tick down and refresh live in the UI. P2 swaps
in the real population behaviour; P3 appends the flight phase after it.

## Dormant thread + CLI changes

- `main.rs` stops auto-spawning `sim::run`. Remove the `--no-sim` and `--sim-step`
  flags (now meaningless). `serve` only serves; the trigger endpoint is always
  available.
- The old `sim.rs` auto-replay loop (`candidate_ids` / `replay` over existing
  launches) is removed. Reusable bits — the `Table`-based row touch and
  `ensure_statuses` — move into the engine.
- **BDD impact**: `test-framework/src/launch_control.rs` launches
  `serve --no-sim --error-rate 0`; drop `--no-sim`. The existing
  `apps/launch-control/tests/data_tools.feature` never triggers a mission, so the
  seeded counts stay exact and it stays green.

## UI action (launches-page toolbar)

Two inventory action files plus a toolbar wiring on the launches page:

- `inventory/action/new-launch.yaml` — `kind: form`. Dropdown fields:
  `lsp_id` (choices from agencies), `pad_id` (from pads),
  `rocket_configuration_id` (from launcher_configurations, **dependent on
  `lsp_id`** — requires the vantage-ui form gap to be closed), and a free-text
  `name`.
- `inventory/action/submit-launch.yaml` — `kind: http_request`,
  `POST ${LAUNCH_CONTROL_URL}/sim/launches` with the collected params as the body.
- Launches page toolbar button → Rhai:
  `let r = actions.new_launch(); actions.submit_launch(r.lsp_id, r.pad_id, r.rocket_configuration_id, r.name);`

Exact toolbar/form YAML is confirmed against `toolbar-and-row-actions.md` and
`form-fields.md` during planning. `${LAUNCH_CONTROL_URL}` defaults to the
datasource host (`http://127.0.0.1:8080`).

## Testing

- **Server unit test**: build a `MissionContext`, run
  `run_mission(..., seed = 42, Pace::NoDelay)`, and assert the launch ends with
  `net ≈ +60s` and status "Go for Launch"; assert a second identical-seed run
  produces the identical row. Determinism and the no-delay path are exercised
  here, never through HTTP.
- **Endpoint test**: `POST /sim/launches` with valid ids returns `201` and an
  unscheduled launch; a `rocket_configuration_id` not belonging to `lsp_id`
  returns `400`.
- **BDD**: `apps/launch-control/tests/data_tools.feature` stays green unchanged
  (no mission triggered), after the `--no-sim` flag removal in the harness.

## Out of scope (later increments)

- Pre-launch human-churn population — P2.
- Flight/telemetry: telemetry table + model + inventory page, trajectory physics,
  ascent events, payload deploy — P3.
- Docking / lunar / further phases — future, enabled by the `Phase` trait.
