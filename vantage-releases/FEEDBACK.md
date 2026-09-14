# Vantage 0.38

- **Auto-refresh should back off on query errors.** With `refresh_interval: 5` and a
  broken query (see the dotted-column `where` below), the same ERROR re-fires every
  5 seconds forever. Once a scenery's query fails, stop re-pulling it until the page
  (or the binding) is reloaded/changed — or at least retry with backoff.

- Filtering a shaped binding on an implicit-reference (dotted) column —
  `scenery("release").where("package.name", "x")` — generates invalid SQL: the
  projection aliases the subquery correctly (`... AS "package.name"`) but the
  WHERE clause uses the unquoted `package.name`, which SQLite reads as
  table `package` column `name` → "no such column". Workaround: filter on the
  FK id column. It would be nice if where() on implicit-reference columns
  either quoted the alias or rewrote to the FK comparison.

- **A select's `${name.value}` semantics change with appearance, silently.** For
  `appearance: dropdown` the value is the picked row's **id** and `params.column`
  only titles the menu; for `appearance: chips` the value is the cell text. I only
  learned this from a sentence buried in the `column:` property description — after
  writing a binding that assumed the name. A `value_column:` (explicit, independent
  of appearance) would remove the trap.

- **Null FK + nested template read throws.** In a record summary view,
  `${record.release.version}` on a row whose `release_id` is NULL fails with
  "unknown property name - a getter is not registered for type ()". The working
  spelling is flat bracket access `record["release.version"]`. Since dotted columns
  are flat keys in the row, nested traversal resolving at all is a coincidence that
  breaks on nulls — nested reads on dotted columns should degrade to empty like the
  other "graceful" helpers (or the docs should state the flat-key spelling).

- **`when:` requires a real boolean, but SQL bools arrive as int/string.**
  `condition: record.bumps_version` (a `bool` column over SQLite) fails with
  "did not evaluate to a boolean". Rhai truthiness or type coercion for bool-ish
  values (1/"true"/true) would save the `== 1 || == "true" || == true` dance; at
  minimum the error could print the actual type it got.

- **Semver-unaware grid sorting.** `default_sort` on a version column is textual:
  `0.9.0` sorts above `0.37.0`. I switched to sorting by `published_at`, which only
  works because releases have timestamps. A version-aware column type (or sort mode)
  would help any release/package-tracking app.

- **No project-wide refresh default.** "Refresh every 5 seconds" had to be set
  per-page via `params.refresh_interval` on every grid/binder. A default in
  `application.yaml` (e.g. `refresh_interval: 5`, overridable per component) would
  match how theme/variables work.

- **Unknown icon names fail the whole menu with an opaque error.** `icon: Boxes` /
  `FolderGit2` (valid Lucide names, not in the bundled ~300) made the entire
  `menu/left.yaml` fail schema validation with a generic anyOf blob quoting the whole
  item. Naming the offending property/value ("icon 'FolderGit2' not in the bundled
  set") would make it a one-second fix; so would shipping the valid list somewhere
  greppable outside the generated schema JSON.

- **Label tags overlap the title cell until widths are hand-tuned.** `flags: [label]`
  pills render inside the title column with no width contribution, so the default
  150px truncates the text under the tag. The grid could reserve tag width (or
  auto-size) for title cells that carry labels.

- **MCP tools time out while the app is busy.** During large imports with the 5s
  refresh running, `list_logs` / `list_models` repeatedly hit "Context server
  request timeout" until the UI went idle. Queueing or prioritizing MCP responses
  would keep the agent feedback loop usable exactly when it's most needed
  (verifying a big write).
