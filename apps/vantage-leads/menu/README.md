# menu/

One YAML file per navigation surface. Common keys: `left.yaml` (the
left sidebar), `top.yaml`, `command.yaml` (future).

## Schema

The current schema is `menu-schema-1.json`. New YAML files should
opt into editor validation by starting with:

```yaml
# yaml-language-server: $schema=./menu-schema-1.json
```

## Item shapes

`MenuItem` is an untagged enum — items are matched by which key they
have:

- `page: <key>` → PageLink (clickable, navigates).
- `section: <label>` + `children:` → labelled group.
- `divider: true` → non-clickable spacer.

## Example

```yaml
# yaml-language-server: $schema=./menu-schema-1.json
title: Vantage
items:
  - page: clients
    label: Clients
    icon: User
  - divider: true
  - section: Catalogue
    children:
      - page: products
        label: Products
        icon: Inbox
```
