# Contributing upstream

When you hit something Vantage doesn't model yet — a backend feature, a column type, a page element — you can either:

1. **Work around it in YAML** (often `type: any` for unmodelled column shapes, or push the logic backend-side).
2. **Contribute to Vantage itself.**

## When to contribute upstream

If the gap is reusable across projects (a new column type, a new datasource backend, a new page element kind), upstream is the better fix. The Vantage framework lives at:

- Project: <https://github.com/romaninsh/vantage> (core data layer, `vantage-table`, `vantage-dataset`, persistence backends)
- Admin UI: <https://github.com/romaninsh/vantage-ui> (this app — the GPUI shell, catalog, dashboard)

## Rough orientation

- **Datasource kinds** are defined in `vantage-inventory` (the `DatasourceKind` enum). Adding a new backend means: a new variant, a new connector implementation, and (usually) a new sibling crate like `vantage-aws/`.
- **Page element kinds** (`crud`, `tableview`, `card`, …) live in `vantage-inventory::PageConfig` and have matching renderers in the admin app's `pages/` module.
- **Column types** are in `vantage-types` — adding a new one means updating serialisation, the JSON Schema derive, and editors/viewers.

## How to propose a change

1. Open an issue describing the gap and a use case (a YAML snippet that *should* work but doesn't is ideal).
2. Match the existing PR style — small, focused, tested. The repo has a `commit` workflow that's strict about formatting; run `cargo fmt && cargo clippy` before pushing.
3. Reference the issue from your PR.

The maintainer reads PRs that include a clear "before/after" YAML example a lot faster than ones that don't.
