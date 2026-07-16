# page/

One YAML file per UI page. Filename (without `.yaml`) becomes the
page key — menus and row-actions reference it by that key.

## Schema

The current schema is `page-schema-1.json`. New YAML files should
opt into editor validation by starting with:

```yaml
# yaml-language-server: $schema=./page-schema-1.json
```

## Page identity

Pages are uniquely identified at runtime by `(page-key, args)`.
Opening the same page-key with different args yields distinct
open pages.

## Structure

- `title:` — required.
- `template:` (optional) — layout name; default = single-spot `body`.
- `args:` (optional) — typed page parameters; available in Rhai as
  `args.<name>`.
- `queries:` (optional) — sync Rhai expressions evaluated on open.
- `elements:` — list of typed views (`crud`, `grid`, `list`, `logview`, `chart`).

## Example

```yaml
# yaml-language-server: $schema=./page-schema-1.json
title: Clients
elements:
  - kind: crud
    spot: body
    table: client
    row_actions:
      - label: Open
        primary: true
        navigate: client-overview
        args:
          id: row.id
```
