---
name: vantage-ui-builder
description: Build admin UIs declaratively with Vantage. Use when the user wants to set up, modify, or extend a Vantage project — adding datasources, tables, pages, or menu entries by editing YAML files. Vantage hot-reloads on save and exposes a `list_logs` MCP tool so you can see exactly what the parser/validator/backend logged after each edit. Read this skill first whenever you see `datasource/`, `table/`, `page/`, or `menu/` folders alongside a running Vantage window.
metadata:
  version: "1.7.0"
---

# Vantage UI Builder

Vantage renders a desktop UI from a folder of YAML files. Your job in a Vantage project is to translate the user's intent into the right YAML edits — Vantage's file watcher picks up every change and reloads in place, with scroll/filter/selection state preserved.

## The feedback loop you should always use

Vantage runs a small local **MCP server** that exposes a single read-only tool, `list_logs`, returning the most recent tracing events from the running app. After every YAML edit, call it and look for WARN/ERROR before claiming the change worked.

Typical use:

```
list_logs(level="warn", limit=20)
```

What you'll see after a clean save: an INFO line like `(re)building entity page page=…` or `wrote schema`, no WARN. What you'll see when something is wrong: a WARN with the exact parser/validator/backend complaint — e.g. `Unknown AWS protocol prefix`, `datasource not connected`, `referenced table … not in catalog`. Read the WARN, fix the YAML, save, query again.

If `list_logs` isn't available in your tool list, the Vantage MCP isn't connected to your agent yet. **Set it up before continuing** — this loop is the single biggest accelerator the skill gives you.

### Configuring the Vantage MCP server

Vantage serves MCP over HTTP at `http://127.0.0.1:14488/mcp` while it's running. Connect your agent to that URL.

**Claude Code** — add it to the project's `.mcp.json` (created if it doesn't exist):

```json
{
  "mcpServers": {
    "vantage-ui": {
      "type": "http",
      "url": "http://127.0.0.1:14488/mcp"
    }
  }
}
```

Or via CLI: `claude mcp add --transport http vantage-ui http://127.0.0.1:14488/mcp`. Reload Claude Code after adding.

**Other tools** that support remote HTTP MCP servers (Cursor, Zed, Continue, …) take the same URL. Zed's `settings.json` for example:

```json
{
  "vantage-ui": {
    "url": "http://127.0.0.1:14488/mcp",
    "headers": {}
  }
}
```

If the MCP server isn't reachable: confirm Vantage is running, and that no firewall is blocking localhost:14488. Vantage logs `MCP server listening on …` on startup; if you see that and the connection still fails, it's the agent's MCP config, not the server.

## Project shape

A Vantage project always has these four folders at the root:

```
<project>/
├── datasource/   # one *.yaml per backend connection
├── table/        # one *.yaml per logical table
├── page/         # one *.yaml per UI page (list, detail, dashboard, …)
└── menu/         # navigation surfaces (left.yaml = sidebar)
```

Each folder also contains:

- `README.md` — short orientation written by Vantage.
- `<kind>-schema-<N>.json` — JSON Schema that's authoritative for the YAML in that folder. **Read it first** when you're unsure about field names or shapes — it's auto-generated from the Rust types and never lies. Reference it from any new YAML by adding the first line:
  ```yaml
  # yaml-language-server: $schema=./<kind>-schema-1.json
  ```

The filename (without `.yaml`) is the **key** that other files reference. So `table/orders.yaml` is referenced as `table: orders` from a page, etc.

## How to add a working UI from scratch

Typical flow for any new datasource:

1. **Create the datasource.** Write `datasource/<key>.yaml` with at minimum `type:` and the per-backend connection fields. Refer to the persistence-specific skill (`.agents/skills/vantage-persistence-<kind>/SKILL.md`) for connection details.
2. **Introspect the source.** Use the actual backend tools (psql, sqlite3, mongosh, aws cli, curl + OpenAPI) to list what's available. Don't guess at columns — ask the database.
3. **Add tables.** One `table/<key>.yaml` per logical entity. Define `datasource:`, `columns:` (with `type:` and `flags:`), and `references:` for relations.
4. **Add pages.** A list page is `kind: crud` over a table; a detail page has `args:` and uses `queries:` to pull a single row.
5. **Wire the sidebar.** Edit `menu/left.yaml` — group pages by datasource so the user can see at a glance where things come from.
6. **Save and verify.** As soon as you save, the dashboard updates. If the catalog complains (visible in the validation panel), fix the YAML and save again.

## YAML conventions

- File names are kebab-case: `clients-overview.yaml`, `aws-log-groups.yaml`.
- Table keys are usually snake_case (`order_line.yaml`) — they often map to DB tables. Page keys are usually kebab-case.
- Always start a new file with the `# yaml-language-server:` schema line for editor validation.
- Lead with a short comment block explaining what the file is and any non-obvious choices. Future you (or your user) will thank you.

## Column flags worth knowing

In `table/*.yaml`, each column can carry `flags: [...]`:

- `id` — primary key. Used to identify a row.
- `title` — the human-readable label for a row (used in references, navigation, etc.).
- `searchable` — included in the table's full-text search box.
- `mandatory` — required at insert time (UI marks the field as required).

A reasonable starter set:

```yaml
columns:
  - name: id
    type: string
    flags: [id]
  - name: name
    type: string
    flags: [mandatory, title, searchable]
```

## Relations

Use `references:` on a column to link to another table. Two common shapes:

```yaml
# 1:1 / N:1 — column points at another table by id
- name: bakery_id
  type: string
  references: bakery

# 1:N — has-many via foreign key on the other side
- name: id
  type: string
  flags: [id]
  references:
    table: order_line
    kind: has_many
    name: lines              # how this side calls the relation
    foreign_key: order_id    # the FK on the other side
```

`has_many` references give the detail page a related-rows section and let you `navigate:` from a row action with `args: { id: row.id }`.

## Query-sourced & derived tables (aggregation)

A table doesn't have to map onto a physical SurrealDB table. Add a `surreal.rhai:` script and its rows come from an arbitrary `SELECT` — including `GROUP BY` / `sum` aggregation and graph traversal — or use `surreal.base:` + `inherit:` to derive and transform another table. This is how you get the *aggregated* shapes a dashboard needs (revenue by day, top products by units, debt totals): define the grouped table, then point an ordinary chart/list/card at it. These tables are **read-only**.

```yaml
name: product_units
columns:
  product: { type: string, flags: [id, title] }
  units:   { type: int }
surreal:
  rhai: |
    select().from("order")
        .expression(ident("lines")["product"].alias("product"))
        .expression(sum(ident("lines")["quantity"]).alias("units"))
        .group_by(ident("product")).order_by(ident("units"), "desc").limit(5, 0)
```

See `references/query-sourced-tables.md` for both forms, the SurrealDB Rhai vocabulary, and worked dashboard recipes.

## Pages: list, detail, dashboard

Three common shapes:

**List page (CRUD over a table):**
```yaml
title: Clients
elements:
  - kind: crud
    spot: body
    table: client
    row_actions:
      - label: Open
        primary: true
        navigate: client-overview
        args: { id: row.id }
```

**Detail page (parameterised by id):**
```yaml
title: Client overview
args:
  id: { type: string, required: true }
queries:
  client:
    table: client
    where: { id: args.id }
elements:
  - kind: card
    spot: body
    title: client.name
```

**Dashboard (multi-spot template):**
```yaml
title: Overview
template: two-column
elements:
  - kind: tableview
    spot: left
    table: aws_log_groups
  - kind: tableview
    spot: right
    table: aws_log_events
```

When in doubt, look at an existing page YAML in this project for a pattern to mirror.

**Chart dashboard (`layout: grid` + page `controls:`):**
```yaml
title: Dashboard
layout: grid          # tile elements; `columns:` per row (default 2)
columns: 2
controls:             # page-level filter; value exposed as controls.<name>
  - name: bakery
    label: Location
    source: { table: bakery-surreal/bakery, value: id, label: name, all_label: All locations }
elements:
  - kind: chart
    spot: body
    table: bakery-surreal/product
    chart_type: bar   # line | bar | pie
    x: name
    y: price
    title: Product prices
    where: 'controls.bakery == "" || row.bakery == controls.bakery'
```

A chart plots **one point per row** (`x` category, `y` magnitude) — no
aggregation. A `where:` body referencing `controls.<name>` auto-subscribes
the chart, so picking a different value in the dropdown re-scopes every
chart that reads it. See `references/charts-and-dashboards.md`.

## Drilling into related pages from row actions

Right-click a grid row → context menu automatically lists "Open
<relation>" entries for every `has_many` declared on the table.
**No YAML needed** for these — the page renderer derives them from
the table's `references:` block. Useful for "show this customer's
orders", "show this server's log events", etc.

For the auto-derived menu to fire, the **parent table** needs a
matching `has_many` reference:

```yaml
# inventory/table/users.yaml
columns:
  - name: id
    type: int
    flags: [id]
    references:
      table: albums
      kind: has_many
      name: albums            # menu shows "Open albums"
      foreign_key: userId     # filter field on the destination side
      narrow_via: id          # filter field on this (parent) side
```

The destination tab is **owned by the current tab** — same
replace / insert-left-of-pinned semantics as link cells. Pin a tab
and the next drilldown opens a fresh sibling instead of replacing
it.

> The older `context_menu:` block with `open_page:` / `model:` /
> `title:` (Rhai → `AnyTable`) was ripped during the Dio migration.
> Today's menu is derived solely from `has_many` relations. Page-level
> custom menu entries return via the `action:` row-action surface
> below.

## Row actions: `navigate:` vs. `action:`

A list-style page (`kind: tableview` or `kind: crud`) can declare
`row_actions:` — entries that surface as right-click context-menu
items per row (below the auto-derived "Open <relation>" entries).

Each row-action is exactly one of:

- **`navigate:`** — open another page parameterised by the row's id.
  Best for "drill into detail".
- **`action:`** — a multi-statement Rhai body that orchestrates
  registered actions, password generation, and active-record row
  writes. Best for "do something to this row from a button".

```yaml
# page/clients.yaml
title: Clients
elements:
  - kind: crud
    spot: body
    table: client
    row_actions:
      - label: Open
        navigate: client-detail
        args: { id: row.id }
      - label: Send password reset
        icon: Mail
        action: |
          let pwd = generate_password(12);
          actions.send_password_reset(row.email, row.name, pwd);
          row.password_hash = hash_password(pwd);
          row.save();
```

The `action:` body has access to:

| Surface | What it does |
|---|---|
| `row.X` | reads field `X` from the right-clicked row |
| `row.X = v` | stages a write; persisted on `row.save()` |
| `row.save()` | commits staged changes via the dataset's `patch_value` (diff-on-save — only changed fields are sent) |
| `actions.<name>(...)` | invokes a `action/<name>.yaml` entry; opens a confirm dialog, fires on confirm, throws on cancel or HTTP failure |
| `generate_password(len)` | random password (no ambiguous chars) |
| `hash_password(plain)` | argon2id PHC string |
| `notify(msg)` | toast |

Failure semantics: any `throw` inside the body (cancelled action,
HTTP non-2xx, save fail) aborts the rest of the body — so the
generate→send→save ordering above means **the row is only saved
after the email actually went out**.

## Actions: declaring side-effecting operations

One `action/<key>.yaml` file per named operation. The filename stem
(with `-` → `_`) is the Rhai function name. So
`action/send-password-reset.yaml` is `actions.send_password_reset(...)`.

```yaml
# action/send-password-reset.yaml
# yaml-language-server: $schema=./action-schema-1.json
kind: http_request
description: |
  Emails the customer a new temporary password. They must change it
  on first login.

params:
  email:    { type: string, label: Email }
  name:     { type: string, label: "Customer name" }
  password: { type: string, label: "New password" }

http:
  method: POST
  url: "${MAILER_URL}/password-reset"
  headers:
    Authorization: "Bearer ${MAILER_TOKEN}"
    Content-Type: "application/json"
  body:
    to: email
    name: name
    password: password
```

Key things:

- **`params:` declaration order IS the public contract.** Positional
  args. Reordering them silently breaks every call site for
  same-typed swaps.
- **`${ENV_VAR}` substitution** in `http.url` and `http.headers` values
  (resolved per call from the process environment).
- **`body:` values are Rhai expressions** evaluated against the
  param map. Bare names reference params (`body.to: email`); for a
  literal string write `body.source: "'admin'"`.
- **Confirm dialog comes for free** — the host (vantage-ui) renders a
  modal with the description + params table + Cancel / Confirm. The
  Rhai snippet blocks until the user resolves it.

See `references/actions.md` for the full action YAML reference + a
notify-only example.

## Rhai expressions

Anywhere you see things like `args.id`, `row.name`, or template strings — that's [Rhai](https://rhai.rs). It's a small embedded scripting language with Rust-like syntax. Use it for:

- Page `args:` defaults and validation.
- Page `queries:` `where:` clauses.
- Row action `args:` (with `row` in scope).
- `expressions:` on `table/*.yaml` for server-side computed columns.

Keep expressions short. If the logic gets complicated, push it into a SQL view (or backend equivalent) and expose the result as a column.

See `references/rhai-expressions.md` for a fuller cheat sheet.

## Hot reload

Save a YAML — Vantage notices within ~500ms, re-parses, validates, and rebuilds the affected pages. Open dashboards keep their scroll position, sort, filter, and row selection. **No need to restart Vantage while you're working.**

If your YAML is invalid, Vantage keeps the previous version live. The validation result shows up in two places:
1. The dashboard's validation panel (visible to the user).
2. The MCP `list_logs` stream — call it after every edit (see "The feedback loop" section above).

Use the MCP loop. Don't ask the user "did that work?" — query the logs yourself.

## Be careful with renames

Renaming a key (file rename) breaks every reference to it (in pages, menus, references). The catalog will complain. If you rename, do a project-wide grep and update all references in the same change.

## When you're stuck

- Read the relevant `<kind>-schema-1.json` — it lists every valid field with descriptions.
- Look at an existing YAML of the same kind for a working example.
- Check `references/yaml-schemas.md` for a quick tour of the schema files.
- For backend-specific connection or introspection questions, read `.agents/skills/vantage-persistence-<kind>/SKILL.md`.
- For framework-level gaps ("Vantage doesn't support X yet"), see `references/contributing-upstream.md`.

## Don't

- Don't edit the JSON Schema files by hand — they're auto-generated.
- Don't rename `datasource/`, `table/`, `page/`, or `menu/` — those names are wired into the catalog.
- Don't put secrets (API keys, passwords) in YAML you'd commit. Use env vars at the connection layer.

## Hand suggestions back to the user via `FEEDBACK.md`

While you're working in a Vantage project you'll often notice things the **app itself** could do better — a confusing validator message, a missing schema field, an awkward dashboard layout, a workflow that took five edits when it should have taken one. Those are not bugs in the user's YAML; they're suggestions for Vantage.

Drop them in `FEEDBACK.md` at the project root. The "Send feedback…" dialog in the title bar notices the file, offers an *Include feedback from the agent* checkbox, lets the user preview it, and (when they tick the box and send) ships the contents alongside their own message and deletes the file.

Conventions:

- One file per session. Append to it; don't recreate it on every observation. If it doesn't exist yet, create it. If it does, add to the existing version.
- Start with a `# Vantage <version>` heading. Pull the version from the title bar / About dialog if the user has it open, or from the `vantage_ui` line in `list_logs` output. The heading anchors the suggestions to the build the user actually ran.
- Use Markdown lists. Each bullet: one observation, what you'd change, and (if useful) the YAML/page/datasource that triggered it. Keep entries short — engineers will read this verbatim.
- Scope is **Vantage**, not the user's project. "The `references:` schema should let me declare `kind: belongs_to` without a `name`" is in scope. "Add a customers table" is not — that's just work to do.
- Don't include secrets, sample data, or anything the user wouldn't paste into a public bug report.

Example:

```markdown
# Vantage 0.5.1

- `crud` pages assume the `id` flag exists; when it's missing the validator says `cannot resolve primary key` without naming the column. A pointer to which column it expected would save a lookup.
- Dashboards with `template: two-column` ignore `spot: top`. Either the schema should reject `top` for two-column, or the renderer should treat it as a header band.
- `references: { kind: has_many }` always needs a `name:` — making it optional (defaulting to the FK target table) would cut boilerplate.
```

You don't need to ask the user before writing the file — they review it before sending. If you have nothing actionable to add, don't create the file.
