# Smith Requirements — `<feature_key>`

> You are Agent Smith. You edit YAML files in `examples/surreal-bakery/`. Read this top to bottom
> first. Fill in "Notes" as you work.

## What you're building

One paragraph.

## Prerequisites

- [ ] **vantage-ui running** — call `list_logs(level="info", limit=5)` on MCP.
- [ ] **SurrealDB reachable** — `surreal isready --endpoint <url>`.
- [ ] **MCP tools present** — call each new tool once to confirm.

If any fails, stop and write in Notes.

### MCP tools

- `list_logs(level, limit)` — always available
- (Feature-specific, or "none")

## Tasks

After every save, call `list_logs(level="warn", limit=20)`. Fix errors before continuing.

- [ ] **Task 1.** …
- [ ] **Task 2.** …

### Discovering schema

```bash
surreal sql --endpoint ws://localhost:8000 --user root --pass root --ns bakery --db v2 --pretty <<'SQL'
SELECT * FROM <table> LIMIT 3;
SQL
```

Prefer `SELECT * LIMIT 3` over `INFO FOR TABLE`. Don't add `DEFINE FIELD`.

For valid column types and flags, see the generated `table-schema-1.json` in each table folder and
the SurrealDB skill (`.agents/skills/vantage-persistence-surrealdb/SKILL.md`).

## Acceptance criteria

- [ ] All tasks ticked.
- [ ] `list_logs(level="warn", limit=20)` empty.
- [ ] (Feature-specific.)

## Notes

Blockers, guesses, surprises, workarounds, suggestions. Better too much detail.

(Empty until you start.)
