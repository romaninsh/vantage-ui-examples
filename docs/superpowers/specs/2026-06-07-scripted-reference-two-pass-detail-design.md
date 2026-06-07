# Scripted references feeding a two-pass detail pass

Date: 2026-06-07
Status: approved design, pre-implementation

## Context

Two-pass (progressive) loading already exists end-to-end (see
`~/.claude/plans/context-ref-file-...-snoopy-origami.md`, Phases 1–3, committed):

- **vantage-cmd** can declare a `list` script (cheap rows) and a `detail` script
  (expensive per-id hydration); the rhai engine/AST is compiled once per spec.
- **vantage-diorama** has the two-pass Lens (`on_list_page` + `on_load_detail`),
  persisted `RowStatus` (`Incomplete`/`Fresh`/`Complete`), per-query index keyed
  by `Vista::index_key`, sequential no-total paging, and a BDD suite.
- **vantage-ui** wires it: a `cmd` table with a `detail` script opts into the
  two-pass `build_dio` path (`crates/backend/src/lens.rs`).

The driving production example is the GitHub Actions cache-efficiency monitor
(`apps/vantage-github`). Listing a workflow's runs is cheap; extracting per-run
cache/compile stats is expensive (a jobs API call + a full log download + parse).
The expensive `stats` call needs **per-workflow parameters** — the build's
cache-restore step numbers, compile step numbers, and total crate count — which
are themselves expensive to derive (the `analyze` action scans the longest
successful run).

The goal of THIS spec: drill from a workflow into its runs such that the
expensive per-run `stats` call receives those workflow-level parameters, derived
once (lazily) and carried down the drill-down — without ever blocking the UI.

## Accepted limitations (agreed with the user)

1. **No drill-down into an un-enriched row.** A workflow row is drillable only
   after its detail pass (`analyze`) has finished. A workflow with zero
   compilation steps is never drillable. We *gate* the drill-down rather than
   degrade the child query. We need this gating capability regardless.
2. The reference rhai adds conditions on the **target** table (the
   `table("…").add_condition_eq(…)` build form), not on `self`.
3. The list pass has the conditions in scope and paints them onto its rows as
   "fake" columns; the **enriching (detail) pass receives the existing row**, so
   it can read those fields — previously it received only the `id`.

## Design

Three framework features plus example wiring. Features 1 and 2 are independent;
Feature 3 is a UI affordance.

### Feature 1 — scripted references fire on a drill-down (Design B)

**Finding (investigated):** the scripted-reference machinery already exists and
is unit-tested at the Vista level:

- `vantage-vista`: `register_conventional_onto` (vocab: `table`, `with_id`,
  `add_condition_eq`, `add_order`, `add_search`, `set_page_size`, `get_ref`),
  `eval_ref_script(engine, code, row)` (parent row exposed as `row`,
  `table(name)` resolved via a `TargetResolver`), scalar-only `dynamic_to_cbor`.
- `vantage-vista`: `Reference.build_script: Option<String>`.
- `vantage-surrealdb`: `Vista::get_ref` already evaluates `build_script` via
  `get_ref_via_script` → `eval_ref_script` with the parent row.
- `vantage-ui` inventory: `ReferenceFull.rhai: Option<String>` already parsed and
  threaded into the surreal reference extras.

**The gap:** vantage-ui's drill-down (`crates/backend/src/connect/entity.rs`
`open_detail`, the only drill path) resolves *every* relation through
`VistaCatalog::traverse → Relation::narrow` (foreign-key eq only). It never calls
`Vista::get_ref`. So the scripted-reference feature is effectively unwired in the
app for *every* backend, and cmd's `get_ref` (`vantage-cmd/src/vista/source.rs`)
is FK-only and off the drill path.

**The change (B2): evaluate the reference script in the app's drill-down, using
the resolver that already lives there.** The reusable primitive
`eval_ref_script(engine, code, row)` is backend-agnostic; the only thing it needs
is a `TargetResolver` to turn `table("…")` into a Vista. `entity.rs:open_detail`
*already* holds such a resolver (`ResolverContext::load_target_vista`). So the
drill-down branches on script presence:

> In `open_detail`, when the relation carries an `rhai` script, build a Rhai
> engine, `register_conventional_onto(&mut engine, resolver)` with
> `resolver = |name| rc.load_target_vista(name)`, and
> `eval_ref_script(&engine, script, parent_row)` to get the narrowed target
> Vista. Otherwise use the existing `catalog.traverse(&to_factory_relation, …)`
> FK path.

The gate is script presence on the relation — exactly the "scripted reference
exists" signal. The parent row is passed straight into `eval_ref_script`, which
already takes it.

Why B2 over delegating through `Vista::get_ref` (the "B1" form): `get_ref`-based
delegation requires each backend's vista to carry a resolver so the script's
`table("…")` can be built. SurrealDB's vista does (threaded via
`factory.with_resolver`); the **cmd vista has none**, so B1 would mean threading
a resolver plus reference-extras plus a scripted `get_ref` branch into cmd. B2
puts the eval where the resolver already is — the app's drill-down layer, which
already evaluates rhai for other hooks — so it is strictly less code, touches
**zero** cmd code, works uniformly for every backend, and wires up
surreal-scripted-refs-in-the-app in the same place.

Concrete work:

- **vantage-ui `UiRelation`** (`crates/backend/src/connect.rs`): add
  `rhai: Option<String>`.
- **vantage-ui `derive_relations`** (`crates/backend/src/connect/relations.rs`):
  copy `ReferenceFull.rhai` (and the sugar/has_many forms' absence of it) into
  `UiRelation.rhai`.
- **vantage-ui `entity.rs:open_detail`**: the script-vs-FK branch above. The FK
  fall-back path (`to_factory_relation` + `catalog.traverse`) is unchanged.

The factory `Relation` and `VistaCatalog::traverse` are **not** changed; cmd is
**not** touched for this feature. (`traverse_from`, which already delegates to
`Vista::get_ref` for same-persistence, stays as-is and unused by this path.)

### Feature 2 — the detail pass receives the existing row

Today the detail pass hydrates by `id` only: `lens.rs on_load_detail` calls
`master().get_value(&id)`, and cmd's `get_table_value` runs the detail script
with `conditions: Vec::new()` and only `id` in scope
(`vantage-cmd/src/table_source.rs:213`).

The list pass now writes useful fields onto each `Incomplete` row (Feature wiring
below). The detail script must be able to read them. So the enriching call
forwards the existing cached record into the detail script as `row`.

Concrete work (backwards-compatible via a default trait impl — non-cmd drivers
unaffected):

- **vantage-vista**: add `Vista::get_value_with_row(id, row)` (facade) backed by
  a `VistaSource::get_vista_value_with_row(vista, id, row)` trait method whose
  **default implementation ignores `row` and calls `get_vista_value(vista, id)`**.
- **vantage-cmd**: override `get_vista_value_with_row` to inject the supplied
  record into the detail `QueryContext` (new `QueryContext.row: Option<Record>`);
  the `CompiledScript` pushes it into scope as `row`. The existing
  `get_table_value(id)` path stays for non-row callers.
- **vantage-diorama `lens.rs build_two_pass_lens`**: `on_load_detail` reads the
  cached `Incomplete` record (`dio.cache().get_value(&id)`) and calls
  `master().get_value_with_row(&id, existing)`. The `DioLoadDetailCallback`
  signature is unchanged (no churn to tested Phase-2 code).

### Feature 3 — drill-down gating (DEFERRED to a page-level guard)

Intent unchanged: don't offer a drill-down into a row that isn't enriched yet
(`RowStatus` not `Fresh`) or that fails a value predicate (e.g.
`row.compile_steps != ""` for the gh `runs` reference, so deploy-only workflows
aren't drillable).

**Decision (during implementation):** the guard does **not** belong on the
reference — it belongs on the **page** (the same layer that already carries
row-action `when:` predicates and evaluates them via
`vantage_actions::evaluate_predicate`). So no `guard` field is added to
`ReferenceFull` / `UiRelation`, and no gating is wired into the backend
drill-down. This is split out as separate, page-level work and is **not** part of
this implementation. Features 1 and 2 (the working data flow) ship without it;
until the page guard lands, drilling an un-enriched row simply yields a target
whose detail rows can't read step values yet.

## Example wiring (apps/vantage-github)

Repoint the `gh-stats` datasource to `./scripts/gh-rust-caching-stats`; drop the
now-unused raw `gh` datasource and `gh-stats.py`. **No Python change** — the
`gh-rust-caching-stats` script keeps its current `stats <run_id>
--cache-restore-steps A,B --compile-steps C,D --total-crates N` contract.

- **`gh-workflows.yaml`** — becomes two-pass on the `gh-stats` datasource:
  - `cmd.rhai` (list) = `workflows romaninsh/vantage` → `{id, name, state}`.
  - `cmd.detail` = `analyze <id> romaninsh/vantage`; the detail rhai joins
    `analyze`'s step arrays into CSV strings (`"4,8"`) so they ride as scalar
    conditions and feed the `stats` CLI directly, and emits `total_crates`.
  - columns gain `total_crates`.
  - reference `runs` gains `rhai`:
    ```rhai
    table("gh-workflow-runs")
        .add_condition_eq("workflow_id",         row.id)
        .add_condition_eq("cache_restore_steps", row.cache_restore_steps)
        .add_condition_eq("compile_steps",       row.compile_steps)
        .add_condition_eq("total_crates",        row.total_crates)
    ```
  - reference `runs` gains `guard: row.compile_steps != ""`.

- **`gh-workflow-runs.yaml`** — two-pass on `gh-stats`:
  - hidden columns `cache_restore_steps`, `compile_steps`, `total_crates`
    (declared so the schema knows them; never populated by the list script, so
    the client-side safety net leaves rows alone).
  - `cmd.rhai` (list) = `runs <workflow_id>` — reads the `workflow_id` condition
    for the call, and paints `cache_restore_steps`/`compile_steps`/`total_crates`
    from the conditions onto every emitted row.
  - `cmd.detail` = `stats <run_id> --cache-restore-steps <row.cache_restore_steps>
    --compile-steps <row.compile_steps> --total-crates <row.total_crates>` —
    reads the painted fields from the injected `row`, returns `cache_size`,
    `cache_match`, `build_time`, `crates_compiled`.

## End-to-end data flow

```
gh-workflows (two-pass, gh-stats)
  list:   workflows romaninsh/vantage          → {id,name,state}        (cheap)
  detail: analyze <id> romaninsh/vantage       → total_crates,
          (lazy, viewport)                        cache_restore_steps,
                                                  compile_steps (CSV)    (expensive)
        │  user clicks a Fresh row with compile_steps != ""  (gated)
        ▼  reference "runs" rhai (eval_ref_script, row in scope):
           table("gh-workflow-runs").add_condition_eq("workflow_id", row.id)…
        ▼
gh-workflow-runs (two-pass, gh-stats)
  list:   runs <workflow_id>                    → run rows, with hidden
          (paints fake columns from conditions)    step columns painted   (cheap)
  detail: stats <run_id> --cache-restore-steps … → cache_size, cache_match,
          (lazy, viewport; reads injected row)     build_time, crates_compiled (expensive)
```

## Testing (TDD)

Framework, test-first:

- **vantage-vista**: `get_vista_value_with_row` default impl ignores `row`
  (delegates to `get_vista_value`).
- **vantage-cmd**: the detail path with an injected `row` exposes `row.*` to the
  detail script; the row-less path still works (default trait impl).
- **vantage-ui**: `derive_relations` copies `ReferenceFull.rhai` into
  `UiRelation.rhai`; `open_detail` runs the script branch (narrows the target by
  reading multiple parent-row fields) when `rhai` is set and the FK branch when
  it is not; drill-down gating predicate (status + guard).

Production test: run the app against `romaninsh/vantage`, drill workflow → runs,
confirm `stats` receives the derived steps and rows hydrate without UI freeze.

Constraint: tests assert invocation/ordering/logic only — no simulated slowness,
no clock advance.

## Out of scope / follow-ups

- Persisting the per-query index across restart (only the detail table + status
  persist today).
- Forwarding list-pass conditions/sort server-side beyond what the gh scripts
  need (the list windows locally; see `lens.rs`).
- Removing the temporary `[patch.crates-io]` block in vantage-ui once these land
  on crates.io.
