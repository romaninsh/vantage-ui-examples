# Action kinds

Three kinds ship today: `form`, `confirm`, `http_request`. The
discriminator is the `kind:` field at the top of every
`action/<key>.yaml`.

See [actions.md](./actions.md) for the at-a-glance table; this file
shows full YAML for each.

## `kind: form`

Dialog renders editable fields. On confirm, the action returns a
**record** the calling Rhai snippet can read field-by-field
(`r.reason`) or bulk-copy onto a row (`row.set(r)`).

```yaml
# action/cancel-order.yaml
# yaml-language-server: $schema=./action-schema-1.json
key: cancel_order
kind: form
dialog:
  title: "Cancel order"
  description: "Pick a cancellation reason."
  confirm_label: "Cancel order"
  cancel_label:  "Keep order"
  confirm_style: danger
form:
  fields:
    - { name: reason, type: string, label: Reason,
        choices: [customer_request, payment_failed, out_of_stock, other] }
    - { name: note,   type: string, label: Note, required: false, multiline: true }
```

Call site:

```rhai
let r = actions.cancel_order();
row.status              = "cancelled";
row.cancellation_reason = r.reason;
row.cancellation_note   = r.note;
row.save();
```

Field definitions can be **explicit** (above) or **table-derived**
(inherit from a `table/*.yaml`). See
[form-fields.md](./form-fields.md).

## `kind: confirm`

Dialog renders title + description + Yes/No. No form. Returns
**bool** — `true` if the user confirmed, `false` on cancel or
dismiss.

```yaml
# action/delete-product.yaml
key: delete_product
kind: confirm
dialog:
  title: "Delete product?"
  description: "This will permanently delete '${row.name}'. Cannot be undone."
  confirm_label: Delete
  confirm_style: danger
```

Call site:

```rhai
if actions.delete_product(row) { row.delete(); }
```

`${row.x}` interpolation inside title/description is per-invocation
— see [dialog-shape.md](./dialog-shape.md).

## `kind: http_request`

**Different mental model from `form`.** This is the
"review-then-send" shape, not a form. Resolved params render
read-only in the dialog; on confirm an HTTP request fires with those
params interpolated into the body. Returns void; throws on non-2xx.

Authors should **not** attach `form:` or `dialog:` to a
`http_request` action — its UI is fixed (read-only param sheet) and
its inputs come from the Rhai call site, not the user. If you want
the user to fill values in the dialog, use `kind: form` instead and
issue the HTTP call from the row-action body after collecting the
record.

```yaml
# action/send-password-reset.yaml
key: send_password_reset
kind: http_request
description: |
  Emails the customer a new temporary password.
params:
  email:    { type: string, label: Email }
  name:     { type: string, label: "Customer name" }
  password: { type: string, label: "New password" }
http:
  method: POST
  url: "${MAILER_URL}/password-reset"
  headers:
    Authorization: "Bearer ${MAILER_TOKEN}"
    Content-Type: "application/json"
  body:
    to:       email
    name:     name
    password: password
```

Call site:

```rhai
let pwd = generate_password(12);
actions.send_password_reset(row.email, row.name, pwd);
row.password_hash = hash_password(pwd);
row.save();
```

The `body:` map values are Rhai expressions evaluated against the
resolved params — see the existing password-reset notes in
[rhai-row-surface.md](./rhai-row-surface.md) and
[rhai-expressions.md](./rhai-expressions.md).

`${ENV_VAR}` substitution works in `url:` and `headers:` values
(loaded at action-call time, so changes between sessions take
effect).

## Which kind do I want?

- **User picks reason / fills cancellation note / sets price on
  new row** → `kind: form`.
- **User clicks "Delete" on a row, you need confirmation before
  destroying** → `kind: confirm`.
- **Row body computes inputs (e.g. generates a password) and you
  want an admin to review-then-fire a webhook** → `kind: http_request`.
- **Dialog needs to render data that isn't form fields** (a chart, a
  table) → not supported in v1; the closest shape is `kind: confirm`
  with a rich `description:`.

## Failure semantics

| Path | Result |
|---|---|
| Dialog cancelled | `kind: form` throws `"cancelled"` (snippet aborts); `kind: confirm` returns `false` (snippet continues); `kind: http_request` throws `"cancelled"` |
| HTTP non-2xx (`http_request`) | throws `"<status>: <body>"` |
| Network / timeout 30s (`http_request`) | throws |
| `row.save()` fail downstream | throws — admin can re-trigger |

When a snippet throws, no subsequent `row.save()` / `row.delete()`
in the same body runs. Use the throw as a control-flow guard.
