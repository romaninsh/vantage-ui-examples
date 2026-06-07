---
name: vantage-persistence-cmd
description: Build a Vantage UI over a local command-line tool — each table fetches its rows by running a CLI (e.g. the `mercury` CLI, `aws`, `kubectl`, `gh`) and parsing the JSON it prints. Use when the user wants to surface data from a CLI they already use instead of wiring up its REST/GraphQL API, and has selected the Command (CLI) scenario in the wizard. Don't guess the tool's commands — run `<tool> --help` to discover subcommands and flags, confirm it can emit JSON, propose a few starting tables, confirm with the user before writing YAML, then iterate page-by-page using the Vantage MCP `list_logs` tool to catch script and parsing errors.
metadata:
  version: "1.0.0"
---

# Vantage on a command-line tool

Read `.agents/skills/vantage-ui-builder/SKILL.md` first for the general project layout (`datasource/`, `table/`, `page/`, `menu/`) and the Vantage MCP feedback loop. This skill assumes you've got the basics.

This backend (`type: cmd`, the `vantage-cmd` driver) fetches a table's rows by **running a local command** and parsing its output. Nothing talks to an API directly: you lock a binary on the datasource, and each table carries a small [Rhai](https://rhai.rs) script that builds the argument list, runs the command, and turns its stdout into rows.

It's the right choice when the user already has a CLI that knows how to fetch the data (auth, environments, paging all handled by the tool) and you'd rather drive that than re-model its API. The worked example below uses the `mercury` CLI, but the pattern is identical for `aws`, `kubectl`, `gh`, `gcloud`, etc.

## Posture

You are the user's CLI integration consultant. Don't pick one command and run with it — survey what the tool can do and propose specific tables:

1. Confirm the CLI is installed and authenticated.
2. Run `<tool> --help` (and `<tool> <group> --help`) to enumerate the subcommands that *list* things.
3. Confirm the tool can emit machine-readable JSON, and capture a real sample.
4. Propose a few starting tables with specific columns. Wait for the user to confirm.
5. Write the datasource, then one table at a time.
6. After each save, call `list_logs` on the Vantage MCP and surface any warnings.
7. Once a list renders, offer drill-down relations before moving on.

There are **no factory models** for this backend — every table is hand-written from what the CLI prints. That's why the survey step matters: you're translating JSON fields into Vantage column declarations.

## Step 1 — Confirm the CLI works

Before anything else, confirm the binary is on `PATH` and authenticated:

```bash
which mercury          # is it installed?
mercury --help         # does it run? (auth/login may be required first)
```

If it isn't installed, point the user at its install docs. If commands fail with an auth error, have the user log in with the tool's own flow (e.g. `mercury login`) — Vantage runs the binary as your user with `PATH`/`HOME` forwarded, so it reuses the same stored credentials you see in your shell.

## Step 2 — Discover the listing commands

Enumerate the subcommands, focusing on the ones that return a *collection*:

```bash
mercury --help                 # top-level command groups
mercury product --help         # a group's subcommands — look for `list`
mercury deployment list --help # a specific command's flags
```

Note which flags **filter** a list (e.g. `--product-id`, `--name`) — those become the hooks for relations and search later.

## Step 3 — Confirm JSON output

A table's script parses the command's stdout, so the command must be able to print JSON. Most CLIs have a global or per-command flag:

```bash
mercury --table-format json product list   # mercury: global --table-format json
# aws uses --output json; gh uses --json <fields>; kubectl uses -o json
```

Run it for real and look at the shape. You need to know:

- Is the top level a **JSON array** of row objects, or an **object** with the array nested under a key (e.g. `{ "items": [...] }`)?
- Which field is the stable **id** (becomes the `[id]` column)?
- Which field is the human **title** (becomes `[title]`)?

If the tool can't emit JSON but prints one JSON object per line (JSONL), that's fine too — see `parse_jsonl` in `references/rhai-cmd-surface.md`.

## Step 4 — Create the datasource

Drop one file under `datasource/`. The `command` is **locked** — table scripts can pass arguments but can never change which binary runs:

```yaml
# datasource/mercury-cmd.yaml
# yaml-language-server: $schema=./datasource-schema-1.json
type: cmd
description: "Mercury platform via the mercury CLI"
command: mercury
# Optional. `pass_path` (default true) forwards PATH/HOME so the binary
# and its own config/credentials resolve. Set env vars the tool needs:
# env:
#   SOME_TOKEN: "..."
```

Fields:

- `command` (required) — the binary to run. Looked up on `PATH` unless absolute.
- `env` (optional) — extra environment variables for the child process. The child otherwise gets a *cleared* environment plus `PATH`/`HOME`.
- `pass_path` (optional, default `true`) — forward `PATH`/`HOME`. Leave it on unless you want a fully-locked-down command with an absolute path.

## Step 5 — Write a table

Each table gets a `cmd:` block with a `rhai:` script. The script's job: build an argv array, call `run(args)`, check the exit code, and return the rows as a parsed JSON array.

```yaml
# table/mercury_cmd_products.yaml
# yaml-language-server: $schema=./table-schema-1.json
datasource: mercury-cmd
title: "Products (mercury CLI)"
columns:
  - { name: product_id, type: string, flags: [id] }
  - { name: product_name, type: string, flags: [title, searchable] }
  - { name: status, type: string }
  - { name: active_deployment_count, type: int }
cmd:
  rhai: |
    let args = ["--table-format", "json", "product", "list"];
    let out = run(args);
    if out.exit_code != 0 { throw out.stderr; }
    parse_json(out.stdout)
```

Key points:

- **Columns** declare the fields you want from each JSON object. `type` is one of `string`, `int`, `float`, `bool`, `json` (plus the UI hints `datetime` / `bytes`, which store as strings). Fields the JSON has but you don't declare are simply ignored.
- **Flags**: `[id]` marks the stable key (required for a stable grid and for relations); `[title]` is the headline column; `[searchable]` lets the search box filter it; `[hidden]` keeps a column available for relations without showing it.
- The script must **return the array of row objects**. If the JSON nests them, project to it: `parse_json(out.stdout).logGroups` or `parse_json(out.stdout).items`.
- Always check `exit_code` and `throw out.stderr` on failure — that surfaces the tool's own error message in the Vantage logs (visible via `list_logs`), which is how you'll debug.

After writing, immediately call `list_logs` on the Vantage MCP. A red line usually means the command failed (auth, wrong flag) or the JSON shape didn't match your projection.

## Step 6 — Relations (drill-downs)

Relations work by **narrowing the child table with a condition**, which your child script reads out of `conditions` and turns into a CLI flag. This is how a "list deployments for this product" drill-down maps onto `mercury deployment list --product-id <id>`.

Declare the relation on the parent table:

```yaml
# table/mercury_cmd_products.yaml (add to the products table)
references:
  deployments:
    table: mercury_cmd_deployments
    kind: has_many
    foreign_key: product_id   # child is narrowed by product_id = <this row's id>
```

Then the child script consumes that condition:

```yaml
# table/mercury_cmd_deployments.yaml
datasource: mercury-cmd
title: "Deployments (mercury CLI)"
columns:
  - { name: deployment_id, type: string, flags: [id] }
  - { name: environment_id, type: string, flags: [title] }
  - { name: product_id, type: string, flags: [hidden] }
cmd:
  rhai: |
    let args = ["--table-format", "json", "deployment", "list"];
    for c in conditions {
        if c.field == "product_id" { args += ["--product-id", c.value]; }
    }
    let out = run(args);
    if out.exit_code != 0 { throw out.stderr; }
    parse_json(out.stdout)
```

If the CLI subcommand *requires* the filter (like `--product-id` here), the table is only reachable by drilling in from a parent — don't add it to the menu on its own.

## Notes and gotchas

- **Read-only.** This backend lists and reads; it doesn't insert/update/delete. Mutations belong in actions (see the builder skill's `references/actions.md`), which can also shell out.
- **One process per fetch.** Each list/count runs the command afresh. For an expensive command, keep the table list focused and lean on relations to narrow rather than fetching everything.
- **Search & limit.** A `[searchable]` column's value and the grid's row limit also arrive in the script scope (`conditions`, `limit`, `offset`) — wire them onto the tool's own `--name` / `--max-items`-style flags when it has them, instead of fetching everything and filtering in memory.
- **Security boundary.** The script can shape arguments but never changes the locked `command` or escapes the declared environment. Treat the `rhai:` script as trusted config, not user input.

See `references/rhai-cmd-surface.md` for the full Rhai surface (`run`, `parse_json`, `parse_jsonl`, and the scope variables).
