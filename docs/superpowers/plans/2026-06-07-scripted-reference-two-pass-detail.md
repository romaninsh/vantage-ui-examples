# Scripted references feeding a two-pass detail pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drill from a GitHub workflow into its runs so the expensive per-run `stats` call receives the workflow's derived step parameters, computed lazily and carried down via a scripted reference — without freezing the UI.

**Architecture:** Three repos. (A) **vantage** (framework): fix the cmd detail-script-via-Vista bug and add a row-carrying detail path so the detail script can read the cheap list-pass row. (B) **vantage-ui** (consumer): evaluate a reference's `rhai` script in the drill-down using the resolver already there, and gate drill-down on row status + a `guard` expression. (C) **vantage-ui-examples**: wire the gh tables and production-test against `romaninsh/vantage`. vantage-ui builds against local vantage via the existing `[patch.crates-io]`, so framework changes are visible to the consumer.

**Tech Stack:** Rust, Rhai, vantage-cmd / vantage-vista / vantage-diorama / vantage-vista-factory, GPUI (vantage-ui), YAML inventory.

**Spec:** `docs/superpowers/specs/2026-06-07-scripted-reference-two-pass-detail-design.md`

**Commit rules (all three repos):** single-line messages, NO attribution of any kind (a global hook rejects `Co-Authored-By`, "Claude Code", 🤖, AI/Anthropic mentions). Use `git commit -m "<one line>"`. Do NOT push. Tests must not simulate slowness or advance clocks.

**Repo paths:**
- Framework: `/Users/rw/Work/vantage`
- Consumer: `/Users/rw/Work/vantage-ui`
- Example: `/Users/rw/Work/vantage-ui-examples`

---

## Phase A — Framework (vantage): detail script reaches the row

Run all Phase A `cargo` commands from `/Users/rw/Work/vantage`.

### Task A1: Fix `CmdTableShell::get_vista_value` to route through the detail script

Today `get_vista_value` calls `self.table.list_values()` + `shift_remove(id)`, which runs the **list** script and never the **detail** script. So `dio.master().get_value(id)` (the two-pass detail pass) never hydrates via the detail script in the app. Route it through `Table::get_value`, which dispatches to `Cmd::get_table_value` (detail-script aware).

**Files:**
- Modify: `vantage-cmd/src/vista/source.rs:67-74`
- Test: `vantage-cmd/tests/rhai_table.rs` (append)

- [ ] **Step 1: Write the failing test**

Append to `vantage-cmd/tests/rhai_table.rs`. It builds a two-pass cmd Vista and asserts the Vista facade's `get_value` runs the DETAIL script (returns the `detail` column), not the list script.

```rust
#[tokio::test]
async fn vista_get_value_runs_the_detail_script() {
    // Regression: `Vista::get_value(id)` (used by the two-pass detail pass)
    // must route through the cmd DETAIL script, not re-run the list script.
    use vantage_dataset::prelude::ReadableValueSet;
    const LIST: &str = r#"parse_json(run(["list"]).stdout)"#;
    const DETAIL: &str = r#"parse_json(run(["detail", id]).stdout)"#;
    let yaml = r#"
name: items
columns:
  id:
    type: string
    flags: [id, title]
  detail:
    type: string
cmd:
  rhai: |
    parse_json(run(["list"]).stdout)
  detail: |
    parse_json(run(["detail", id]).stdout)
"#;
    let _ = (LIST, DETAIL);
    let cmd = Cmd::new(format!("{}/role.sh", fixtures_dir()));
    let vista = cmd.vista_factory().from_yaml(yaml).unwrap();

    let rec = vista.get_value(&"a".to_string()).await.unwrap().unwrap();
    assert_eq!(
        rec.get("detail"),
        Some(&CborValue::from("full-a")),
        "Vista::get_value must run the detail script"
    );
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cargo test -p vantage-cmd --test rhai_table vista_get_value_runs_the_detail_script`
Expected: FAIL — `detail` is `None` (list script ran, no `detail` column).

- [ ] **Step 3: Implement the fix**

In `vantage-cmd/src/vista/source.rs`, replace the body of `get_vista_value`:

```rust
    async fn get_vista_value(
        &self,
        _vista: &Vista,
        id: &String,
    ) -> Result<Option<Record<CborValue>>> {
        // Route through the typed table so detail-script tables hydrate via
        // the DETAIL script (Cmd::get_table_value), not the list script.
        self.table.get_value(id).await
    }
```

Add the import for `get_value` if needed — `ReadableValueSet` is already imported (`use vantage_dataset::traits::ReadableValueSet;` at the top of the file).

- [ ] **Step 4: Run it to verify it passes**

Run: `cargo test -p vantage-cmd --test rhai_table vista_get_value_runs_the_detail_script`
Expected: PASS.

- [ ] **Step 5: Run the existing cmd tests (no regressions)**

Run: `cargo test -p vantage-cmd`
Expected: all pass (the existing `detail_script_hydrates_a_single_record_by_id` still green).

- [ ] **Step 6: Commit**

```bash
cd /Users/rw/Work/vantage
git add vantage-cmd/src/vista/source.rs vantage-cmd/tests/rhai_table.rs
git commit -m "cmd: Vista::get_value routes through the detail script"
```

---

### Task A2: Extend the role fixture to echo a row-provided value

Feature 2's test needs the detail script to read a field off the injected `row` and surface it. Extend the shared fixture to echo `$3` so a detail script can pass `row.<field>` through.

**Files:**
- Modify: `vantage-cmd/tests/fixtures/role.sh`

- [ ] **Step 1: Edit the fixture**

Replace the `detail)` line so it echoes a third argv element as `echoed`:

```sh
#!/bin/sh
# Test stub for two-role (list + detail) scripts. Same locked command,
# different argv built by each role's script:
#   $1 = "list"                    -> id-only stub rows
#   $1 = "detail", $2 = id, $3 = x -> the full record for that id, echoing x
case "$1" in
  list)   printf '[{"id":"a"},{"id":"b"}]' ;;
  detail) printf '[{"id":"%s","detail":"full-%s","echoed":"%s"}]' "$2" "$2" "$3" ;;
  *)      printf '[]' ;;
esac
```

- [ ] **Step 2: Verify the fixture is still executable and valid**

Run: `cd /Users/rw/Work/vantage && sh vantage-cmd/tests/fixtures/role.sh detail a HELLO`
Expected output: `[{"id":"a","detail":"full-a","echoed":"HELLO"}]`

- [ ] **Step 3: Run existing detail test (unaffected — it passes no `$3`)**

Run: `cargo test -p vantage-cmd --test rhai_table detail_script_hydrates_a_single_record_by_id`
Expected: PASS (the `echoed` field is just an extra column the test ignores).

- [ ] **Step 4: Commit**

```bash
cd /Users/rw/Work/vantage
git add vantage-cmd/tests/fixtures/role.sh
git commit -m "cmd test: role.sh echoes a third argv element"
```

---

### Task A3: Add `row` to `QueryContext` and seed it in the rhai scope

**Files:**
- Modify: `vantage-cmd/src/rhai_engine.rs` (struct `QueryContext` ~lines 22-31; `eval` scope seeding ~lines 124-136)

- [ ] **Step 1: Add the field to `QueryContext`**

In `vantage-cmd/src/rhai_engine.rs`, add a `row` field (import `Record`/`CborValue` if not already in scope — the file already uses cbor for conditions):

```rust
pub(crate) struct QueryContext {
    pub conditions: Vec<CmdCondition>,
    pub columns: Vec<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub id_column: Option<String>,
    /// The target id for a per-row detail fetch, seeded as the `id` scope variable.
    pub id: Option<String>,
    /// The existing (list-pass) record for a detail fetch, seeded as the `row`
    /// scope variable so the detail script can read cheap columns it carries.
    /// Empty for list fetches.
    pub row: ciborium::value::Value,
}
```

Note: store `row` as a CBOR `Value` (a map) so it converts to a rhai map with the same `to_dynamic` helper already used for `columns`. An empty fetch uses `ciborium::value::Value::Map(vec![])`.

- [ ] **Step 2: Seed `row` in the scope inside `eval`**

In `CompiledScript::eval`, after the `id` push, add:

```rust
        scope.push_dynamic("row", to_dynamic(&ctx.row)?);
```

(Place it right after `scope.push_dynamic("id", opt_string(ctx.id));`. `to_dynamic` is the same serde helper already used for `columns`.)

- [ ] **Step 3: Fix the two existing `QueryContext { … }` constructions to set `row`**

`vantage-cmd/src/table_source.rs` builds `QueryContext` in two places. For now set `row: ciborium::value::Value::Map(vec![])` in BOTH (list at ~line 162, detail at ~line 213). Task A4 replaces the detail one.

```rust
        let ctx = QueryContext {
            conditions: conditions.clone(),
            columns,
            limit,
            offset,
            id_column: id_field.clone(),
            id: None,
            row: ciborium::value::Value::Map(vec![]),
        };
```

and in the detail branch:

```rust
            let ctx = QueryContext {
                conditions: Vec::new(),
                columns,
                limit: None,
                offset: None,
                id_column: id_field.clone(),
                id: Some(id.clone()),
                row: ciborium::value::Value::Map(vec![]),
            };
```

- [ ] **Step 4: Build to verify it compiles**

Run: `cargo build -p vantage-cmd`
Expected: compiles (no behavior change yet; `row` is an empty map everywhere).

- [ ] **Step 5: Commit**

```bash
cd /Users/rw/Work/vantage
git add vantage-cmd/src/rhai_engine.rs vantage-cmd/src/table_source.rs
git commit -m "cmd: thread a row map through QueryContext into the rhai scope"
```

---

### Task A4: Add `Cmd::get_table_value_with_row` (detail dispatch with the row injected)

DRY: extract the detail-branch logic into an inherent method that takes the existing row; the trait `get_table_value` delegates to it with an empty row.

**Files:**
- Modify: `vantage-cmd/src/table_source.rs` (the `get_table_value` impl ~lines 197-241; add an inherent `impl Cmd` method)
- Test: `vantage-cmd/tests/rhai_table.rs` (append)

- [ ] **Step 1: Write the failing test**

Append to `vantage-cmd/tests/rhai_table.rs`. The detail script reads `row.extra` and passes it as `$3`; the fixture echoes it back as `echoed`.

```rust
#[tokio::test]
async fn detail_script_reads_the_injected_row() {
    // The detail pass injects the existing (list-pass) row. The detail script
    // reads a field off `row` and passes it through; the fixture echoes it.
    use vantage_types::Record;
    const LIST: &str = r#"parse_json(run(["list"]).stdout)"#;
    const DETAIL: &str = r#"parse_json(run(["detail", id, row.extra]).stdout)"#;
    let cmd = Cmd::new(format!("{}/role.sh", fixtures_dir()))
        .with_table("items", CmdSpec::new(LIST).with_detail(DETAIL));
    let table = Table::<Cmd, EmptyEntity>::new("items", cmd.clone())
        .with_id_column("id")
        .with_column_of::<String>("detail")
        .with_column_of::<String>("echoed");

    let mut row: Record<CborValue> = Record::new();
    row.insert("extra".to_string(), CborValue::from("XYZ"));

    let rec = cmd
        .get_table_value_with_row(&table, &"a".to_string(), &row)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(rec.get("echoed"), Some(&CborValue::from("XYZ")));
    assert_eq!(rec.get("detail"), Some(&CborValue::from("full-a")));
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cargo test -p vantage-cmd --test rhai_table detail_script_reads_the_injected_row`
Expected: FAIL — `get_table_value_with_row` does not exist (compile error).

- [ ] **Step 3: Implement the inherent method and delegate the trait method to it**

In `vantage-cmd/src/table_source.rs`, add an inherent impl (near the top of the file, after imports). It contains the detail-branch logic, taking `row: &Record<CborValue>` and converting it to a CBOR map for the context:

```rust
impl Cmd {
    /// Detail-script hydration for one id, with the existing list-pass `row`
    /// injected into the script scope. Falls back to the normal id-only path
    /// when the table has no detail script.
    pub async fn get_table_value_with_row<E>(
        &self,
        table: &Table<Self, E>,
        id: &String,
        row: &Record<CborValue>,
    ) -> Result<Option<Record<CborValue>>>
    where
        E: Entity<CborValue>,
    {
        let table_name = table.table_name().to_string();
        if !self.has_detail_script(&table_name) {
            let mut all = self.list_table_values(table).await?;
            return Ok(all.shift_remove(id));
        }
        let id_field = table.id_field().map(|c| c.name().to_string());
        let columns: Vec<String> = table.columns().keys().cloned().collect();
        let row_map = ciborium::value::Value::Map(
            row.iter()
                .map(|(k, v)| (ciborium::value::Value::Text(k.clone()), v.clone()))
                .collect(),
        );
        let ctx = QueryContext {
            conditions: Vec::new(),
            columns,
            limit: None,
            offset: None,
            id_column: id_field.clone(),
            id: Some(id.clone()),
            row: row_map,
        };
        let cmd = self.clone();
        let name = table_name.clone();
        let rows: Vec<serde_json::Value> = tokio::task::spawn_blocking(move || {
            let compiled = cmd
                .compiled_detail_script(&name)?
                .ok_or_else(|| error!("detail script vanished"))?;
            compiled.eval(ctx)
        })
        .await
        .map_err(|e| error!("command task failed to join", detail = e.to_string()))??;

        let mut records = rows_to_records(rows, id_field.as_deref());
        Ok(records
            .shift_remove(id)
            .or_else(|| records.into_iter().next().map(|(_, r)| r)))
    }
}
```

Match the exact `use` names already in the file: `JsonValue` is likely the alias for `serde_json::Value` (use whatever alias the file already uses), `error!`, `rows_to_records`, `QueryContext`, `Entity`, `Record`, `Table`, `CborValue`.

Then change the trait method `get_table_value`'s detail branch to delegate. Replace the whole `if self.has_detail_script(&table_name) { … }` block plus the trailing list fallback with:

```rust
        let empty: Record<CborValue> = Record::new();
        self.get_table_value_with_row(table, id, &empty).await
```

(The inherent method already handles both the detail and no-detail cases, so the trait method becomes a thin delegator.)

- [ ] **Step 4: Run the new test + existing detail test**

Run: `cargo test -p vantage-cmd --test rhai_table detail_script`
Expected: both `detail_script_reads_the_injected_row` and `detail_script_hydrates_a_single_record_by_id` PASS.

- [ ] **Step 5: Run the full cmd suite**

Run: `cargo test -p vantage-cmd`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/rw/Work/vantage
git add vantage-cmd/src/table_source.rs vantage-cmd/tests/rhai_table.rs
git commit -m "cmd: get_table_value_with_row injects the row into the detail scope"
```

---

### Task A5: Add the `get_value_with_row` Vista facade + default `TableShell` method

**Files:**
- Modify: `vantage-vista/src/source.rs` (trait `TableShell`, add a defaulted method near `get_vista_value` ~line 54)
- Modify: `vantage-vista/src/vista.rs` (facade, add `get_value_with_row` near `get_value` usage)
- Test: `vantage-vista` inline unit test (add a `#[cfg(test)]` mod or extend an existing one in `vista.rs`)

- [ ] **Step 1: Write the failing test**

The default `get_vista_value_with_row` must ignore `row` and behave exactly like `get_vista_value`. Test with a tiny in-memory `TableShell` that does NOT override the new method. Add to the bottom of `vantage-vista/src/source.rs` inside a `#[cfg(test)] mod tests`:

```rust
#[cfg(test)]
mod with_row_default_tests {
    use super::*;
    use ciborium::Value as CborValue;
    use indexmap::IndexMap;
    use vantage_types::Record;

    struct OneRow;

    #[async_trait::async_trait]
    impl TableShell for OneRow {
        fn columns(&self) -> &IndexMap<String, crate::Column> {
            static EMPTY: std::sync::OnceLock<IndexMap<String, crate::Column>> =
                std::sync::OnceLock::new();
            EMPTY.get_or_init(IndexMap::new)
        }
        fn references(&self) -> &IndexMap<String, crate::Reference> {
            static EMPTY: std::sync::OnceLock<IndexMap<String, crate::Reference>> =
                std::sync::OnceLock::new();
            EMPTY.get_or_init(IndexMap::new)
        }
        fn id_column(&self) -> Option<&str> { Some("id") }
        async fn list_vista_values(&self, _v: &Vista)
            -> Result<IndexMap<String, Record<CborValue>>> { Ok(IndexMap::new()) }
        async fn get_vista_value(&self, _v: &Vista, id: &String)
            -> Result<Option<Record<CborValue>>> {
            let mut r = Record::new();
            r.insert("id".into(), CborValue::from(id.clone()));
            Ok(Some(r))
        }
        async fn get_vista_some_value(&self, _v: &Vista)
            -> Result<Option<(String, Record<CborValue>)>> { Ok(None) }
        async fn get_vista_count(&self, _v: &Vista) -> Result<i64> { Ok(0) }
        fn add_eq_condition(&mut self, _f: &str, _v: &CborValue) -> Result<()> { Ok(()) }
        fn get_ref(&self, _r: &str, _row: &Record<CborValue>) -> Result<Vista> {
            Err(error!("no refs"))
        }
        fn get_ref_kinds(&self) -> Vec<(String, crate::ReferenceKind)> { vec![] }
        fn capabilities(&self) -> &VistaCapabilities {
            static CAPS: std::sync::OnceLock<VistaCapabilities> = std::sync::OnceLock::new();
            CAPS.get_or_init(VistaCapabilities::default)
        }
        fn driver_name(&self) -> &'static str { "test" }
    }

    #[tokio::test]
    async fn default_with_row_ignores_row_and_delegates() {
        let vista = Vista::new("t", Box::new(OneRow));
        let mut row: Record<CborValue> = Record::new();
        row.insert("extra".into(), CborValue::from("ignored"));
        let got = vista
            .get_value_with_row(&"x".to_string(), &row)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(got.get("id"), Some(&CborValue::from("x")));
    }
}
```

Adjust the trait method list above to match the REAL `TableShell` required methods (the test struct must implement every non-defaulted method — copy the set from the current trait; any methods that already have defaults can be omitted). If the trait has more required methods than shown, add trivial impls.

- [ ] **Step 2: Run it to verify it fails**

Run: `cargo test -p vantage-vista with_row_default`
Expected: FAIL — `get_value_with_row` and `get_vista_value_with_row` don't exist (compile error).

- [ ] **Step 3: Add the defaulted trait method**

In `vantage-vista/src/source.rs`, inside `trait TableShell`, right after `get_vista_value`:

```rust
    /// Fetch one record by id, with the caller's existing (cheap) record
    /// available to drivers that can use it (e.g. a cmd detail script reading
    /// list-pass columns). The default ignores `row` and delegates to
    /// [`get_vista_value`](Self::get_vista_value); only drivers that benefit
    /// override it.
    async fn get_vista_value_with_row(
        &self,
        vista: &Vista,
        id: &String,
        _row: &Record<CborValue>,
    ) -> Result<Option<Record<CborValue>>> {
        self.get_vista_value(vista, id).await
    }
```

- [ ] **Step 4: Add the Vista facade method**

In `vantage-vista/src/vista.rs`, near the other read methods (the facade's `get_count` at ~line 169 is a model), add:

```rust
    /// Fetch one record by id, passing the caller's existing record down to the
    /// driver. Pairs with the two-pass detail pass, which holds the cheap
    /// list-pass row and lets the detail script read its columns.
    pub async fn get_value_with_row(
        &self,
        id: &String,
        row: &Record<CborValue>,
    ) -> Result<Option<Record<CborValue>>> {
        self.source.get_vista_value_with_row(self, id, row).await
    }
```

Ensure `Record` and `CborValue` are imported in `vista.rs` (they are — used throughout).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cargo test -p vantage-vista with_row_default`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/rw/Work/vantage
git add vantage-vista/src/source.rs vantage-vista/src/vista.rs
git commit -m "vista: get_value_with_row facade + defaulted TableShell method"
```

---

### Task A6: Override `get_vista_value_with_row` in the cmd driver

**Files:**
- Modify: `vantage-cmd/src/vista/source.rs` (add the override to the `impl TableShell for CmdTableShell`)
- Test: `vantage-cmd/tests/rhai_table.rs` (append)

- [ ] **Step 1: Write the failing test**

Append to `vantage-cmd/tests/rhai_table.rs`. Drives the row through the Vista facade (the path the lens uses).

```rust
#[tokio::test]
async fn vista_get_value_with_row_feeds_the_detail_script() {
    use vantage_dataset::prelude::ReadableValueSet;
    use vantage_types::Record;
    let _ = ReadableValueSet::get_value; // keep import used
    let yaml = r#"
name: items
columns:
  id:
    type: string
    flags: [id, title]
  detail:
    type: string
  echoed:
    type: string
cmd:
  rhai: |
    parse_json(run(["list"]).stdout)
  detail: |
    parse_json(run(["detail", id, row.extra]).stdout)
"#;
    let cmd = Cmd::new(format!("{}/role.sh", fixtures_dir()));
    let vista = cmd.vista_factory().from_yaml(yaml).unwrap();

    let mut row: Record<CborValue> = Record::new();
    row.insert("extra".to_string(), CborValue::from("PQR"));

    let rec = vista
        .get_value_with_row(&"a".to_string(), &row)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(rec.get("echoed"), Some(&CborValue::from("PQR")));
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cargo test -p vantage-cmd --test rhai_table vista_get_value_with_row_feeds_the_detail_script`
Expected: FAIL — the default `get_vista_value_with_row` ignores `row`, so `echoed` is empty (the fixture prints `"echoed":""`), not `"PQR"`.

- [ ] **Step 3: Implement the override**

In `vantage-cmd/src/vista/source.rs`, add to `impl TableShell for CmdTableShell` (after `get_vista_value`):

```rust
    async fn get_vista_value_with_row(
        &self,
        _vista: &Vista,
        id: &String,
        row: &Record<CborValue>,
    ) -> Result<Option<Record<CborValue>>> {
        self.table
            .data_source()
            .get_table_value_with_row(&self.table, id, row)
            .await
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test -p vantage-cmd --test rhai_table vista_get_value_with_row_feeds_the_detail_script`
Expected: PASS.

- [ ] **Step 5: Run full cmd suite**

Run: `cargo test -p vantage-cmd`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/rw/Work/vantage
git add vantage-cmd/src/vista/source.rs vantage-cmd/tests/rhai_table.rs
git commit -m "cmd: override get_vista_value_with_row to feed the detail script"
```

---

### Task A7: Two-pass lens forwards the cached row to the detail pass

This lives in **vantage-ui** but is the consumer of A5/A6, so it's grouped with Phase A's verification. Run from `/Users/rw/Work/vantage-ui`.

**Files:**
- Modify: `vantage-ui/crates/backend/src/lens.rs` (`build_two_pass_lens`, `on_load_detail` ~lines 128-136)

- [ ] **Step 1: Change `on_load_detail` to read the cached row and pass it down**

Replace the `.on_load_detail(...)` block in `build_two_pass_lens`:

```rust
        .on_load_detail(|dio, id| {
            let dio = dio.clone();
            async move {
                // Hand the detail pass the cheap list-pass row so the detail
                // script can read columns it carries (painted from conditions).
                let existing = dio.cache().get_value(&id).await?.unwrap_or_default();
                dio.master()
                    .get_value_with_row(&id, &existing)
                    .await?
                    .ok_or_else(|| {
                        vantage_core::VantageError::other(format!("detail row {id} not found"))
                    })
            }
        })
```

`dio.cache()` is `&Arc<dyn CacheTable>` which impls `get_value`; `Record::default()` is the empty fallback. Keep the existing `use vantage_dataset::traits::ReadableValueSet;` import (already present).

- [ ] **Step 2: Build to verify it compiles**

Run: `cargo build -p vantage-backend`
Expected: compiles (resolves `get_value_with_row` from the patched local vantage-vista).

- [ ] **Step 3: Commit**

```bash
cd /Users/rw/Work/vantage-ui
git add crates/backend/src/lens.rs
git commit -m "backend: two-pass detail pass forwards the cached row"
```

---

## Phase B — Consumer (vantage-ui): scripted reference drill-down + gating

Run all Phase B `cargo` commands from `/Users/rw/Work/vantage-ui`.

### Task B1: Add `rhai` and `guard` to `UiRelation`; thread them in `derive_relations`

**Files:**
- Modify: `vantage-ui/crates/backend/src/connect.rs` (`UiRelation` struct ~lines 84-109)
- Modify: `vantage-ui/crates/backend/src/connect/relations.rs` (`derive_relations` ~lines 39-143)
- Modify: `vantage-ui/crates/inventory/src/table.rs` (`ReferenceFull` ~lines 174-214: add `guard`)
- Test: `vantage-ui/crates/backend/src/connect/relations.rs` (`#[cfg(test)]` at bottom)

- [ ] **Step 1: Add `guard` to `ReferenceFull`**

In `vantage-ui/crates/inventory/src/table.rs`, after the `rhai` field of `ReferenceFull`:

```rust
    /// Optional Rhai bool guard gating drill-down on this reference. Evaluated
    /// against the parent `row`; when false (or on error) the relation's
    /// "Open …" menu item is hidden. Combined with a row-status check so a
    /// two-pass row is only drillable once enriched.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guard: Option<String>,
```

- [ ] **Step 2: Add `rhai` and `guard` to `UiRelation`**

In `vantage-ui/crates/backend/src/connect.rs`, append to `UiRelation`:

```rust
    /// Rhai script that builds this reference's target by adding conditions
    /// read from the parent row (in place of foreign-key narrowing).
    pub rhai: Option<String>,
    /// Rhai bool guard gating drill-down (combined with a row-status check).
    pub guard: Option<String>,
```

- [ ] **Step 3: Write the failing test**

Add at the bottom of `vantage-ui/crates/backend/src/connect/relations.rs`:

```rust
#[cfg(test)]
mod scripted_ref_tests {
    use super::*;

    #[test]
    fn derive_relations_threads_rhai_and_guard() {
        let yaml = r#"
name: parent
datasource: ds
columns:
  id:
    type: string
    flags: [id]
references:
  runs:
    table: child
    kind: has_many
    rhai: |
      table("child").add_condition_eq("pid", row.id)
    guard: |
      row.ok != ""
"#;
        let config: vantage_inventory::table::TableConfig =
            serde_yaml::from_str(yaml).unwrap();
        let mut configs = std::collections::HashMap::new();
        configs.insert(
            "child".to_string(),
            serde_yaml::from_str::<vantage_inventory::table::TableConfig>(
                "name: child\ndatasource: ds\ncolumns:\n  id:\n    type: string\n    flags: [id]\n",
            )
            .unwrap(),
        );
        let rels = derive_relations(&config, &configs);
        let runs = rels.iter().find(|r| r.name == "runs").expect("runs relation");
        assert!(runs.rhai.as_deref().unwrap().contains("add_condition_eq"));
        assert!(runs.guard.as_deref().unwrap().contains("row.ok"));
    }
}
```

(Adjust the `TableConfig` import path / loader call to whatever the crate already uses — check the top of `relations.rs` for how `TableConfig` is referenced; mirror an existing test in the `backend` crate if one parses YAML.)

- [ ] **Step 4: Run it to verify it fails**

Run: `cargo test -p vantage-backend derive_relations_threads_rhai_and_guard`
Expected: FAIL — `UiRelation` has no `rhai`/`guard` populated (fields exist but `derive_relations` leaves them defaulted/missing → currently a compile error because the struct literals don't set them).

- [ ] **Step 5: Populate `rhai`/`guard` in every `UiRelation { … }` constructor in `derive_relations`**

`derive_relations` builds `UiRelation` in several arms (column sugar, column full HasOne, column full HasMany, legacy `has_many`, top-level `references`). Set the new fields in each:

- Column **sugar** arm, legacy **has_many** arm, and any arm sourced from a definition WITHOUT a `rhai`/`guard` field: add `rhai: None, guard: None,`.
- Column full-form arms (`ReferenceDef::Full(r)`): add `rhai: r.rhai.clone(), guard: r.guard.clone(),`.
- Top-level `references` arm (`for (rel_name, rf) in &config.references`): add `rhai: rf.rhai.clone(), guard: rf.guard.clone(),`.

(Every `UiRelation { … }` literal must now set both fields or it won't compile — that compile error is your checklist of sites.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `cargo test -p vantage-backend derive_relations_threads_rhai_and_guard`
Expected: PASS.

- [ ] **Step 7: Build the workspace**

Run: `cargo build -p vantage-backend -p vantage-inventory`
Expected: compiles.

- [ ] **Step 8: Commit**

```bash
cd /Users/rw/Work/vantage-ui
git add crates/backend/src/connect.rs crates/backend/src/connect/relations.rs crates/inventory/src/table.rs
git commit -m "backend: thread reference rhai + guard into UiRelation"
```

---

### Task B2: Evaluate the reference script in `open_detail`

When the relation carries `rhai`, build the narrowed target by running `eval_ref_script` with the resolver that's already in `open_detail`; otherwise keep the FK `catalog.traverse` path.

**Files:**
- Modify: `vantage-ui/crates/backend/src/connect/entity.rs` (`open_detail` ~lines 314-323)
- Test: a focused unit test for the eval helper (extract it so it is testable)

- [ ] **Step 1: Extract a testable helper**

Add to `vantage-ui/crates/backend/src/connect/relations.rs` (it already owns relation→factory mapping):

```rust
/// Build a reference's target Vista by running its Rhai `build_script` with the
/// parent `row` in scope. `resolver` turns a `table("name")` call inside the
/// script into a freshly-loaded target Vista.
pub(super) fn narrow_via_script(
    script: &str,
    parent_row: &vantage_types::Record<ciborium::Value>,
    resolver: vantage_vista::TargetResolver,
) -> vantage_core::Result<vantage_vista::Vista> {
    let mut engine = rhai::Engine::new();
    vantage_vista::register_conventional_onto(&mut engine, resolver);
    vantage_vista::eval_ref_script(&engine, script, parent_row)
}
```

- [ ] **Step 2: Write the failing test**

Add to the `scripted_ref_tests` mod in `relations.rs`. Use a CSV-backed target Vista (vantage-csv is a workspace dep) so the script's `add_condition_eq` is observable by listing. Build a 2-row CSV, narrow by a parent-row field, assert only the matching row survives.

```rust
    #[tokio::test]
    async fn narrow_via_script_applies_conditions_from_the_row() {
        use ciborium::Value as CborValue;
        use std::sync::Arc;
        use vantage_dataset::prelude::ReadableValueSet;
        use vantage_types::Record;

        // A CSV target with two rows; the script narrows to pid == row.id.
        let csv = "pid,note\n7,seven\n9,nine\n";
        let dir = std::env::temp_dir().join("vantage_narrow_test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("child.csv");
        std::fs::write(&path, csv).unwrap();

        let path_for_resolver = path.clone();
        let resolver: vantage_vista::TargetResolver = Arc::new(move |_name| {
            // Build a fresh CSV vista each call.
            vantage_csv::CsvVistaFactory::new()
                .from_path("child", &path_for_resolver, &["pid", "note"])
        });

        let mut parent: Record<CborValue> = Record::new();
        parent.insert("id".to_string(), CborValue::from("7"));

        let script = r#"table("child").add_condition_eq("pid", row.id)"#;
        let vista = narrow_via_script(script, &parent, resolver).unwrap();
        let rows = vista.list_values().await.unwrap();
        assert_eq!(rows.len(), 1, "script should narrow to one row");
        assert!(rows.values().next().unwrap().get("note").is_some());
    }
```

NOTE: the exact `vantage_csv` constructor differs — before writing this test, check `vantage-csv`'s public API (`CsvVistaFactory` / `from_path` / `from_yaml`) and adjust the resolver body to build a CSV Vista from the temp file with columns `pid,note`. The assertion (one row after narrowing) is the contract; the construction mirrors however vantage-csv builds a Vista elsewhere in vantage-ui (search the repo for `vantage_csv` usage).

- [ ] **Step 3: Run it to verify it fails**

Run: `cargo test -p vantage-backend narrow_via_script_applies_conditions_from_the_row`
Expected: FAIL — `narrow_via_script` not found, then (once added) the test exercises it.

- [ ] **Step 4: Make the test pass**

The helper from Step 1 should make it pass once the CSV construction is correct. Iterate the resolver body until green.

- [ ] **Step 5: Wire the helper into `open_detail`**

In `vantage-ui/crates/backend/src/connect/entity.rs`, replace the `narrowed_attempt` block so a scripted relation takes the script path:

```rust
        let narrowed_attempt = if let Some(script) = relation.rhai.clone() {
            let rc = resolver_ctx.clone();
            let resolver: vantage_vista::TargetResolver =
                std::sync::Arc::new(move |name: &str| {
                    rc.load_target_vista(name)
                });
            crate::connect::relations::narrow_via_script(&script, parent_row, resolver)
        } else {
            let mut catalog = VistaCatalog::new();
            let rc = resolver_ctx.clone();
            let target_for_loader = relation.target_table_key.clone();
            catalog.register(
                relation.target_table_key.clone(),
                Arc::new(move || rc.load_target_vista(&target_for_loader)),
            );
            catalog.traverse(&to_factory_relation(relation), parent_row)
        };
```

Confirm `ResolverContext::load_target_vista(&self, name: &str) -> Result<Vista>` is the exact signature (the existing closure uses it); adapt the resolver closure's error/Option handling to match (if it returns `Result<Vista>`, the resolver fn type wants `Result<Vista>` — `register_conventional_onto`'s `TargetResolver` is `Arc<dyn Fn(&str) -> Result<Vista>>`, so they match directly).

- [ ] **Step 6: Build**

Run: `cargo build -p vantage-backend`
Expected: compiles.

- [ ] **Step 7: Run the backend tests**

Run: `cargo test -p vantage-backend`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/rw/Work/vantage-ui
git add crates/backend/src/connect/entity.rs crates/backend/src/connect/relations.rs
git commit -m "backend: evaluate reference rhai in open_detail drill-down"
```

---

### Task B3: Gate the relation menu item on row status + guard

**Files:**
- Modify: `vantage-ui/crates/components/src/grid_dio.rs` (`RelationItem` ~lines 66-74; `context_menu` ~lines 599-628)
- Modify: the page builder that constructs `RelationItem`s from `EntityBackend.relations` (search `RelationItem {` and `with_relations` in `crates/app`)
- Test: a unit test for the gate predicate (pure function over `RowStatus` + guard result)

- [ ] **Step 1: Add a gate function to grid_dio and a field on `RelationItem`**

In `vantage-ui/crates/components/src/grid_dio.rs`, define the gate type and a pure helper, and add the field:

```rust
/// Decides whether a relation's drill-down menu item is shown for a given row.
/// Receives the row's `EnrichedRecord`; returns true to show the item.
pub type RelationGateFn =
    std::sync::Arc<dyn Fn(&vantage_diorama::EnrichedRecord) -> bool + Send + Sync + 'static>;

pub struct RelationItem {
    pub name: String,
    pub target_model: String,
    /// When set, the "Open <name>" item is shown only if this returns true.
    pub gate: Option<RelationGateFn>,
}
```

(Find the exact import path for `EnrichedRecord`/`RowStatus` — it is re-exported from `vantage_diorama`; check existing `use` lines in grid_dio.rs which already reference scenery row types.)

- [ ] **Step 2: Write the failing test**

Add a `#[cfg(test)]` test in `grid_dio.rs` for the gate composition helper (Step 4 introduces `gate_for`):

```rust
#[cfg(test)]
mod relation_gate_tests {
    use super::*;
    use ciborium::Value as CborValue;
    use vantage_diorama::{EnrichedRecord, RowStatus};
    use vantage_types::Record;

    fn rec(status: RowStatus, compile: &str) -> EnrichedRecord {
        let mut r: Record<CborValue> = Record::new();
        r.insert("compile_steps".into(), CborValue::from(compile.to_string()));
        EnrichedRecord { record: r, status, dirty_fields: None, fetched_at: None }
    }

    #[test]
    fn guarded_relation_requires_fresh_and_guard_true() {
        let gate = gate_for(
            Some("row.compile_steps != \"\"".to_string()),
            vec!["compile_steps".to_string()],
        )
        .expect("guarded relations produce a gate");

        // Incomplete → hidden even when the guard would pass.
        assert!(!gate(&rec(RowStatus::Incomplete, "4,8")));
        // Fresh + guard false → hidden.
        assert!(!gate(&rec(RowStatus::Fresh, "")));
        // Fresh + guard true → shown.
        assert!(gate(&rec(RowStatus::Fresh, "4,8")));
    }

    #[test]
    fn unguarded_relation_has_no_gate() {
        assert!(gate_for(None, vec![]).is_none());
    }
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cargo test -p vantage-ui-components relation_gate`
Expected: FAIL — `gate_for` not found.

(Use the real crate name for `crates/components`; check its `[package] name` in `crates/components/Cargo.toml`.)

- [ ] **Step 4: Implement `gate_for`**

In `grid_dio.rs`:

```rust
/// Build the optional drill-down gate for a relation. Returns `None` when there
/// is no guard (item always shown). When a guard exists, the item shows only
/// for a `Fresh` row whose guard expression evaluates true.
pub fn gate_for(guard: Option<String>, columns: Vec<String>) -> Option<RelationGateFn> {
    let guard = guard?;
    Some(std::sync::Arc::new(move |rec: &vantage_diorama::EnrichedRecord| {
        if !matches!(rec.status, vantage_diorama::RowStatus::Fresh) {
            return false;
        }
        let original: indexmap::IndexMap<String, ciborium::Value> = rec
            .record
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        let panic_save: vantage_actions::SaveFn =
            std::sync::Arc::new(|_, _| Err("guards don't write".into()));
        let row = vantage_actions::RowHandle::new(String::new(), original, panic_save);
        match vantage_actions::evaluate_predicate(&guard, row, &columns) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(target: "vantage_ui_components::grid_dio",
                    error = %e, "relation guard eval failed — hiding item");
                false
            }
        }
    }))
}
```

Add `vantage-actions` to `crates/components/Cargo.toml` `[dependencies]` if not present (it provides `evaluate_predicate`, `RowHandle`, `SaveFn`). Mirror how `crates/app/src/screen/pages/actions.rs` already calls these.

- [ ] **Step 5: Run the gate test to verify it passes**

Run: `cargo test -p vantage-ui-components relation_gate`
Expected: PASS.

- [ ] **Step 6: Apply the gate in `context_menu`**

In `context_menu` (grid_dio.rs ~lines 599-628), wrap the per-relation menu item addition:

```rust
        for rel in &self.relations {
            if let Some(gate) = rel.gate.as_ref() {
                let shown = row.as_ref().map(|r| gate(r)).unwrap_or(false);
                if !shown {
                    continue;
                }
            }
            // ... existing menu.item(...) construction unchanged ...
        }
```

- [ ] **Step 7: Construct `RelationItem.gate` in the page builder**

Find where `RelationItem { name, target_model }` is built from `EntityBackend.relations` (search `crates/app` for `RelationItem`). Set `gate: vantage_ui_components::grid_dio::gate_for(rel.guard.clone(), column_names.clone())`, where `column_names` is the entity's column-name list (the same list `actions.rs` passes to `evaluate_predicate`).

- [ ] **Step 8: Build the app**

Run: `cargo build -p vantage-ui` (or the app crate name from `crates/app/Cargo.toml`)
Expected: compiles.

- [ ] **Step 9: Commit**

```bash
cd /Users/rw/Work/vantage-ui
git add crates/components/src/grid_dio.rs crates/components/Cargo.toml crates/app
git commit -m "ui: gate relation drill-down on row status + rhai guard"
```

---

### Task B4: Whole-workspace check (vantage-ui)

- [ ] **Step 1: Build everything**

Run: `cd /Users/rw/Work/vantage-ui && cargo build`
Expected: clean build against patched local vantage.

- [ ] **Step 2: Run the backend + components test suites**

Run: `cargo test -p vantage-backend -p vantage-ui-components`
Expected: all pass.

- [ ] **Step 3: No commit unless fixes were needed** (commit any fixups with a single-line message).

---

## Phase C — Example wiring + production test (vantage-ui-examples)

Run from `/Users/rw/Work/vantage-ui-examples/apps/vantage-github/inventory`.

### Task C1: Point `gh-stats` at the real script; drop dead datasources

**Files:**
- Modify: `apps/vantage-github/inventory/datasource/gh-stats.yaml`
- Remove (if unused after rewiring): `datasource/gh.yaml`, `scripts/gh-stats.py`

- [ ] **Step 1: Repoint the datasource**

Set `gh-stats.yaml`'s command to `./scripts/gh-rust-caching-stats` (keep `type: cmd`). Confirm by reading the file first.

- [ ] **Step 2: Sanity-run the script standalone**

Run: `cd /Users/rw/Work/vantage-ui-examples/apps/vantage-github/inventory && ./scripts/gh-rust-caching-stats workflows romaninsh/vantage | head -c 400`
Expected: JSON array of `{id,name,state}` workflow objects.

- [ ] **Step 3: Commit (datasource only; remove dead files after C2/C3 confirm they're unreferenced)**

```bash
cd /Users/rw/Work/vantage-ui-examples
git add apps/vantage-github/inventory/datasource/gh-stats.yaml
git commit -m "gh: point gh-stats datasource at gh-rust-caching-stats"
```

---

### Task C2: `gh-workflows` becomes two-pass with `analyze` as detail

**Files:**
- Modify: `apps/vantage-github/inventory/table/gh-workflows.yaml`

- [ ] **Step 1: Read the current file** to preserve column flags/keys.

- [ ] **Step 2: Rewrite to two-pass on `gh-stats`** with these elements:
  - `datasource: gh-stats`
  - columns: `id` (id/title), `name` (searchable), `state`, plus `total_crates` (int), and hidden carry columns are NOT needed here (they live on the runs table).
  - `cmd.rhai` (list): `parse_jsonl`/`parse_json` of `run(["workflows", "romaninsh/vantage"])` → `{id,name,state}`.
  - `cmd.detail`: run `analyze <id> romaninsh/vantage`, then build a row whose `cache_restore_steps` and `compile_steps` are CSV strings joined from the analyze arrays, plus `total_crates`. Example detail rhai:

    ```rhai
    let a = parse_json(run(["analyze", id, "romaninsh/vantage"]).stdout);
    let crs = "";
    for s in a.cache_restore_steps { if crs != "" { crs += "," } crs += s.to_string(); }
    let cs = "";
    for s in a.compilation_steps { if cs != "" { cs += "," } cs += s.to_string(); }
    [#{ "id": id, "cache_restore_steps": crs, "compile_steps": cs, "total_crates": a.total_crates }]
    ```

    (Adjust field names to the script's actual `analyze` JSON keys — verify by running `./scripts/gh-rust-caching-stats analyze <id> romaninsh/vantage`.)
  - reference `runs` (full form) with `rhai` and `guard`:

    ```yaml
    references:
      runs:
        table: gh-workflow-runs
        kind: has_many
        rhai: |
          table("gh-workflow-runs")
              .add_condition_eq("workflow_id", row.id)
              .add_condition_eq("cache_restore_steps", row.cache_restore_steps)
              .add_condition_eq("compile_steps", row.compile_steps)
              .add_condition_eq("total_crates", row.total_crates)
        guard: |
          row.compile_steps != ""
    ```

- [ ] **Step 3: Validate the analyze JSON keys**

Run: `cd /Users/rw/Work/vantage-ui-examples/apps/vantage-github/inventory && ./scripts/gh-rust-caching-stats analyze 263031621 romaninsh/vantage`
Expected: JSON with the step arrays + crate count; confirm the exact key names used in the detail rhai.

- [ ] **Step 4: Commit**

```bash
cd /Users/rw/Work/vantage-ui-examples
git add apps/vantage-github/inventory/table/gh-workflows.yaml
git commit -m "gh: gh-workflows two-pass with analyze as detail + scripted runs ref"
```

---

### Task C3: `gh-workflow-runs` carries painted step columns; `stats` reads the row

**Files:**
- Modify: `apps/vantage-github/inventory/table/gh-workflow-runs.yaml`

- [ ] **Step 1: Read the current file.**

- [ ] **Step 2: Add hidden carry columns and wire list/detail:**
  - columns: existing run columns + hidden `cache_restore_steps`, `compile_steps`, `total_crates` (string/string/int, `flags: [hidden]`).
  - `cmd.rhai` (list): read `workflow_id` from `conditions` for the `runs` call, and **paint** the three carry columns from `conditions` onto each emitted row:

    ```rhai
    let wf = "";
    let crs = "";
    let cs = "";
    let tc = "";
    for c in conditions {
        if c.field == "workflow_id" { wf = c.value.to_string(); }
        if c.field == "cache_restore_steps" { crs = c.value.to_string(); }
        if c.field == "compile_steps" { cs = c.value.to_string(); }
        if c.field == "total_crates" { tc = c.value.to_string(); }
    }
    let rows = parse_json(run(["runs", wf]).stdout);
    for r in rows {
        r.cache_restore_steps = crs;
        r.compile_steps = cs;
        r.total_crates = tc;
    }
    rows
    ```

  - `cmd.detail`: run `stats <id>` with the painted fields read off `row`:

    ```rhai
    parse_json(run([
      "stats", id,
      "--cache-restore-steps", row.cache_restore_steps,
      "--compile-steps", row.compile_steps,
      "--total-crates", row.total_crates.to_string()
    ]).stdout)
    ```

    (Confirm the `stats` CLI flag spellings against `./scripts/gh-rust-caching-stats stats --help` or the script source.)

- [ ] **Step 3: Standalone sanity of the full chain**

Run, substituting a real run id from `runs <workflow_id>`:
`./scripts/gh-rust-caching-stats stats <run_id> --cache-restore-steps 4,8 --compile-steps 12 --total-crates 300`
Expected: JSON with `cache_size`, `cache_match`, `build_time`, `crates_compiled`.

- [ ] **Step 4: Commit**

```bash
cd /Users/rw/Work/vantage-ui-examples
git add apps/vantage-github/inventory/table/gh-workflow-runs.yaml
git commit -m "gh: gh-workflow-runs paints step columns + stats detail reads the row"
```

---

### Task C4: Remove now-dead datasource + script; production test

- [ ] **Step 1: Confirm `gh.yaml` and `gh-stats.py` are unreferenced**

Run: `cd /Users/rw/Work/vantage-ui-examples/apps/vantage-github/inventory && grep -rn "gh-stats.py\|datasource: gh$\|datasource: gh\b" . ; grep -rln "gh\.yaml" .`
Expected: no table references the old `gh` datasource or `gh-stats.py`.

- [ ] **Step 2: Remove dead files (only if Step 1 is clean)**

```bash
cd /Users/rw/Work/vantage-ui-examples/apps/vantage-github/inventory
git rm datasource/gh.yaml scripts/gh-stats.py
```

(Skip any file still referenced.)

- [ ] **Step 3: Run the app against the example and drill through**

Launch the vantage-ui app pointed at `apps/vantage-github/inventory` (use the project's normal run command). Verify:
  - Workflows list renders fast (list pass).
  - Workflow rows enrich (total_crates / steps fill in); only enriched rows with `compile_steps != ""` offer "Open runs".
  - Drilling a workflow opens its runs; runs enrich with `cache_size` / `cache_match` / `build_time` / `crates_compiled` from `stats`, proving the steps flowed workflow → conditions → painted columns → detail row → `stats`.
  - The UI never freezes during enrichment.

- [ ] **Step 4: Inspect logs via the feedback loop**

Use the `vantage-ui` MCP `list_logs` tool to confirm no errors from the cmd scripts or rhai evaluation.

- [ ] **Step 5: Commit**

```bash
cd /Users/rw/Work/vantage-ui-examples
git add -A
git commit -m "gh: remove dead gh datasource + gh-stats.py after rewiring"
```

---

## Self-review (completed during planning)

- **Spec coverage:** Feature 1 → B1/B2; Feature 2 → A3/A4/A5/A6/A7; Feature 3 → B1(guard)/B3; cmd bug (prerequisite for Feature 2 in-app) → A1; example wiring → C1–C4; production test → C4. All spec sections map to tasks.
- **Type consistency:** `get_value_with_row` / `get_vista_value_with_row` / `get_table_value_with_row` used consistently A4→A7; `QueryContext.row` is a CBOR `Value` map throughout; `RelationGateFn` / `gate_for` / `gate` consistent in B3.
- **Known follow-through during execution** (not placeholders — explicit verification steps): exact `vantage_csv` constructor in B2 Step 2, the `RelationItem` construction site in B3 Step 7, and the `analyze`/`stats` JSON keys + flag spellings in C2/C3 are each gated by a "verify against the real API" step before the code is finalized.
