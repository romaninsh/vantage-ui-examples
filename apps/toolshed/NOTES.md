# Toolshed: build notes

Vantage 1.5.1 (dev build), client `@vantage-ui/client` 0.4.2, built 2026-10-13.

## What was built

- **Data:** a SQLite database `data/toolshed.db` with one table, `tool`: name, category, status
  (`available`, `on_loan`, `repair`), borrower, `due_on`, plus an `overdue` flag. There are 25
  seeded tools: 9 on loan (3 of them past due as of 2026-10-13: Tile cutter, Jigsaw, Hedge
  trimmer (petrol)), 2 in repair and 14 available. `tests/schema.sql` and `tests/seed.sql` hold
  the committed record of the database.
- **Vantage:** `datasource/toolshed.yaml`, `table/tool.yaml`, a single `Tools` binder page
  (`page/tools.yaml`) with a sidebar entry (`menu/left.yaml`).
- **Action:** `action/check-overdue.yaml`, a `kind: script` run. It walks the loans in
  due-date order and sets `overdue` on each loan whose due date has passed. It also clears a
  stale flag on loans that are no longer late or are back on the shelf. As it goes it updates
  the shared `state` (`total`, `progress`, `overdue`, `status`) and emits an `overdue_tool`
  message for each late loan. It returns `{ overdue, checked, message }`.
- **API:** `api/desk.yaml`, the `desk` API. It has one entity, `tools`, with a column whitelist
  and `status` as the only filter, sorted by `name`. It exposes the `check-overdue` action and
  uses `auth: local: none`.
- **Web frontend:** `web/desk/`, a Vite and React app that the dev container builds. It has one
  page with:
  - a table of tools, sorted by name on the server (`.sort("name", "asc")`);
  - a status dropdown that filters on the server (`.where({ status })`), with the choices taken
    from the generated schema's enum;
  - a **Check overdue loans** button that starts the run (`useRun(db.run.check_overdue, { key: "desk" })`).
    A `<progress>` bar is bound to the shared `progress`/`total`, with a live status line. When
    the run finishes, the page shows "3 tools are overdue" and lists the flagged loans from the
    `overdue_tool` messages.
- **Tests:** `web/desk/test/Desk.test.tsx` has 3 vitest tests against `MockServer`: the server
  sort, the server filter, and the run's progress and final message. `web/desk/e2e/desk.e2e.ts`
  has 3 Playwright tests against the live API: 25 rows in name order, the repair and on-loan
  filters, and a real overdue check that ends with "3 tools are overdue" and 3 rows flagged.

**URL:** <http://127.0.0.1:53997/>. This is the `desk` API's own URL; a fresh start of the API
picks a new port, and Services → desk → Open in browser always has the current one.

Verification results: `web_dev_status` is `ready` with no errors. `web_run npm run build`
passed (it runs `tsc` for the page and the e2e tests, then `vite build`). `web_run npm test`
passed 3/3 and `web_run npx playwright test` passed 3/3. `api_status` shows `running`, no
errors and no warnings. `/v1/ready` returns `{"ready":true}`. A deep link (`/tools/3`) serves
`index.html`, and the scripts use absolute `/assets/…` paths. The `api:desk` feed has no
warnings, and `run_data_script` confirms the 3 tools flagged after the run.

## Decisions

- **Overdue is a stored flag,** as the brief suggested, not a computed column. The action
  sets it and also clears it, so running the check again is safe and fixes stale flags.
  "Today" is the UTC date cut from `now()`, which is the method `vantage-rhai` documents.
- **Database rule:** a `CHECK` makes `on_loan` require a borrower and a due date. There is no
  `tests/*.sh` invariant script; the only rule is the constraint itself.
- **One desktop page.** The brief allowed only the desktop pages "the skills say an API needs".
  The skills say the data tools (`run_data_script`, `list_models`) answer only after a page has
  been built, and `vantage-api` says to start an API from a page grid. So there is one `tools`
  binder page with a menu entry, and nothing else.
- **API filter is `status` only.** Search is refused on an entity that sets `columns`, and the
  brief asked only for a status filter.
- **`load: lazy` (the default), `collection_limit: 500`.** With 25 rows the page reads one
  collection (`useCollection`) rather than windows.
- **The Playwright image from the start** (`web_dev_start playwright: true`). This avoided
  stopping and restarting the container to run e2e later; the watch build works the same way
  in that image.
- **The e2e test changes real data**: it presses the real button, which sets `overdue` on 3
  rows. Running it again is harmless (same result). It does depend on the date: after
  2026-10-14 the Pressure washer is also late, and the expected "3" changes.
- **`sleep(150)` per loan** in the action, so the progress bar is visible to a person; 9 loans
  take about 1.4 s.
- No styling beyond the bare scaffold, as the brief asked.

## What the skills didn't cover or got wrong

1. **Run messages after a reload.** `useRun` with a `key` re-attaches after a page reload, and
   `client/SKILL.md` says earlier messages then become "history in `messages`". The shape of
   `run.messages` isn't documented, so the page only lists messages it received while mounted
   (`useRunMessage`). After a reload, the progress and the count return but the list of
   flagged tools is empty.
2. **`run.result` typing is undocumented.** The generated `CheckOverdueRun` types `args`,
   `state`, `inputs` and `messages`, but not the result. The page builds its final message from
   the `overdue` state instead of the body's returned `message`.
3. **`start()` without arguments.** `references/react.md` shows `check.start()` for an action
   with no args. The generated `args` type is `{}`, so the page calls `start({})` to be safe.
   Whether the bare `start()` type-checks is untested.
4. **Mandatory columns are nullable in the bindings.** `name` and `category` are `mandatory`,
   yet `ToolsFields` types them as `string | null` (only `ToolsInput` makes them required).
   This may be intended (rows can predate the flag), but the skills don't say so.
5. **Whether an API needs a desktop page** isn't stated anywhere. It had to be inferred from
   the data tools' requirement and from "copy a page grid".
6. **Desktop page vs. API writes.** `api-yaml.md` says desktop edits over the whole table reach
   API clients. It doesn't say whether the action's writes, run through the API, show up on an
   open desktop `binder` without a Refresh. That wasn't checked through `ui_tree`, because it
   doesn't expose cell values.
7. **Stale assets in `dist/`.** The watch build leaves the previous bundle in place
   (`dist/assets/index-BxMQZGAZ.js` from the first build sits next to the current
   `index-trvEHUw6.js`). This is harmless because `index.html` names only the new one, but
   `dist/` grows with every build. `dev-container.md` doesn't mention it.
8. Everything else worked as documented, first time:
   - the scaffold;
   - the `vendor/` tarball seeding;
   - codegen from `schema.json`;
   - `web_open` before the first build, which showed the placeholder and then the app;
   - the reload after each build;
   - `web_run npm run build` writing to a scratch folder;
   - the MockServer run helpers (`update`, `emit`, `ActionHandler`, `MockRunControl`);
   - `server.opened`.

## Vantage bugs

- **Version report is inconsistent.** `check_version` returns `"current_version":"1.5.1"`,
  but its `current_version_changes` includes a `## 1.5.2 — 2026-10-13` section. That section
  describes the features used here (the dev container, `vendor/` seeding, `kind: script`
  runs in the app). Either the version string or the changelog is wrong.
- No errors or warnings came from the build or the API. The only WARN in the `app` feed was
  `slow redb cache open … ms=53 preexisting_bytes=0`, on the first open of a new project's
  cache, which looks benign.
