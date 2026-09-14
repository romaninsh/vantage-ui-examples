# Smith Requirements — `dashboard-charts`

> You are Agent Smith. You edit YAML files in `examples/surreal-bakery/`. Read this top to bottom
> first. Fill in "Notes" as you work.

## What you're building

A **Dashboard** page: a single page-level **scope dropdown** (pick a franchise bakery) above a
**2×2 grid of charts**. Each chart plots one point per row of its table — no aggregation. Picking a
bakery in the dropdown re-scopes every chart to that bakery's rows. Then add a "Dashboard" entry to
the sidebar menu.

Full authoring reference: `.agents/skills/vantage-ui-builder/references/charts-and-dashboards.md`
(read it first — it covers `kind: chart`, `controls:`, `layout: grid`, and the `controls.*` link).

## Prerequisites

- [ ] **vantage-ui running** — call `list_logs(level="info", limit=5)` on MCP.
- [ ] **SurrealDB reachable** — `surreal isready --endpoint <url>`.
- [ ] **MCP tools present** — `list_logs` returns lines.

If any fails, stop and write in Notes.

### MCP tools

- `list_logs(level, limit)` — always available
- (No feature-specific tools.)

## Tasks

After every save, call `list_logs(level="warn", limit=20)`. Fix errors before continuing.

- [ ] **Task 1. Create `examples/surreal-bakery/page/dashboard.yaml`.** `layout: grid`,
      `columns: 2`, one control `bakery` sourced from the `bakery` table, and four chart elements.
      Use this as the starting point (adjust column names only if `SELECT * FROM <table> LIMIT 3`
      shows different fields):

      ```yaml
      # yaml-language-server: $schema=./page-schema-1.json

      title: Dashboard
      layout: grid
      columns: 2

      controls:
        - name: bakery
          label: Location
          source:
            table: bakery-surreal/bakery
            value: id
            label: name
            all_label: All locations

      elements:
        - kind: chart
          spot: body
          table: bakery-surreal/product
          chart_type: bar
          x: name
          y: price
          title: Product prices
          where: 'controls.bakery == "" || row.bakery == controls.bakery'

        - kind: chart
          spot: body
          table: bakery-surreal/product
          chart_type: bar
          x: name
          y: inventory.stock
          title: Stock on hand
          where: 'controls.bakery == "" || row.bakery == controls.bakery'

        - kind: chart
          spot: body
          table: bakery-surreal/product
          chart_type: pie
          x: name
          y: calories
          title: Calorie share
          where: 'controls.bakery == "" || row.bakery == controls.bakery'

        - kind: chart
          spot: body
          table: bakery-surreal/client
          chart_type: line
          x: name
          y: balance
          title: Client balances
          where: 'controls.bakery == "" || row.bakery == controls.bakery'
      ```

- [ ] **Task 2. Add a Dashboard menu entry.** In `examples/surreal-bakery/menu/left.yaml`, add a
      first item:

      ```yaml
        - label: Dashboard
          page: dashboard
          icon: Inbox
      ```
      (Pick any valid icon name; put it at the top of `items:` so it's the landing page.)

### Discovering schema

```bash
surreal sql --endpoint ws://localhost:8000 --user root --pass root --ns bakery --db v2 --pretty <<'SQL'
SELECT * FROM product LIMIT 3;
SELECT * FROM client LIMIT 3;
SELECT * FROM bakery LIMIT 3;
SQL
```

Confirm the columns the charts read exist and are numeric where `y:` points:
`product.price`, `product.inventory.stock`, `product.calories`, `client.balance`. `client.balance`
may arrive as text (a decimal) — that's fine, the chart parses numeric text. Don't add `DEFINE FIELD`.

For valid `kind: chart` / `controls:` shapes, see the generated `page-schema-1.json` in
`examples/surreal-bakery/page/`.

## Acceptance criteria

- [ ] All tasks ticked.
- [ ] `list_logs(level="warn", limit=20)` empty after the run.
- [ ] Dashboard opens from the sidebar and shows four charts in a 2×2 grid.
- [ ] Changing the **Location** dropdown re-scopes all four charts; "All locations" shows the full
      data. (Pick a specific bakery → each chart shows only that bakery's products/clients.)

## Notes (Smith fills in)

- **Heads-up:** there is no "orders over time" chart — `order` has no numeric column to plot
  (a total would be a sum over `lines`, which needs aggregation we don't have yet). If you'd like a
  fourth *type* of view, the current four already exercise bar + pie + line. Leave orders for the
  aggregation follow-up.
