# cashgpt — an LLM-spend dashboard

Six dashboard pages over a PostgreSQL warehouse, replicating an existing Vue
dashboard panel-for-panel. This is the app the dashboard features in Vantage
0.36 were built against: where a panel couldn't be expressed declaratively,
that became engine work rather than a client-side workaround.

Unlike the other examples here, it needs an external database — the point of
the exercise was a warehouse big enough to be honest about (a 500,000-employee
simulation, ~5.4M usage facts).

## Pages

| Page | What it shows |
| --- | --- |
| Overview | KPI islands, spend trajectory, top models, org explorer, four breakdown quads — under a seven-dimension filter bar |
| Executive Brief | Provider trajectory, cost ownership, LOB consolidation, reasoning-tier and model-choice matrices |
| Watchtower | Peer outliers (leave-one-out benchmarks), team efficiency and top-tier overuse |
| Manager Console | Pick a section head, see their whole org: spend, trajectory, top spenders |
| Use Cases & Apps | App catalogue, per-app metrics, provider and consumer mixes |
| Individual | One person's spend, month by month and model by model |

Plus a **Marts** section exposing each `gold.mart_*` table directly, which is
how you check any figure a panel quotes.

## What it demonstrates

- **Aggregate views.** Every panel reads a query-sourced table (`postgres:
  { rhai: ... }`) that groups a mart. No raw queries in the app; no arithmetic
  in the client — shares, deltas and formatted figures are all computed in SQL,
  so what you read on screen is what the database said.
- **Observation args.** The filter bar passes values into those queries
  (`scenery("v").args(#{ lob: l })`), so filters apply *before* aggregation.
  A view can also route between marts on argument presence — the same rule the
  reference server used to pick its narrowest table.
- **Lazy pickers.** The Individual page selects one person out of 500,000
  through a dropdown that fetches nothing until it opens and searches on the
  server.
- **Grouped line charts**, stacked bars, KPI cards with semantic delta colours,
  breakdown lists with percentage underlines.

## Running it

The warehouse lives in a local Postgres container:

```
postgres://cashgpt:cashgpt@localhost:55432/cashgpt
```

The app reads the `gold` schema (pre-aggregated marts) with `silver` on the
search path for dimension lookups; it never writes. Point
`datasource/warehouse.yaml` at your own instance if yours differs — every
table file is schema-unqualified, so only that URL needs changing.

Without the database the app still opens; each page reports that its
datasource is unavailable rather than rendering empty panels.

## Verifying the numbers

Each page was checked figure-for-figure against the reference implementation's
SQL, run directly in psql. Panels whose values are computed in SQL make that
possible: a subtitle reading "13 lines of business" is a string the query
produced, so a mismatch is a query difference rather than a rendering one.

Where a panel needed a UI component that doesn't exist yet, the app uses a grid
or a list and says so in a comment naming the gap — those are tracked
separately, not silently approximated.
