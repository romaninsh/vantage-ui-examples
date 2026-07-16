# view/

One YAML file per custom read-only view. A view is a DOM-like tree of
display widgets bound to a table; it surfaces as a custom tab on a
`binder` page when an element lists it under `views:`. The renderer
walks the tree against the selected record and live-refreshes off
scenery; any node that fails renders an inline error chip rather than
breaking the whole view.

## Schema

The current schema is `view-schema-1.json`. New YAML files should opt
into editor validation by starting with:

```yaml
# yaml-language-server: $schema=./view-schema-1.json
```

## Nodes

`kind:` dispatches each node: `row` / `column` (flex containers),
`label`, `stat`, `badge`, `progress`, `separator`, `countdown`,
`list` (repeats `item:` over a `ref:` relation), and `when` (renders
`children:` only when `condition:` holds). Any node may carry `when:`
to make it conditional. Value fields are Rhai/`${…}` strings evaluated
against the bound record (`${record.<col>}`) or, inside a list item,
each related row (`${row.<col>}`).

## Example

```yaml
# yaml-language-server: $schema=./view-schema-1.json
title: Summary
table: launches
body:
  - kind: label
    text: "${record.name}"
    style: heading
  - kind: progress
    label: Probability
    value: "${record.probability}"
  - kind: list
    ref: launch_crew
    item:
      - kind: label
        text: "${row.astronaut.name}"
```
