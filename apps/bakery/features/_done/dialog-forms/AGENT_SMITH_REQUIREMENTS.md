# Smith Requirements — `dialog-forms`

> You are Agent Smith. You edit YAML files in `examples/surreal-bakery/`. Read this top to
> bottom first. Fill in "Notes" as you work.

## What you're building

Four user-facing actions on top of the new `kind: form` / `kind: confirm` dialog primitives
shipped this cycle: **cancel an order** (form, row action), **add a product** (form, toolbar
action), **edit a product** (form, row action), **delete a product** (confirm, row action).
Plus schema work on `order` (status + cancellation fields) and page wiring (status badge
column, toolbar slot, row-action menu items).

## Prerequisites

- [ ] **vantage-ui running** — call `list_logs(level="info", limit=5)` on MCP.
- [ ] **SurrealDB reachable** — `surreal isready --endpoint ws://localhost:8000`.
- [ ] **Skill docs current** — read these under `.agents/skills/vantage-ui-builder/references/`:
  - `action-kinds.md` (form / confirm / http_request side-by-side)
  - `form-fields.md` (explicit vs table-derived, shorthand rules)
  - `dialog-shape.md` (title / description / size / confirm_style)
  - `toolbar-and-row-actions.md` (`requires_row` auto-disable)
  - `rhai-row-surface.md` (`row.set` / `row.save` / `row.delete`)
  - `rhai-tables-namespace.md` (`tables.<name>.create()` — note: `.create()` not `.new()`,
    Rhai 1.24 reserves `new` as a keyword)

If any prerequisite fails, stop and write in Notes.

### MCP tools

- `list_logs(level, limit)` — always available

## Tasks

After every save, call `list_logs(level="warn", limit=20)`. Fix errors before continuing.

- [ ] **Task 1.** Add three columns to `examples/surreal-bakery/table/bakery-surreal/order.yaml`:
  - `status` — string column, no SurrealDB DEFINE FIELD (schemaless). Document its valid
    values in a comment: `placed | confirmed | in_production | ready | delivered | picked_up |
    paid | cancelled`. Default in seed data is implied `placed`.
  - `cancellation_reason` — string, optional.
  - `cancellation_note` — string, optional.

- [ ] **Task 2.** Create `examples/surreal-bakery/action/cancel-order.yaml` as `kind: form`
  with two explicit form fields:

  ```yaml
  key: cancel-order
  kind: form
  description: |
    Mark an order as cancelled. The reason and (optional) note are
    written to the order row alongside the status change.
  dialog:
    title: "Cancel order"
    confirm_label: "Cancel order"
    cancel_label: "Keep order"
    confirm_style: danger
  form:
    fields:
      - { name: reason, type: string, label: Reason,
          choices: [customer_request, payment_failed, out_of_stock, other] }
      - { name: note,   type: string, label: Note, required: false, multiline: true }
  ```

- [ ] **Task 3.** Create `examples/surreal-bakery/action/add-product.yaml` as `kind: form`
  with table-derived fields (note shorthand — bare names inherit type/label/choices from
  `bakery-surreal/product`'s column definitions):

  ```yaml
  key: add-product
  kind: form
  description: Create a new product for one of the bakery locations.
  dialog:
    title: "Add product"
    confirm_label: "Add"
  form:
    table: bakery-surreal/product
    fields:
      - name
      - bakery
      - price
      - calories
  ```

  > **Note:** intentionally skip `"inventory.stock"` here — dotted-path embedded-field
  > support in `row.set` is a v1 limitation (see `form-fields.md`). Initial stock can be
  > restocked separately once Scenario 8 ships.

- [ ] **Task 4.** Create `examples/surreal-bakery/action/edit-product.yaml` — same shape as
  add-product but with `title: "Edit product"`:

  ```yaml
  key: edit-product
  kind: form
  description: Update an existing product's name, bakery, price, or calories.
  dialog:
    title: "Edit product"
  form:
    table: bakery-surreal/product
    fields:
      - name
      - bakery
      - price
      - calories
  ```

- [ ] **Task 5.** Create `examples/surreal-bakery/action/delete-product.yaml` as
  `kind: confirm` — no form, just a yes/no with the row's name interpolated into the
  description:

  ```yaml
  key: delete-product
  kind: confirm
  description: Permanently delete a product. Cannot be undone.
  dialog:
    title: "Delete product?"
    description: "This will permanently delete '${row.name}'. Cannot be undone."
    confirm_label: Delete
    cancel_label: Cancel
    confirm_style: danger
  ```

- [ ] **Task 6.** Update `examples/surreal-bakery/page/orders.yaml`:
  - Add a `status` column to the CRUD element's `params.columns` block. Use the existing
    color/labels conventions you see on other status-like columns (greens for `paid`,
    yellows for `in_production` / `ready`, reds for `cancelled`, neutral for `placed`).
    See nearby YAML for the exact `labels:` shape.
  - Add a row-action "Cancel order" with body:

    ```yaml
    row_actions:
      - label: "Cancel order"
        icon: X
        action: |
          let r = actions.cancel_order();
          row.status              = "cancelled";
          row.cancellation_reason = r.reason;
          row.cancellation_note   = r.note;
          row.save();
    ```

- [ ] **Task 7.** Update `examples/surreal-bakery/page/products.yaml`:
  - Add a `toolbar:` block above `row_actions:` with "Add product":

    ```yaml
    toolbar:
      - label: "Add product"
        icon: Plus
        action: |
          let r = actions.add_product();
          let p = tables.product.create();
          p.set(r);
          p.save();
    ```

  - Add `row_actions:` with Edit and Delete:

    ```yaml
    row_actions:
      - label: Edit
        icon: Pencil
        action: |
          let r = actions.edit_product(row);
          row.set(r);
          row.save();
      - label: Delete
        icon: Trash
        action: |
          if actions.delete_product(row) {
            row.delete();
          }
    ```

### Discovering schema

```bash
surreal sql --endpoint ws://localhost:8000 --user root --pass root --ns bakery --db v2 --pretty <<'SQL'
SELECT * FROM product LIMIT 3;
SELECT * FROM "order" LIMIT 3;
SQL
```

Prefer `SELECT * LIMIT 3` over `INFO FOR TABLE`. Don't add `DEFINE FIELD`.

For valid column types and flags, see the generated `table-schema-1.json` in
`examples/surreal-bakery/table/` and the SurrealDB skill at
`.agents/skills/vantage-persistence-surrealdb/SKILL.md`.

For the action / form / dialog / toolbar YAML shapes, see the per-kind schema at
`examples/surreal-bakery/action/action-schema-1.json` (autogenerated; up-to-date).

## Acceptance criteria

- [ ] All seven tasks ticked.
- [ ] `list_logs(level="warn", limit=20)` empty after the final save.
- [ ] Open the app pointing at surreal-bakery and exercise each flow manually:
  - Orders page: right-click an order → "Cancel order" → fill reason → confirm → row's
    `status` flips to `cancelled` in the grid, reason + note land on the row.
  - Products page: toolbar "Add product" → fill the form → "Add" → a new product row
    appears.
  - Products page: right-click a product → Edit → form is prefilled with current values →
    change a field → save → row updates.
  - Products page: right-click a product → Delete → confirm dialog with the product name
    interpolated → Delete → row vanishes.

## Known limitations to be aware of

These are not blockers — flag them in Notes if you bump into them:

1. **`tables.product.create()` uses `.create()`, not `.new()`** — `new` is a reserved
   keyword in Rhai 1.24. (Covered above; mentioned here as the most common typo.)
2. **`row.set(map)` doesn't handle dotted paths** — `row.set(#{ "inventory.stock": 5 })`
   would write a literal key `inventory.stock`, not nested. Stick to flat field names from
   the action's `form.fields` list.
3. **`tables` map only carries the master table** — `tables.product.create()` works on the
   products page; `tables.client.create()` from the products page would throw "table not
   registered in this context". Cross-table inserts are a follow-up.
4. **Toolbar `requires_row` buttons stay disabled** — Add doesn't reference `row` so it
   stays enabled. None of your toolbar entries this cycle need a selected row.
5. **`row.ref("<name>")` is a stub** — throws "not yet wired"; full flat-FK wiring lands
   later. None of your bodies use it.

## Notes

Blockers, guesses, surprises, workarounds, suggestions. Better too much detail.

(Empty until you start.)
