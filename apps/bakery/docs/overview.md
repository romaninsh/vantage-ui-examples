# Bakery — design notes

This example is intentionally minimal and **offline-clean**: launching it must
produce zero ERROR-level logs, because the shared `startup.feature` asserts
exactly that against every app.

## Why CSV?

The CSV datasource is the only backend that opens **no connection at startup**
— `Backend::connect` simply records the directory path and defers all I/O to
the moment a table is queried. SQLite/Postgres/SurrealDB all attempt to
connect eagerly and log an ERROR (`… connect failed`) if the server/file is
unreachable, which would fail the startup test in CI. So examples that must be
green on every CI run should prefer CSV (or a committed, seeded SQLite file).

## Extending this app

- Add a column to a table → add the matching CSV header in `data/<table>.csv`.
- Add a new table → drop `data/<name>.csv` and `table/<name>.yaml`, then a
  `page/<name>.yaml` and a menu entry.
- Add a bakery-specific scenario → put a `.feature` in `tests/` (reuse the
  framework's steps; see `.rules`).
