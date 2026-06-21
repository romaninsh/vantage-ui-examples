# Dialog shape

The `dialog:` block sits next to `form:` / `http:` in every
`action/<key>.yaml`. It controls the dialog's chrome — title, body
description, size, button labels, confirm button styling. All
fields are optional.

```yaml
dialog:
  title:          "Cancel order"
  description:    "Reason will appear in the customer email."
  size:           md            # sm | md | lg
  confirm_label:  "Cancel order"
  cancel_label:   "Keep order"
  confirm_style:  danger        # default | danger
```

| Key | Default | Notes |
|---|---|---|
| `title` | humanised action key | shown in the dialog header |
| `description` | (none) | rendered below the title, above form fields / confirm buttons |
| `size` | `md` | `sm` ≈ 360 px, `md` ≈ 480 px, `lg` ≈ 640 px |
| `confirm_label` | `"OK"` | primary button text |
| `cancel_label` | `"Cancel"` | secondary button text |
| `confirm_style` | `default` | `danger` makes the confirm button red — use for delete / cancel-order / archive |

`description` is plain text; newlines preserved. No Markdown
rendering in v1.

## `${row.x}` interpolation

Both `title` and `description` support `${row.x}` substitution at
**dispatch time** (not catalog load) — the row in scope at the call
site is what fills in.

```yaml
dialog:
  title: "Delete product?"
  description: "This will permanently delete '${row.name}'. Cannot be undone."
```

Rules:

- Dotted paths work: `${row.inventory.stock}`.
- Only `${row.X}` is recognised (no `${args.X}`, no arbitrary Rhai
  in v1).
- A missing field renders the literal placeholder unchanged
  — `${row.unknown}` stays as `${row.unknown}` in the dialog. This
  is deliberate: a typo or unwired row stays visible to the admin
  instead of silently becoming empty.

For actions called from a toolbar (no row in scope),
`${row.x}` placeholders render as literal text. Don't write
`${row.x}` in toolbar-only actions.

## Defaults in practice

You can omit `dialog:` entirely; you'll get an auto-humanised title
("Delete Product"), "OK"/"Cancel" buttons, default colour, medium
size. The bare minimum to override one piece:

```yaml
dialog: { confirm_label: "Add", confirm_style: default }
```

For consistent UX:

- `confirm_style: danger` for any irreversible op (`delete-product`,
  `cancel-order`).
- Match `confirm_label` to the verb the button performs ("Delete",
  "Add", "Cancel order") rather than the default "OK".
- `size: lg` only when the form is genuinely long (8+ fields);
  otherwise `md` is plenty.
