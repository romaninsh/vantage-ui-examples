# Vantage 1.2.0

Gaps and rough edges hit while building Jiro (a MongoDB-backed issue tracker). Project names
and YAML below use invented data only.

## MongoDB table relations never reach the query/traversal engine
- **Wanted:** declared `references:` on Mongo tables so binder relation tabs, "Open <relation>"
  and `scenery(...).ref(...)` / `table(...).ref(...)` drill-downs work — exactly as the
  `vantage-persistence-mongo` skill's support-desk example promises
  (`table("ticket").where("_id", t._id).ref("customer").first()` returning a row).
- **Tried:** the skill's own shape, both column-level has_one and top-level has_many, e.g.
  ```yaml
  # table/zzticket.yaml
  columns:
    - { name: agent_id, references: { table: zzagent, kind: has_one, name: agent } }
  # table/zzagent.yaml
  references:
    tickets: { table: zzticket, kind: has_many, foreign_key: agent_id }
  ```
- **Happened:** `references()` returns `[]` for **every** Mongo table, and any `.ref()` throws
  ``Step can't be applied (step: Ref("agent")): No references defined on table (table: "zzticket")``
  — in `run_data_script` **and** in `preview_query` (which reads fresh from the backend
  definition), and reproduced with the skill's exact example. The form-kit sees *some* of the
  same references (it mounts dropdowns for a subset), so the YAML parses — the relations just
  don't compile into the data layer. This looks like a regression against the skill docs.
- **Workaround:** denormalise related display values onto each document
  (`assignee_name`, `project_key`, `parent_key`, …, kept as `[calculated]` columns) and build
  every parent→children panel/drill-down with column equality instead of a relation:
  `scenery("issue").where("parent", args.id)`, `.where("assignee", id)`, etc. This works
  perfectly. Relation **tabs** on the binder are therefore unavailable; a dedicated record page
  (`issue_view`) rebuilds the detail view (children, comments, worklogs, watchers, links) from
  `.where` panels instead.

## Auto-generated binder Details form mounts only a subset of fields
- **Wanted:** the built-in Details edit form on the `issue` binder to show every writable column.
- **Tried:** a plain `binder` with no `form:` over the issue table (23 columns).
- **Happened:** only 7 fields mounted; the rest were dropped, with repeated WARNs:
  ``no mounted field for this reference loader — the dropdown will stay empty and the field
  will show a raw id field=fix_version known=["assignee","labels","type","priority","sprint",
  "status","project"]`` (same for `reporter`, `parent`). Likely a knock-on of the relations bug
  above — reference columns that didn't compile left their form fields unmounted.
- **Workaround:** an explicit `form/issue-form.yaml` layout. All fields then mount; reference
  pickers can still come up empty (fall back to a raw id text field), so status/type/priority/
  text/date editing is the reliable path — and status is best changed by dragging on the board.

## composer.yaml added after the project is open is not detected by the services tools
- **Wanted:** write `composer.yaml`, then `services_control start` to bring up Mongo, per the
  app-builder build order.
- **Happened:** `services_status` kept returning `stack: null` and `services_logs` returned
  MCP error ``this project declares no services (no composer.yaml)`` even though the file existed
  on disk — the services subsystem seems to scan `composer.yaml` only at project-open. The
  datasource `mongodb://mongo:27017/...` then connected to an *unrelated* standalone Mongo on
  the host's 27017 instead of a managed service.
- **Workaround:** bring the stack up by hand with Vantage's own naming
  (`docker compose -p vantage-server-jiro -f composer.yaml up -d`) and point the datasource at
  the fixed published port directly (`mongodb://localhost:27027/...?directConnection=true`),
  which is robust whether or not Vantage manages the stack. (On a fresh project-open the normal
  `services_control` flow should work.)

## Minor
- A list's `empty:` param is accepted on view lists (per the `vantage-quality` note) but fails
  page-level list schema validation (`is not valid under any of the schemas listed in the
  'oneOf' keyword`). A page-level list has no empty-state text.
- A `width:` on a `kind: label` fails schema validation; wrap the label in a `column` with
  `width:` instead. (Easy to trip over; the error only says "oneOf".)
- Filtered live grids over the `issue` collection mount at `rows=0` and fill a beat later; a
  double `.where(...).where(...)` on the live collection showed 0 on the first mount before
  filling. Read-only MongoDB **views** (poll path) don't show this and are reliable — I used a
  `issue_done` view for release notes for that reason.
- The dashboard (8 view-backed tiles, each a Mongo aggregation pipeline opened on the caller
  thread) produced multi-second main-thread stalls on first mount
  (`main thread stall detected (beachball) … duration_ms=4909`). It settles after the first
  load; staggering or off-thread view opens would help.
