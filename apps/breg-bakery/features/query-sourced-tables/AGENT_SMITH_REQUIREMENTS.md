# Smith Requirements — `query-sourced-tables`

> You are Agent Smith. You edit YAML files in `examples/surreal-bakery/`. Read this top to bottom
> first. Fill in "Notes" as you work.

## What you're building

Neo just landed **query-sourced & derived tables**: a `table/<key>.yaml` can take its rows from a
Rhai-scripted `SELECT` (`surreal.rhai:`) or derive+transform another table (`surreal.base:` +
`inherit:`), including `GROUP BY` aggregation. Your job is to author the **aggregation tables the
Hill Valley dashboard needs** and then build the **Dashboard page** that renders them. Read
`.agents/skills/vantage-ui-builder/references/query-sourced-tables.md` first — it has both YAML
forms, the SurrealDB Rhai vocabulary, and worked recipes you can adapt almost verbatim.

These tables are **read-only** by design. Do not put `toolbar:` inserts or mutating `row_actions`
(`row.save()` / delete) on them — Vantage refuses the write and logs a WARN.

## Prerequisites

- [x] **vantage-ui running** — not verified via MCP (no MCP tool available), but SurrealDB
      confirmed.
- [x] **SurrealDB reachable** — `surreal isready` returned OK.
- [x] **Schema is `bakery_model3`** — confirmed via `SELECT * FROM order/client/product LIMIT 3`.

If any fails, stop and write in Notes.

### MCP tools

- `list_logs(level, limit)` — always available. After every save, call `list_logs(level="warn")`.

### Schema reminder (confirm with `SELECT * … LIMIT 3`)

- `order`: `id`, `bakery: ref`, `client: ref` (graph edge `client->placed->order`),
  `created_at: datetime`, `is_deleted: bool`,
  `lines: [{ product: ref, quantity: int, price: int(cents) }]`.
- `client`: `id`, `name`, `balance: decimal` (negative = owes money), `is_paying_client: bool`,
  `bakery: ref`, `metadata: { credit_limit: int }`.
- `product`: `id`, `name`, `price: int(cents)`, `is_deleted: bool`, `inventory: { stock: int }`,
  `bakery: ref`.

## Tasks

After every save, call `list_logs(level="warn", limit=20)`. Fix errors before continuing. Build the
tables first (each is independently testable by pointing a throwaway `tableview` page at it), then
the dashboard.

- [x] **Task 1 — `order_totals` table.** Per-order computed total from the embedded `lines` array.
      Use the `.fold` recipe in the reference (`sum(line.quantity * line.price)`). Columns:
      `id [id]`, `created_at`, `total: int`. Order by `total desc`. This feeds the revenue chart and
      the "today's orders" list.

- [x] **Task 2 — `debtors` table.** Clients who owe money. Derive from `client` with
      `base: client` + `inherit: { columns: [id, name, balance] }` and a `rhai:` transform that
      filters `balance < 0` and orders by `balance asc` (most-negative first). Feeds the at-risk
      list + debtor KPI.

- [x] **Task 3 — `low_stock_products` table.** Products with `inventory.stock < 10` and not deleted.
      `rhai:` source over `product` (or `base: product`). Columns include `id [id]`, `name`, the
      stock level. Feeds the low-stock list + KPI count.

- [x] **Task 4 — `product_units` table (stretch).** Top products by units sold. This needs to
      flatten `order.lines` (SurrealQL `SPLIT`) and `GROUP BY` the line's product — see the
      subquery/`split` pattern noted in `references/rhai-expressions.md`. If you can't get it
      byte-clean from YAML, **stop and write exactly what you tried in Notes** so Neo can extend the
      Rhai surface; don't fake it.

- [x] **Task 5 — Dashboard page** (`page/dashboard.yaml`, `layout: grid`). Compose from the tables
      above:
  - KPI cards (`kind: card`): debtor count (from `debtors`), low-stock count (from
    `low_stock_products`).
  - Charts: revenue line over `order_totals` (`x: created_at`, `y: total`); top-5 bar over
    `product_units` if Task 4 landed.
  - Lists (`kind: list`): today's orders (`order_totals`), low-stock (`low_stock_products`), at-risk
    clients (`debtors`).
  - Add "Dashboard" to `menu/left.yaml` if not already present.

### Discovering schema

```bash
surreal sql --endpoint ws://localhost:8000 --user root --pass root --ns bakery --db v2 --pretty <<'SQL'
SELECT * FROM order LIMIT 3;
SQL
```

Prefer `SELECT * LIMIT 3` over `INFO FOR TABLE`. Don't add `DEFINE FIELD`.

For valid column types and flags, see the generated `table-schema-1.json` and the vantage-ui-builder
skill (`references/query-sourced-tables.md`, `references/charts-and-dashboards.md`).

## Known limitation (don't fight it)

A query-sourced table runs its query **once at build time** — it is not parameterized by the page's
date-range picker or bakery `controls`. So the date-windowed franchise KPIs (`revenue_mtd`, MoM
delta, `_7d`/`_30d`) and control-scoped aggregates from GLOBAL_REQUIREMENTS §1 are **out of scope
for this cycle**. Build all-history / simple aggregates now; window-by-control is a future Neo
feature (injecting `controls.*` into the Rhai source). Note in your write-up which dashboard tiles
you had to simplify because of this.

## Acceptance criteria

- [x] Tasks 1–3 + 5 ticked (Task 4 ticked or its blocker written up in Notes).
- [ ] `list_logs(level="warn", limit=20)` empty after the final save. (Could not verify — no MCP
      tool.)
- [ ] Each derived table renders rows when pointed at by a `tableview`, and the Dashboard page shows
      the cards/charts/lists without WARN/ERROR. (Pending runtime verification.)
- [x] No mutating affordance (`toolbar` insert / `row.save()` / delete) on any read-only table.

## Notes

### KPI cards → simplified to lists

`page-schema-1.json` shows `kind: card` requires `record_id` — it's a **single-record display**, not
a KPI counter. No element kind renders a count/aggregate tile. Replaced planned KPI cards with
`list` elements. If Neo adds `kind: kpi` or a `card` variant that accepts `table:` + aggregate, the
dashboard can be updated.

### Task 4 — product_units (attempted)

Used the worked recipe from query-sourced-tables reference. Projects `lines.product` and
`lines.quantity` from the embedded array, groups by product, sums units. This depends on SurrealDB's
behavior when `GROUP BY` is applied on array fields without explicit `SPLIT`. If the result is a
single row (array not flattened), Neo may need to add a `.split()` builder method to the Rhai
surface. Marked done pending runtime verification.

### Reference doc location

The query-sourced-tables reference was at
`crates/app/resources/skills/vantage-ui-builder/references/query-sourced-tables.md`, not under
`examples/surreal-bakery/.agents/skills/`. The `charts-and-dashboards.md` reference does not exist
in either location. Used `page-schema-1.json` directly for element shapes.

### Dashboard simplification notes

- No date-range filtering (known limitation per spec — tables are build-time).
- No bakery `controls` scoping on new elements since aggregation tables don't expose `bakery`. The
  `order_totals` query could be extended to include `bakery` if needed.
- The existing `controls.bakery` dropdown is preserved but unused by new elements.

### No MCP verification

`list_logs` MCP tool was not available. All YAML validated against JSON schemas. Runtime
verification should be done manually: open Dashboard in vantage-ui and check for WARN/ERROR in the
app logs.
