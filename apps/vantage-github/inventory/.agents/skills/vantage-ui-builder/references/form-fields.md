# Form fields

For `kind: form` actions only. The `form:` block declares what shows
up in the dialog. See [action-kinds.md](./action-kinds.md) for the
surrounding YAML.

## Two ways to declare fields

### Explicit fields

Self-contained — no table needed. Each entry is a full field
definition.

```yaml
form:
  fields:
    - { name: reason, type: string, label: Reason,
        choices: [customer_request, payment_failed, out_of_stock, other] }
    - { name: note,   type: string, label: Note, required: false, multiline: true }
```

Use when the form collects ad-hoc input that doesn't map onto a
table (cancellation reason, support ticket category, freeform note).

### Table-derived fields

Point at a table and inherit each field's metadata (type, label,
choices, default) from the column definition. Override per-field
only what you need.

```yaml
form:
  table: bakery-surreal/product
  fields:
    - name                                        # shorthand — inherits everything
    - bakery
    - { name: price, label: "Price (cents)" }     # override label only
    - calories
    - "inventory.stock"                           # dotted path through embedded objects
```

Use when the form maps directly onto a table — `add-product`,
`edit-product`, anything that ends in `row.set(r); row.save()` or
`tables.<name>.create()` + `.set(r) + .save()`.

You can mix explicit and shorthand entries in the same `fields:`
list — the rule is per-entry, not per-block.

## Shorthand rules

A `fields:` entry is one of two YAML shapes:

| Form | Means |
|---|---|
| `- foo` (bare string) | `{ name: foo }` — inherit everything from the table column `foo` |
| `- { name: foo, label: "Pretty" }` (map) | inherit from the column, override the fields you set |

Bare strings only make sense when `form.table:` is set. The catalog
validator rejects them otherwise.

Omitting `fields:` entirely (with `form.table:` set) defaults to
"all writable columns of the table, in declaration order".

## Field types

| `type:` | Renders as |
|---|---|
| `string` | text input (single line) |
| `string` + `multiline: true` | textarea |
| `string` + `choices: [...]` | dropdown |
| `int` | numeric input, integer |
| `float` | numeric input, decimal |
| `bool` | checkbox |
| `datetime` | date+time picker |

`enum` columns from a table surface as `string` + `choices:`
automatically.

## Per-field extras

| Key | Default | Meaning |
|---|---|---|
| `label` | humanised `name` | display label above the input |
| `required` | `true` | empty input blocks Confirm |
| `multiline` | `false` | string-only; renders a textarea |
| `choices` | (none) | string-only; renders a dropdown over the listed values |
| `placeholder` | (none) | greyed-out hint inside the input |
| `default` | (none) | initial value (overridden by prefill — see below) |

When the form is table-derived, these are inherited from the column
unless explicitly overridden.

## Dotted-path field names

For embedded objects (e.g. SurrealDB's nested record fields), use a
dotted string as the field name:

```yaml
form:
  table: bakery-surreal/product
  fields:
    - name
    - "inventory.stock"
    - "inventory.warehouse"
```

Quote the dotted name in YAML so it parses as a string. The dialog
shows it as a single field; on submit, the resulting record carries
`r.inventory.stock` as a nested map, and `row.set(r)` writes through
to the nested structure (not literally `row["inventory.stock"]`).

## Prefill semantics

If the calling Rhai snippet passes a row argument, the dialog
**pre-populates** every field whose `name` matches a row attribute:

```rhai
actions.edit_product(row);   // dialog pre-filled from row
actions.add_product();        // dialog empty (or column defaults)
```

The match is by field name, including dotted paths
(`inventory.stock` reads `row.inventory.stock`). Fields with no
matching row attribute fall back to their `default:` if set,
otherwise empty.

**v1 limitation:** prefill for table-derived forms only fires when
the row is passed explicitly — the dialog has no other way to find
the right record. If you forget to pass it, the dialog opens
blank. (Future work: infer prefill from the right-clicked row when
the action's `form.table:` matches the page table.)
