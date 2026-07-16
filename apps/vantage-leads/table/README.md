# table/

One YAML file per logical table. Filename (without `.yaml`) becomes
the table key — other inventory files (pages, references) use that
key.

## Schema

The current schema is `table-schema-1.json`. New YAML files should
opt into editor validation by starting with:

```yaml
# yaml-language-server: $schema=./table-schema-1.json
```

## Required fields

- `datasource:` — must match a key in `../datasource/`.
- `columns:` — list of column configs.

## Optional fields

- `table:` — DB-side name override (defaults to the file's key).
- `title:` — human-friendly label for the UI.
- `expressions:` — server-side computed columns (Rhai source).
- Per-column `references:` for cross-table relations.
- Per-column `sqlite:` / `surreal:` / `csv:` extras for
  backend-specific knobs.

## Example

```yaml
# yaml-language-server: $schema=./table-schema-1.json
datasource: local-sqlite
title: Client
columns:
  - name: id
    type: string
    flags: [id]
  - name: name
    type: string
    flags: [mandatory, title, searchable]
  - name: bakery_id
    type: string
    references: bakery
```
