# datasource/

One YAML file per backend connection. Filename (without `.yaml`)
becomes the datasource key — other inventory files reference it by
that key.

## Schema

The current schema is `datasource-schema-1.json`. New YAML files
should opt into editor validation by starting with:

```yaml
# yaml-language-server: $schema=./datasource-schema-1.json
```

## Backends

`type:` selects the backend. Supported values:
`sqlite | postgres | mysql | surreal-db | mongo | csv | api-client`.

Each backend has its own field set; see the schema for details.

## Example

```yaml
# yaml-language-server: $schema=./datasource-schema-1.json
type: sqlite
description: "Local development database."
url: "sqlite:db/local.sqlite"
```
