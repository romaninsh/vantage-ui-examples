# Scenario backlog

Scenarios we want, grouped by what they need. Tag not-yet-runnable ones `@wip`
in feature files so the driver skips them.

## Doable today (only the `list_logs` MCP tool exists)
- [x] Clean startup: launch an app, wait for the catalog to settle, assert zero
      ERROR logs. (`test-framework/features/common/startup.feature`)
- [ ] Broken-inventory app: an app whose inventory deliberately contains a bad
      YAML / dangling reference, asserting a *specific* ERROR/WARN appears.
      (Add as its own app, e.g. `apps/broken-*`, so it doesn't fail the common
      startup check — or run it through a dedicated feature.)
- [ ] Multi-app sweep: `--all` stays green across every example app.
- [ ] Warning budget: assert an app produces no WARN either (stricter apps).

## Blocked on new vantage-ui MCP tools
The app currently exposes only `list_logs`. Interaction needs new tools added
on the vantage-ui side; until then these stay `@wip`.
- [ ] Navigate to a page → needs a `navigate` tool.
- [ ] Click / select a row in the current table → needs `click` / `select_row`.
- [ ] Open a record by id → needs `open_record`.
- [ ] Assert visible table row count / cell values → needs `query_view` /
      `table_state`.
- [ ] Screenshot capture for visual diffing → needs a `screenshot` tool (or a
      side channel; out of scope for a pure-MCP black box).

## Note on TestAppContext
gpui's `TestAppContext` is vantage-ui's **in-process** test harness — it runs
inside the same binary/test and cannot control a separately-running published
binary. In-process gpui tests belong in the vantage-ui repo. This repo is
strictly black-box over MCP, so TestAppContext is never used here.
