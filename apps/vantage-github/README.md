# vantage-github

A Vantage UI example that surfaces GitHub Actions build cache efficiency through the `gh` CLI.

## What it does

Two-page drill-down for inspecting how well the Rust build cache is working across the
`romaninsh/vantage` CI pipelines:

1. **Cache Efficiency** — lists all active build workflows (pipelines) in the vantage repo
2. **Workflow Runs** — shows the last 5 runs of a selected workflow, with cache and compilation
   stats extracted from the CI logs

## Inventory layout

```
datasource/
  gh.yaml                  # type: cmd, command: gh

table/
  gh-workflows.yaml        # gh workflow list → build pipelines
  gh-workflow-runs.yaml    # gh run list + gh run view --log → runs with cache stats

page/
  cache-efficiency.yaml    # pipelines table, row action → workflow-runs
  workflow-runs.yaml       # args: workflow_id, shows runs table

menu/
  left.yaml                # sidebar: Cache Efficiency
```

## Tables

### gh-workflows

Runs `gh workflow list --repo romaninsh/vantage`. Columns:

| Column | Type   | Notes               |
| ------ | ------ | ------------------- |
| id     | int    | [id]                |
| name   | string | [title, searchable] |
| state  | string | active/disabled     |

### gh-workflow-runs

Narrowed by `workflow_id` (from parent relation). For each of the last 5 runs, fetches the log and
extracts build stats.

Runs `gh run list` then `gh run view --log` per run. Columns:

| Column          | Type     | Extracted from                              |
| --------------- | -------- | ------------------------------------------- |
| database_id     | int      | [id]                                        |
| workflow_id     | int      | [hidden] — relation FK                      |
| run_number      | int      |                                             |
| head_branch     | string   | [title]                                     |
| conclusion      | string   | success/failure                             |
| started_at      | datetime |                                             |
| cache_size      | string   | `Cache Size: ~NNN MB`                       |
| cache_match     | string   | `full match: true/false` → "full"/"partial" |
| build_time      | string   | `Finished dev profile in Nm Ns`             |
| crates_compiled | int      | count of `Compiling` lines                  |

## Known issues

- The Rhai script may need tuning — string ops like `.split()` and `.contains()` need to match what
  the vantage-cmd Rhai surface actually supports.
- Each run requires a separate `gh run view --log` call (5 HTTP requests per table load).
- Hardcoded to `romaninsh/vantage` repo.
