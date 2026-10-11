# Jiro — build notes

Jiro is a Jira-style issue tracker for **Kestrel Labs**, a 9-person software house, built on
Vantage 1.2.0 over MongoDB. This file records what was built, the decisions behind it, and the
places where the skills bundle or the kanban component did not behave as documented.

## What was built

### Backend (MongoDB, run by the project)
- `composer.yaml` runs `mongo:7` as a **single-node replica set `rs0`** (so boards get live
  change-stream updates), published on host port **27027** (27017 was taken on this machine).
- `datasource/jiro.yaml` → `mongodb://localhost:27027/jiro?directConnection=true&serverSelectionTimeoutMS=2000`.
- `tests/seed.js` — reproducible seed (drops + recreates): 9 people, 4 projects, 7 sprints,
  7 versions, **132 issues** (epics/stories/tasks/bugs/sub-tasks across every status and
  sprint), 140 comments, 50 worklogs, 262 watchers, 13 issue links.
- `tests/views.js` — 8 read-only MongoDB views for reporting (see Dashboard).
- `tests/jiro_test.sh` — invariant checks against the live DB (counts, referential integrity,
  self-relation integrity, denormalised-field consistency, enum domains, archived-project rule,
  a scratch insert→move→delete lifecycle). **Passes.**

### Tables (`table/`)
Physical collections: `member`, `project`, `sprint`, `version`, `issue`, `comment`, `worklog`,
`watcher`, `issue_link`. Read-only views: `issue_kpis`, `status_counts`, `type_counts`,
`priority_counts`, `workload`, `sprint_progress`, `epic_progress`, `issue_done`.

`issue` carries the full field set from the brief: type, parent, key, title, description,
status, priority, assignee, reporter, estimate (story points), due date, labels, component,
fix version, sprint, plus a `rank` for board ordering and `created_at`/`updated_at`.

Workflow statuses: `backlog → todo → in_progress → in_review → done`, with `wont_do` as the
side exit. The enum is declared in that order, so kanban lanes come out in workflow order.

### Pages (`page/`) and menu (`menu/left.yaml`)
- **Overview** (`dashboard`) — the home page: 6 KPI stats (open / in progress / in review /
  done / open bugs / open story points), an "open issues by status" bar chart, a "by type"
  pie, active-sprint progress (list with % bars), open workload per person (bar), and a
  clickable "recently updated" feed.
- **Boards** — three `kind: kanban` boards, all over the writable `issue` collection, lanes by
  status, drag to change status, `rank:` for reorder-within-lane, double-click a card →
  `issue_view`:
  - `board` — project board (project picker).
  - `sprint_board` — sprint picker.
  - `my_work` — person picker ("my work"; see decision below).
- **Work** — `issues` (all issues, full binder with edit form + filter funnel), `backlog`
  (binder, "Backlog only" chip), `my_issues` (person-picker grid), `epics` (epic child
  progress with % bars).
- **Planning** — `projects`, `sprints`, `versions`, `members` (People) admin binders.
- **Activity** — `comments`, `worklogs`, `watchers`, `links` admin binders.
- Drill/record pages: `issue_view` (full issue detail — details, description, linked issues,
  watchers, sub-issues, comments, worklogs), `project_issues`, `member_issues`, `sprint_view`
  (per-sprint), `release_notes` (a version's Done issues).
- `form/issue-form.yaml` — explicit edit/add layout for issues.
- `application.yaml` — Hybrid Light/Dark theme, `home: dashboard`.

Add / edit / delete (with confirm) / quicksearch are the binders' built-ins — no custom CRUD
actions were written.

## Key decisions

- **Denormalised display columns + `.where` drill-downs instead of relations.** MongoDB table
  relations do not compile into the query engine on this build (see FEEDBACK.md #1), *and*
  MongoDB forbids dotted/related columns anyway. So every document stores its related names
  (`assignee_name`, `project_key`, `parent_key`, `sprint_name`, `version_name`, …) as
  read-only `[calculated]` columns, and every parent→children view is built with column
  equality: `scenery("issue").where("parent", id)`. The FK id columns (`assignee`, `project`,
  …) are kept for the edit-form dropdowns. Trade-off: editing a FK in the app does not update
  its denormalised `_name` until the next seed; the invariant test asserts they match after a
  reseed.
- **MongoDB views for all reporting.** Dashboards, release notes and epic progress read from
  `db.createView` pipelines modelled as read-only tables. This keeps aggregate numbers exact
  (Mongo `aggregates:` only reduce loaded rows) and sidesteps the live-filter timing quirk.
  View tiles carry `refresh_interval:` because views can't be watched.
- **Single-node replica set** rather than a standalone `mongo:7`, so boards update live
  (`table follows the master's change feed … freshness=live`).
- **"Current person" has no equivalent in community Vantage.** My Work / My Issues use a member
  picker that defaults to Everyone; the brief's "current person" is whoever is picked.
- **PAY (Harbor Payments) is the archived project** — a finished client engagement, all issues
  Done/Won't Do — so the archived state and release notes both have something to show.

## Verification
Every page was opened with `ui_navigate` and checked with `list_logs`; no page mounts with an
error. Board behaviour was checked via `ui_interact` (card `opened_id` runs `on_open` and opens
`issue_view`) and a status write round-trip proved the issue collection is writable (what a
drag does). `tests/jiro_test.sh` passes. Card drag-and-drop and exact colours/WIP are pixels —
they need a human glance.

## Where the skills / component surprised me (full detail + exact errors in FEEDBACK.md)
1. **Mongo relations don't reach the data layer** — `references()` is empty and `.ref()` throws
   `No references defined on table`, even for the skill's own support-desk example. This is the
   biggest divergence from the `vantage-persistence-mongo` skill. Worked around with
   denormalisation + `.where`.
2. **Auto Details form mounted only 7 of 23 issue fields** (knock-on of #1); fixed with an
   explicit `form/` layout.
3. **composer.yaml added after project-open wasn't seen** by the services MCP tools
   (`this project declares no services (no composer.yaml)`); had to start the stack by hand and
   point the datasource at the fixed published port.
4. Minor: `empty:` rejected on page-level lists; `width:` rejected on `label`; filtered live
   grids mount empty then fill; the all-views dashboard stalls the main thread on first paint.

## Kanban component
Worked well: lanes followed the `status` enum order, explicit `lanes:` with per-lane colours,
`rank:` reordering, `assignee`/`labels`/`due`/`description` card fields, `search:`, and
`on_open:` opening a record page. It accepts an `observe: { script: … }` so a picker can filter
the board by project / sprint / person, and the board stays writable through the filter. The
only caveat is the general filtered-live-grid warm-up (empty for a moment on first mount).
