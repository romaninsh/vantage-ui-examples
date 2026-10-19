# Identity scenario A: a personal tool

One person, one SQLite file, no sign-in. `application.yaml` declares no
`session:`, so the desktop reads every table and the layout's
`kind: identity` item draws nothing.

## Set up

```sh
./ingress.sh          # makes data/notes.db: 3 notes
```

Open the folder in Vantage UI. The title bar shows the app title and no
identity button; the Notes page lists 3 notes.

## MCP checks

Turn on "Allow MCP agents to read data".

1. `ui_tree {}`
   - there is no `session` key (no `session:`);
   - `shell.title_bar.right` is `[]`: the `identity` item is not listed.
2. `run_data_script { "script": "table(\"note\").count()" }` → `{ "result": 3 }`.
3. `explain_access { "table": "note" }` → `explanation` has
   `"app": "vantage"`, `"applied": []`, `"lifted": []`, `"hooks": []`,
   `"removed_columns": []`, `"refusal": null`: no rule touches the table.
4. `list_logs { "level": "warn" }` shows no `status item failed` line for
   `title_bar.me.text`: without `session:` the item's template isn't evaluated.
