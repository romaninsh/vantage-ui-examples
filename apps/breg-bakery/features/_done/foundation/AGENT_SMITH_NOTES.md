# Smith Notes — `foundation`

Scratchpad.

- **Blockers** — couldn't do, with error and what was tried.
- **Guesses** — judgement calls when docs/schema didn't cover the case.
- **Surprises** — unexpected data shapes, MCP responses.
- **Workarounds** — not recommended as permanent.
- **Suggestions** — for Neo or the workflow.

- **Blockers:** `cbor://` endpoint doesn't work with `surreal` CLI tools (`isready`, `sql`). Use
  `ws://` or `http://` for CLI commands. The datasource YAML still uses `cbor://` (vantage-ui app
  supports it). Also, `surreal sql` CLI syntax is unclear — `-e` flag conflicts with `--endpoint`
  shorthand. Need guidance on correct `surreal sql` invocation.
- **Surprises:** The existing files already had content but were missing key details: `id` columns
  used `flags: [mandatory]` instead of `[id]`, detail pages had "X Detail" titles instead of just
  "X", row actions lacked `primary: true` and `icon: ChevronRight`, menu items had no icons, and all
  three `any` columns hadn't been fixed yet.
- **Suggestions:** Verify with `list_logs` once vantage-ui is running. SurrealDB prerequisites need
  manual verification.
