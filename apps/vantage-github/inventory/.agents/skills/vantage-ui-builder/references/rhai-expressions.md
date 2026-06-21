# Rhai expressions in Vantage

[Rhai](https://rhai.rs) is the embedded scripting language Vantage uses for inline expressions. You'll see it in:

- Page `args:` defaults and validation.
- Page `queries:` (especially `where:` clauses, `order:`, `limit:`).
- Row action `args:` (in `crud` element row actions; `row` is in scope).
- `expressions:` on `table/*.yaml` for server-side computed columns.
- `context_menu[*].action` (side effects: `copy_to_clipboard`, `notify`).
- `context_menu[*].model` + `context_menu[*].title` (compute the
  destination table + breadcrumb title when opening another page —
  see the *Drilling into related pages* section in `SKILL.md`).

## Cheat sheet

```rhai
// Field access — all these are typed
row.id
row.name
args.id
args.id.is_empty()

// String concat
"client-" + row.id

// Arithmetic
row.price * row.quantity

// Conditional
if row.status == "active" { "✓" } else { "—" }

// String formatting (use `to_string()`)
"Order #" + row.id.to_string()
```

## Scope

| Where             | Variables in scope                                  |
| ----------------- | --------------------------------------------------- |
| `args.<name>:` defaults | (no row scope) — only literals/env-style |
| `queries.<x>.where:` | `args` (page args)                              |
| Row actions `args:` | `row` (current row), `args` (current page args)  |
| Table `expressions:` | the row's columns by name                       |
| `context_menu[*].action` | row columns as bare vars, full row as `row`, `model` = current page's `AnyTable` |
| `context_menu[*].model` / `.title` | same scope as `.action`; must return `AnyTable` / `String` respectively |

`model` is a wrapper around the page's master table. Its only
useful method is `model.get_ref(<has_many_name>, <id>)`, which
narrows the table to the row with `<id>` and then follows the
named has-many. Chain it for multi-step drilldowns.

## Don't

- Don't put async or I/O calls in Rhai. It's purely synchronous.
- Don't write multi-statement programs — one expression per slot.
- Don't try to mutate input — Rhai expressions in Vantage are read-only.

If a piece of logic doesn't fit comfortably in one Rhai expression, it probably belongs in a SQL view or backend-side computation, not the YAML.
