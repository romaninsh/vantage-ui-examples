# Agent Smith — Requirements: `launch-summary-view`

> You are Agent Smith. You edit **only** the YAML inventory under
> `apps/launch-control/inventory/`. You do not touch Rust. This file is your task and is
> self-contained — the `view` section is brand new, so the full node vocabulary is below.

## What you're building

A rich, read-only **"Summary" tab** on the Launches binder. Selecting a launch shows a
custom dashboard — a header with a status badge, a launch-probability bar, a **countdown
before launch** that flips to a **telemetry panel after launch** (altitude / velocity /
acceleration / downrange / MET), and live **crew** and **payload** lists. Everything
live-refreshes while the mission simulator runs.

You create one new view file and add one line to the launches page.

## Prerequisites (verify before editing)

- [ ] Vantage is running against `apps/launch-control/inventory/` (a window is open) on a
      build that has the new **`view` inventory section** (Neo just landed it — the app
      must have been relaunched after that). Confirm by checking that
      `inventory/view/` exists with a `view-schema-1.json` and `README.md` (the app
      scaffolds these on open). If `inventory/view/` is missing, the running app predates
      the feature — stop and tell Neo/Romans to relaunch.
- [ ] The launch-control **server** is running on `http://127.0.0.1:8080` from the new
      build that emits telemetry (it adds `phase`, `met_seconds`, `altitude_km`,
      `velocity_ms`, `acceleration_ms2`, `downrange_km` to launches).
- [ ] The `list_logs` MCP tool is in your tool list. If not, the MCP isn't connected — stop.

## The feedback loop — use it after every save

After **every** YAML edit call `list_logs(level="warn", limit=20)` and read it before
moving on. A clean save shows an INFO `loaded view` / `(re)building entity page` line and
no WARN. A WARN/ERROR names the exact problem (`view binds unknown table …`,
`references unknown view …`, a parse error with the offending key) — fix and re-check.
Never report done without a clean `list_logs`.

You can also confirm the live data with `run_data_script` (load `launches`, traverse a row)
to see which telemetry fields are populated mid-sim.

---

## The `view` section — node vocabulary

A `view/<key>.yaml` is `{ title, table, body: [node, …] }`. `table` is the model the view
binds to (here `launches`); the selected record is `record`. Every node has `kind:` and
may carry `when:` (a Rhai bool over `record`) to render conditionally. Value fields are
Rhai/`${…}` strings — `${record.<col>}` against the bound record, `${row.<col>}` inside a
`list` item. A node that fails (bad expression, unknown `ref`) renders a small inline error
chip and its siblings keep working, so iterate freely.

Node kinds:

- `row` / `column` — flex containers. `children: [...]`, optional `gap: <px>`.
- `label` — `text`, optional `secondary`, optional `style: heading|muted|mono|normal`.
- `stat` — `label`, `value`, optional `unit`. A caption over a big value (telemetry).
- `badge` — `text`, optional `color:` map (`{ green: ["Go for Launch"], … }`, same shape
  as a page column's color map; the first key whose list contains the text wins).
- `progress` — `value` (number expr), optional `max` (default `"100"`), optional `label`,
  optional `color:` (a theme color name: `green`/`red`/`yellow`/`blue`/`success`/…).
- `separator` — optional `label`.
- `countdown` — `target` (expr → RFC3339 datetime, e.g. `${record.net}`), optional `label`.
  Renders `T-HH:MM:SS` before the target, `T+…` after, ticking ~1/s.
- `list` — `ref:` (a relation name on the bound table), optional `empty:` text, and
  `item: [...]` rendered once per related row (`${row.<col>}` in scope).
- `when` — `condition:` (Rhai bool) + `children:`. Readable grouping; same as putting
  `when:` on a `column`.

### Fields you can read

On `record` (the launch, `?mode=detailed`): `name`, `status.name`, `probability` (0–100),
`net`, `webcast_live`, `rocket_configuration.full_name`, `mission.name`, `mission.orbit.name`,
`pad.name`, `payload_count`, `crew_count`, `total_payload_mass`, and the telemetry:
`phase` (`"countdown"` → `"ascent"` → `"orbit"`), `met_seconds`, `altitude_km`,
`velocity_ms`, `acceleration_ms2`, `downrange_km`.

Relation names for `list ref:` (declared on the launches table): **`crew`**, **`payloads`**,
**`landings`**.

- `crew` rows (launch_crew): `${row.astronaut.name}`, `${row.astronaut.nationality}`,
  `${row.role}`.
- `payloads` rows (payload_flights): `${row.payload.name}`, `${row.payload.type.name}`,
  `${row.payload.mass}`, `${row.destination}`.

The simulator drives a launch `countdown → ascent → orbit` over ~90s, so gate the
countdown on `record.phase == "countdown"` and the telemetry on
`record.phase != "countdown"`.

---

## Tasks

Work one at a time; verify each with `list_logs` before the next.

1. [ ] Create `inventory/view/launch_summary.yaml`. Start from the draft below, then refine
   spacing/labels against the running app. Keep it read-only.

   ```yaml
   # yaml-language-server: $schema=./view-schema-1.json
   title: Summary
   table: launches
   body:
     - kind: row
       gap: 8
       children:
         - kind: label
           text: "${record.name}"
           style: heading
         - kind: badge
           text: "${record.status.name}"
           color:
             green: ["Go for Launch", "Launch Successful"]
             yellow: ["To Be Confirmed", "To Be Determined"]
             red: ["Launch Failure"]

     - kind: progress
       label: "Launch probability"
       value: "${record.probability}"
       color: green

     # Before launch: a countdown to the scheduled liftoff (T-0).
     - kind: when
       condition: 'record.phase == "countdown"'
       children:
         - kind: separator
           label: "Countdown"
         - kind: countdown
           target: "${record.net}"
           label: "Liftoff in"

     # After launch: live ascent telemetry.
     - kind: when
       condition: 'record.phase != "countdown"'
       children:
         - kind: separator
           label: "Telemetry"
         - kind: row
           gap: 24
           children:
             - kind: stat
               label: "Altitude"
               value: "${record.altitude_km}"
               unit: km
             - kind: stat
               label: "Velocity"
               value: "${record.velocity_ms}"
               unit: m/s
             - kind: stat
               label: "Acceleration"
               value: "${record.acceleration_ms2}"
               unit: m/s²
             - kind: stat
               label: "Downrange"
               value: "${record.downrange_km}"
               unit: km
             - kind: stat
               label: "MET"
               value: "${record.met_seconds}"
               unit: s
         - kind: progress
           label: "Altitude to orbit (200 km)"
           value: "${record.altitude_km}"
           max: "200"
         - kind: progress
           label: "Velocity to orbital (7.8 km/s)"
           value: "${record.velocity_ms}"
           max: "7800"

     - kind: separator
       label: "Crew"
     - kind: list
       ref: crew
       empty: "No crew assigned yet"
       item:
         - kind: label
           text: "${row.astronaut.name}"
         - kind: badge
           text: "${row.role}"

     - kind: separator
       label: "Payloads"
     - kind: list
       ref: payloads
       empty: "No payloads yet"
       item:
         - kind: label
           text: "${row.payload.name}"
         - kind: stat
           label: "${row.destination}"
           value: "${row.payload.mass}"
           unit: kg
   ```

2. [ ] Wire the view into the binder. In `inventory/page/launches.yaml`, add a `views:`
   list to the existing `crud` element (it stays a binder; the Summary tab appears after
   the auto-derived Details/Crew/Payloads/Landings tabs):

   ```yaml
   elements:
     - kind: crud
       spot: body
       table: launches
       views:
         - launch_summary
       # … existing toolbar / params unchanged …
   ```

3. [ ] Verify `list_logs(level="warn")` is clean after both saves.

## Acceptance criteria

- [ ] Selecting a launch shows a **Summary** tab alongside Details/Crew/Payloads/Landings.
- [ ] Clicking **"New simulated launch"** and watching the Summary tab: the **countdown
      ticks down** pre-launch; crew/payload lists fill in live; at T-0 the panel swaps to
      **telemetry** and the altitude/velocity bars climb through ascent → orbit — all
      without a manual refresh.
- [ ] A deliberately broken node (e.g. `ref: nope` or `${record.bogus.x}`) renders an
      inline **error chip** while the rest of the view keeps rendering — then revert it.
- [ ] `list_logs(level="warn")` is clean after the final save.

## Notes for Neo

> Smith: record anything you couldn't express in YAML, any node kind that was missing, or
> any value/condition that didn't behave. A gap here is a Rust fix for Neo, not a YAML
> workaround.

-
