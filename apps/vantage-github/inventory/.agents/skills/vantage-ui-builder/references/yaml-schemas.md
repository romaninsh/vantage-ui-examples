# YAML schemas

Each kind folder ships a `*-schema-1.json` file. These are JSON Schema documents auto-generated from Vantage's Rust types. They are the **authoritative** definition of what's valid — if there's a conflict between this skill and the schema, trust the schema.

## What's in each schema

- `datasource/datasource-schema-1.json` — `type:` enum + per-backend fields (url, region, namespace, …).
- `table/table-schema-1.json` — column shapes, flags, references, expressions, per-backend extras.
- `page/page-schema-1.json` — element kinds (`tableview`, `crud`, `card`, …), spots, args, queries, row actions.
- `menu/menu-schema-1.json` — item shapes (`page:`, `section:`, `divider:`).

## How to use them

1. Editors with a YAML language server (VS Code, Helix, …) honour the `# yaml-language-server: $schema=…` pragma at the top of a YAML file. Add it on every new file:
   ```yaml
   # yaml-language-server: $schema=./table-schema-1.json
   ```
2. As an agent, read the relevant schema before writing a new YAML — it lists every field, its type, and a short description. Pasting a schema chunk into your context window beats guessing.
3. The schema version increments when the underlying Rust types change shape. Vantage cleans up unreferenced older schemas automatically — don't edit them by hand.
