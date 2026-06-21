# Charts & dashboards

A **dashboard** is an ordinary page with `layout: grid`, a row of page-level
`controls:`, and one or more `kind: chart` elements. A chart plots **one data
point per row** of its table — `x` is the category/axis, `y` the magnitude.
There is no aggregation: the series is a direct row→point projection. Point a
chart at a table that already holds the shape you want to see, optionally
narrowing it with a `where:` filter.

## The chart element

```yaml
- kind: chart
  spot: body
  table: bakery-surreal/product   # or model:/ref: like any element
  chart_type: bar                 # line | bar | pie
  x: name                         # column → category/axis (rendered as text)
  y: price                        # column → number (dotted paths OK: inventory.stock)
  title: Product prices           # optional; defaults to a humanized `y`
  where: 'row.is_deleted == false'  # optional row filter (see below)
```

| Field        | Notes |
|--------------|-------|
| `chart_type` | `line` (x = ordered axis, y = value), `bar` (x = band, y = height), `pie` (y = slice size, one slice per row) |
| `x` / `y`    | Column names on the bound table. `y` must read as a number — integers, floats, and numeric text (e.g. a SurrealDB `decimal` balance) all work; non-numeric rows are dropped. Dotted paths reach embedded objects (`inventory.stock`). |
| `where:`     | Optional Rhai predicate, evaluated per row (see below). |

Charts are capped at the first **200 points** (raw-row charts shouldn't be
unbounded); a WARN is logged when a series is truncated.

## Page controls

A control is a dropdown whose options come from a table — one option per row.
The selected value becomes `controls.<name>`, readable from any element's
`where:`.

```yaml
controls:
  - name: bakery               # referenced as controls.bakery
    label: Location            # optional; defaults to a humanized name
    source:
      table: bakery-surreal/bakery
      value: id                # column whose value becomes controls.bakery
      label: name              # column shown in the dropdown
      all_label: All locations # optional; the leading "no filter" entry
```

The "all" entry sets `controls.bakery` to the empty string `""`. Selecting a
row sets it to that row's `value` column, stringified the same way a row cell
is — so an `id` source yields the `<tb>:<id>` form that a foreign-key column
compares equal to.

## Linking controls to charts

A chart `where:` body runs per row with **`row`** (the record, read-only) and
**`controls`** (the selected values) in scope, returning a bool. A chart that
references `controls.<name>` automatically **subscribes** to that control, so
changing the dropdown re-filters and re-renders only the charts that read it.

```yaml
where: 'controls.bakery == "" || row.bakery == controls.bakery'
```

Read this as: when "all" is selected (empty), keep every row; otherwise keep
only rows whose `bakery` matches the selection. Always handle the empty case
or the chart goes blank under "all".

A failing `where:` (typo, wrong type) drops the row and logs once — a blank
chart is the signal. Predicates are pure over `row` + `controls`: no
`actions.*` / `tables.*`.

## Grid layout

```yaml
layout: grid    # tile elements into equal cells
columns: 2      # cells per row (default 2 → a 2×N grid)
```

Unlike `burger` / `fence`, grid cells don't chain selection — every element
binds its own `table:` and stands alone. A 2×2 dashboard is four chart
elements under `layout: grid` with `columns: 2`.

## Worked example

```yaml
title: Dashboard
layout: grid
columns: 2
controls:
  - name: bakery
    label: Location
    source: { table: bakery-surreal/bakery, value: id, label: name, all_label: All locations }
elements:
  - kind: chart
    spot: body
    table: bakery-surreal/order
    chart_type: line
    x: created_at
    y: total
    title: Order value over time
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
    chart_type: bar
    x: name
    y: price
    title: Product prices
    where: 'controls.bakery == "" || row.bakery == controls.bakery'
  - kind: chart
    spot: body
    table: bakery-surreal/client
    chart_type: pie
    x: name
    y: balance
    title: Outstanding balance
    where: 'controls.bakery == "" || row.bakery == controls.bakery'
```

## Notes & limits

- **Charts don't aggregate.** One row = one point. For "revenue by day" or "top
  products by units", point the chart at a **query-sourced table** that already
  holds the grouped shape — define the `GROUP BY` / `sum` in the table's
  `surreal.rhai:` source. See `references/query-sourced-tables.md`.
- **Pie + negative values** distort the slice angles — pick a `y` that's
  non-negative (or filter to it) for pie charts.
- Chart types beyond line/bar/pie (area, candlestick) aren't wired yet.
