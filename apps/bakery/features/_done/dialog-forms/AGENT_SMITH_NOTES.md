# Smith Notes — `dialog-forms`

Scratchpad.

- **Blockers** — couldn't do, with error and what was tried.
- **Guesses** — judgement calls when docs/schema didn't cover the case.
- **Surprises** — unexpected data shapes, MCP responses.
- **Workarounds** — not recommended as permanent.
- **Suggestions** — for Neo or the workflow.

## Run summary

All 7 tasks ticked. After every save `list_logs(level=warn)` returned
empty; catalog re-emitted `leaf reloaded ... valid=true` for both pages
and `leaf added kind=Action ...` for each new action. Final orders page
reload reports `columns=8` (id, bakery, is_deleted, created_at, lines,
status, cancellation_reason, cancellation_note) — the three new
schemaless columns were picked up without a `DEFINE FIELD` and without a
SurrealDB reconnect cycle.

## Blockers

None — every task ran clean.

## Guesses

1. **Dropped `key:` from all four action files.** The brief's Tasks 2–5
   snippets start with e.g. `key: cancel-order`, but
   `action-schema-1.json` is `additionalProperties: false` and has no
   `key` field. The existing `action/send-password-reset.yaml` confirms
   the leaf key is derived from the filename. I deleted the `key:` lines
   and the catalog accepted all four files. (See Suggestions §1.)

2. **Kept existing `Open → *-detail` row actions on both pages.** Tasks
   6 and 7 show a fresh `row_actions:` block as if replacing whatever was
   there. The current `orders.yaml` and `products.yaml` each have an
   `Open` entry with `primary: true` and `navigate: *-detail`. I treated
   the snippets as "append", not "replace" — dropping the only primary
   nav off a CRUD page is almost certainly a regression. (See Suggestions §2.)

3. **`labels:` shape copied from `examples/spacex/page/cores.yaml`.**
   The brief says "see nearby YAML for the exact `labels:` shape", but
   no other file under `examples/surreal-bakery/` uses `labels:`. I
   widened the grep across `examples/`, found cores.yaml's status column
   with `color:` + `labels:`, and mirrored the pattern — keys
   `success` / `yellow` / `red` / `muted` per `ColumnDisplay` in
   `page-schema-1.json`. Mapping I picked:
   - `success`: `[paid]`
   - `yellow`: `[in_production, ready]`
   - `red`: `[cancelled]`
   - `muted`: `[placed]`
   - `confirmed`, `delivered`, `picked_up` left uncoloured (no obvious
     bucket).

4. **PascalCase icon names** (`X`, `Plus`, `Pencil`, `Trash`). The brief
   uses both `plus` (lowercase, in `toolbar-and-row-actions.md`) and
   `Plus` (PascalCase, in the Task 7 snippet). Existing `orders.yaml`
   and `products.yaml` use PascalCase (`ChevronRight`), so I went with
   PascalCase throughout. No way to test which one the renderer actually
   accepts from list_logs alone.

5. **Status-values comment placed inline above the column.** The brief
   says "Document its valid values in a comment" but not where. I put a
   `# Valid values: placed | confirmed | ...` line immediately above the
   `status:` column entry rather than at the top of the file.

## Surprises

1. **The vantage-ui MCP exposes only `list_logs`.** No `read_resource`,
   no synthetic click events. That's enough to verify the catalog parsed
   and the pages rebuilt, but it's not enough to verify any of the four
   dialog flows from the acceptance criteria. (See Suggestions §5.)

2. **Skill references live at two paths.** The brief says
   `.agents/skills/vantage-ui-builder/references/...` — that path doesn't
   exist at the repo root. The reachable copies are at
   `examples/surreal-bakery/.agents/skills/...` (where Smith is supposed
   to look) and `app/resources/skills/...` (canonical). Two extra Glob
   calls to locate, not a real blocker.

3. **Orders page rebuild fires twice per save.** Every YAML edit to
   `order.yaml` shows two back-to-back
   `(re)building entity page page=orders` lines (e.g. seq 51 + 52, 55 +
   56, 59 + 60 in the log). Not a warning, not a failure — flagging in
   case it indicates a redundant reload pass somewhere.

## Workarounds

None. Every brief task mapped onto a clean YAML write.

## Suggestions

For the next pass of the brief / for Neo:

1. **Delete the `key:` lines from Tasks 2–5 code blocks.** They make the
   snippets unpastable as-is and a less careful agent would either ship
   them and get a validation warning, or invent an explanation about why
   the schema must be wrong.

2. **Phrase Tasks 6/7's `row_actions:` snippets as "append to" or include
   the existing `Open` entries.** Right now the snippets look like a
   wholesale replacement. A fresh agent could silently delete the
   primary nav.

3. **Inline a complete `status:` column block in Task 6** (or link to
   `examples/spacex/page/cores.yaml`). "See nearby YAML" is misleading
   when no nearby YAML uses `labels:`.

4. **Reword Task 1's "schemaless" caveat.** "no SurrealDB DEFINE FIELD
   (schemaless)" reads like it implies a YAML difference. Suggest:
   "Add three regular string columns to the YAML — no migration needed
   because the SurrealDB table is schemaless."

5. **Split the acceptance criteria into agent-checkable vs human-only.**
   `list_logs(level=warn)` empty + every leaf `valid=true` is the
   strongest signal an agent with this MCP can produce. The four
   dialog-flow walkthroughs in the brief are click-only and should
   probably tell the agent to stop and hand back at that point rather
   than imply it can self-verify.

6. **Pin Lucide icon casing.** Either `Plus` or `plus`, not both in the
   same brief. (And ideally validate it — if the renderer is strict, a
   typo here silently breaks the button.)

## Known-limitation cross-check (clean)

None of the v1 limitations listed in the brief (1–5) apply to the bodies
I wrote: no `.new()` typo, no dotted-path `row.set`, no cross-table
`tables.<other>.create()`, no `requires_row` toolbar buttons, no
`row.ref()`.

## What still needs a human

I have `list_logs` only — I can't drive the UI. The acceptance flows
(orders right-click → Cancel order; products toolbar → Add product;
products right-click → Edit; products right-click → Delete) need a
click-through. If any misbehave at runtime, most-likely culprits:

1. **Edit prefill** — `form-fields.md` v1 caveat: prefill needs the row
   passed AND every field name matching a row attribute. `name`,
   `bakery`, `price`, `calories` all exist as flat columns on
   `bakery-surreal/product`, so prefill should populate.
2. **`row.save()` after `row.set(r)`** — `add_product` returns a record
   with only the four flat fields; `tables.product.create()` should
   accept them via `.set()` per `rhai-tables-namespace.md`.
3. **`row.delete()` after a `confirm` returning `true`** — straightforward
   per `rhai-row-surface.md`, but worth visually confirming the grid
   actually drops the row (Dio cache invalidation).
