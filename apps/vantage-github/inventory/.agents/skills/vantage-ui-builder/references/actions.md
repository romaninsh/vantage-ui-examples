# Actions reference

Actions are declarative, side-effecting operations invokable from a
row-action or toolbar Rhai body via `actions.<name>(...)`. Each one
lives in `action/<key>.yaml`. The filename stem (with `-` → `_`) is
the Rhai function name.

Actions open a dialog when called. What the dialog *does* depends on
the action's `kind:`.

## The three kinds at a glance

| Kind | Dialog renders | Returns to Rhai | Use when |
|---|---|---|---|
| `form` | Editable form fields (explicit or table-derived) | Record (`r.field`) | User needs to **fill in** values (add row, edit row, cancel-with-reason) |
| `confirm` | Title + description + Yes/No | Bool | User needs to **approve** a destructive op (delete, reset, archive) |
| `http_request` | Read-only summary of resolved params, fires HTTP on confirm | Void (throws on non-2xx) | A row-action body wants a **narrow custom HTTP call** with admin approval (password reset, webhook) |

`http_request` is deliberately not a form. It's the
"review-then-send" shape — params come from the Rhai call site, the
dialog just lets the admin sanity-check before firing. Don't try to
attach `form:` to it.

See [action-kinds.md](./action-kinds.md) for side-by-side YAML.

## Naming conventions

- **Filename** — kebab-case (`cancel-order.yaml`, `add-product.yaml`).
- **Rhai callable** — snake_case (`actions.cancel_order(...)`),
  derived automatically.
- **Action key** — same as the snake_case Rhai name, declared via
  `key:` inside the YAML.

## Where to look next

- [action-kinds.md](./action-kinds.md) — full YAML shape for each
  kind, when to reach for which.
- [form-fields.md](./form-fields.md) — explicit vs table-derived
  fields, shorthand, types, prefill.
- [dialog-shape.md](./dialog-shape.md) — `dialog:` block: title,
  description, size, button labels, `${row.x}` interpolation.
- [toolbar-and-row-actions.md](./toolbar-and-row-actions.md) — where
  actions get placed on a page; `requires_row` disable behaviour.
- [rhai-row-surface.md](./rhai-row-surface.md) — `row.X = v`,
  `row.set`, `row.save`, `row.delete`, `row.ref`.
- [rhai-tables-namespace.md](./rhai-tables-namespace.md) —
  `tables.<name>.create()` for INSERTs.

## Host fns always in scope

Anywhere inside a row-action or toolbar `action:` body:

| Symbol | Purpose |
|---|---|
| `actions.<name>(args...)` | invoke an `action/<name>.yaml` |
| `tables.<name>.create()` | unsaved record bound to a table; `.save()` INSERTs |
| `generate_password(len)` | random no-ambiguous-chars password (len ≥ 4) |
| `hash_password(plaintext)` | argon2id PHC string |
| `notify(msg)` | toast |
| `throw "msg"` | abort the snippet; surfaces as a toast |
