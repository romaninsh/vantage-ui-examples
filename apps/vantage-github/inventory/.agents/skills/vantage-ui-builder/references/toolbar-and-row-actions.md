# Toolbar and row actions

Actions get invoked from one of two places on a grid page:

- **`toolbar:`** — buttons above the grid, fired without any
  particular row in scope. Used for "Add product", "Import", "Export".
- **`row_actions:`** — entries in the right-click menu on a row.
  Fired with `row` in scope. Used for "Edit", "Delete",
  "Send password reset", "Cancel order".

Same `action:` body shape in both. Same `actions.<name>(...)` host
fn. The only scope difference: toolbar bodies have no `row`
identifier available.

```yaml
elements:
  - kind: grid
    table: bakery-surreal/product
    toolbar:
      - label: "Add product"
        icon: plus
        action: |
          let r = actions.add_product();
          let p = tables.product.create();
          p.set(r);
          p.save();
    row_actions:
      - label: Edit
        action: |
          let r = actions.edit_product(row);
          row.set(r);
          row.save();
      - label: Delete
        action: |
          if actions.delete_product(row) { row.delete(); }
```

See [rhai-row-surface.md](./rhai-row-surface.md) and
[rhai-tables-namespace.md](./rhai-tables-namespace.md) for the
verbs.

## Gating row actions with `when:`

A row action can carry a `when:` Rhai bool expression. The right-
click menu evaluates it per-row at menu-open time; entries that
return `false` are hidden. Used for lifecycle gates: only show
"Mark delivered" on orders that are `ready`, only show "Cancel"
on orders not already cancelled / paid / fulfilled.

```yaml
row_actions:
  - label: "Mark confirmed"
    when: 'row.status == "placed"'
    action: |
      row.status = "confirmed";
      row.save();
  - label: "Mark paid"
    when: 'row.status == "delivered" || row.status == "picked_up"'
    action: |
      row.status = "paid";
      row.save();
```

Rules:

- **Single bool expression.** Not a multi-statement body. `row.X`
  reads (no writes) and any pure operators are allowed.
- **`row` is in scope; `actions.<>` and `tables.<>` are not.**
  Predicates are pure functions of the row. Side-effects belong
  inside the `action:` body.
- **Errors hide the action.** A predicate that won't compile,
  throws, or doesn't return a bool gets logged at `warn` and the
  item is omitted from the menu. Conservative — never accidentally
  shows a disallowed action.
- **Only on `row_actions:`** today, not on `toolbar:` entries.

Use `when:` instead of writing the guard into the body
(`if row.status != "placed" { return; }`). The body-level guard
still fires the click and runs an empty action; `when:` keeps the
menu honest and the user oriented.

## `requires_row` detection

At catalog load Vantage scans every toolbar `action:` body for the
identifier `row`. If found, the button is marked `requires_row =
true` and will render disabled when no row is selected on the grid.

The detection is a conservative token scan:

- `row.save()` → detected ✓
- `let r = row.email` → detected ✓
- `if row.status == "placed" { ... }` → detected ✓
- `narrow`, `arrow`, `row_count`, `borrower` → NOT detected
  (word boundaries) ✓
- `notify("row.foo")` → false positive (counted as `row`); harmless
  — button stays disabled, never wrongly enabled

The flag exists only on toolbar items. Row-action items always have
the right-clicked row in scope by construction, so the menu is
always enabled.

## v1 follow-up: row selection UX

Grid row selection (click a row → highlight it → toolbar buttons
that need a row light up) hasn't landed yet. As of v1:

- Toolbar buttons **without** `requires_row` (e.g. "Add product",
  which doesn't reference `row`) work fine — always enabled, click
  fires the body.
- Toolbar buttons **with** `requires_row` stay permanently disabled
  — there's no UI to "select" a row yet. The wiring is in place so
  these light up the day grid selection ships.

In practice this means write toolbar actions for things that don't
need a row (Add, Import, Export, Refresh). For per-row operations,
use `row_actions:` (right-click) — that path works today.

## Placement guidance

- **Toolbar:** page-level operations on the dataset as a whole.
  Add a row. Import a CSV. Trigger a refresh.
- **Row actions:** per-row operations. Edit. Delete. Send an email
  to this client. Cancel this order.
- Don't duplicate the same action in both places unless it really
  has both semantics (rare).
