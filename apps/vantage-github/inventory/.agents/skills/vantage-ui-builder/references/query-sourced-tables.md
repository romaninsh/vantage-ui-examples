# Query-sourced & derived tables

A normal `table/<key>.yaml` maps one-to-one onto a physical SurrealDB table. A
**query-sourced** table instead takes its rows from an arbitrary `SELECT` you
write as a Rhai script — including `GROUP BY` / `math::sum` aggregation and
graph traversal. This is how you build the *aggregated* shapes a dashboard
needs (revenue by day, top products by units, client debt totals): define a
table whose query already produces the grouped rows, then point an ordinary
`chart` / `list` / `card` / `tableview` element at it. No new element kind —
just a new kind of table source.

Query-sourced and derived tables are **read-only**. Vantage will not insert,
update, or delete through them; a `toolbar` insert or a `row.save()` / delete
action targeting one is refused with a WARN in `list_logs`. Don't put
mutating affordances on these tables.

> SurrealDB only for now. The same YAML keys are planned for the SQL backends.

## Form 1 — `rhai:` source (query from scratch)

```yaml
name: expensive_products
datasource: bakery-surreal
columns:
  id:    { type: string, flags: [id] }
  name:  { type: string, flags: [title] }
  price: { type: int }
surreal:
  rhai: |
    select().from("product")
        .field("id").field("name").field("price")
        .where(ident("price") > 15)
```

The `columns:` you declare must match the fields the query returns — the script
selects them, the table surfaces them. A `[id]` column is still required.

## Form 2 — `base:` + `inherit:` (derive & transform)

Derive from another table, inherit some of its columns/relations, and transform
its query in **transform mode**: the base table's `select()` is seeded into the
script as `base`, so you extend an existing query instead of starting over.
`base.clear_fields()` drops the inherited `SELECT` list so you can re-project
for a clean `GROUP BY`.

```yaml
name: client_debt_totals
datasource: bakery-surreal
id_column: client_id
columns:
  client_id: { type: string, flags: [id] }
  total_due: { type: int }
surreal:
  base: order
  inherit:
    columns: [client_id]
  rhai: |
    base.clear_fields()
        .field("client_id")
        .expression(sum(ident("total")).alias("total_due"))
        .group_by(ident("client_id"))
```

`inherit.relations: [client]` would also carry the base's `client` reference
onto the derived table, so set-to-set traversal (`ref:`) still works.

## The SurrealDB Rhai vocabulary

The script builds a `SELECT` through a fluent API. Each call returns the
builder; `expression(...)` takes a built expression, `field("x")` is sugar for a
bare column.

| Builder method | SurrealQL |
|---|---|
| `select().from("t")` | `SELECT … FROM t` |
| `.field("name")` | bare column in the select list |
| `.expression(expr.alias("out"))` | aliased expression (`… AS out`) |
| `.where(cond)` | `WHERE cond` |
| `.group_by(expr)` | `GROUP BY expr` |
| `.order_by(expr, "desc")` | `ORDER BY expr DESC` |
| `.limit(n, start)` | `LIMIT n START start` |
| `base.clear_fields()` | reset the inherited select list (transform mode) |

Expressions — the names match `vantage-sql` where the concept exists, and lower
to SurrealQL automatically (see `references/rhai-expressions.md` for the full
list):

| Primitive | Lowers to | Use |
|---|---|---|
| `count()` | `count()` | row count |
| `sum(e)` / `avg(e)` | `math::sum` / `math::mean` | totals / means |
| `min(e)` / `max(e)` | `math::min` / `math::max` | |
| `round(e, n)` | `math::fixed(e, n)` | round to `n` decimals |
| `coalesce(a, b)` | `a ?? b` | null fallback |
| `case_when().when(c, v).else_(d).expr()` | `IF c THEN v ELSE d END` | banding |
| `first(e)` / `len(e)` | `array::first` / `array::len` | array head / length |
| `ident("col")["sub"]` | `col.sub` | dotted field path |
| `graph(me, "edge", "target")` | `->edge->target` | graph traversal |
| `expr("raw surql")` | verbatim | escape hatch when no primitive fits |

Comparisons (`==`, `!=`, `<`, `>`, `<=`, `>=`) build conditions:
`ident("price") > 15`, `ident("is_deleted") == false`.

### Closures over embedded arrays

The bakery `order` row embeds a `lines` array (`{ product, quantity, price }`).
`.map` / `.fold` / `.filter` take native Rhai `|l| …` closures that run
**symbolically** — they emit SurrealQL, they don't execute in Rust:

```rhai
// per-order total = sum(line.quantity * line.price)
ident("lines").fold(0, |acc, l| acc + l["quantity"] * l["price"]).alias("total")
// → lines.fold(0, |$acc, $value| ($acc + ($value.quantity * $value.price))) AS total

ident("lines").map(|l| #{ product: l["product"]["name"], qty: l["quantity"] }).alias("breakdown")
```

## Worked recipes (Hill Valley dashboard)

**Per-order computed total** (one row per order, `total` derived from lines):

```yaml
name: order_totals
datasource: bakery-surreal
columns:
  id:    { type: string, flags: [id] }
  total: { type: int }
surreal:
  rhai: |
    select().from("order")
        .field("id")
        .expression(ident("lines").fold(0, |acc, l| acc + l["quantity"] * l["price"]).alias("total"))
        .order_by(ident("total"), "desc")
```

**Top products by units sold** — flatten order lines, group by product:

```yaml
name: product_units
datasource: bakery-surreal
id_column: product
columns:
  product: { type: string, flags: [id, title] }
  units:   { type: int }
surreal:
  rhai: |
    select().from("order")
        .expression(ident("lines")["product"].alias("product"))
        .expression(sum(ident("lines")["quantity"]).alias("units"))
        .group_by(ident("product"))
        .order_by(ident("units"), "desc")
        .limit(5, 0)
```

Then a dashboard bar chart over `product_units` (`x: product`, `y: units`) shows
the real top-5 — aggregation the raw-row chart can't do on its own.

**Clients in debt** — a `where:` filter as a read-only worklist:

```yaml
name: debtors
datasource: bakery-surreal
columns:
  id:      { type: string, flags: [id] }
  name:    { type: string, flags: [title] }
  balance: { type: int }
surreal:
  base: client
  inherit:
    columns: [id, name, balance]
  rhai: |
    base.where(ident("balance") < 0).order_by(ident("balance"), "asc")
```

## Checklist

- Declare `columns:` matching the query's output fields; keep one `[id]` column.
- `rhai:` and `base:` are mutually exclusive with a `table:` override.
- After saving, call `list_logs(level="warn")` — a bad script logs a parse or
  build error there; an empty table usually means the query returned no rows.
- These tables are read-only; pair them with read-only elements (chart, list,
  card, or a `crud`/`tableview` used for display only).
