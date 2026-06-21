# The `cmd` Rhai surface

Each `cmd`-backed table carries a `cmd.rhai` script. When the table is
read, Vantage runs that script synchronously (on a blocking thread) with
a few helper functions registered and the current query seeded into
scope. The script's job is to build an argv, run the locked command, and
**return an array of row objects** (each a map / parsed JSON object).

## Functions

### `run(args) -> #{ stdout, stderr, exit_code }`

Runs the datasource's **locked** command with `args` (an array; each
element is stringified). The command and environment are fixed by the
datasource / table config — the script can shape *arguments* but can
never change which binary runs or what environment it gets. Returns a map:

- `stdout` — captured standard output (string)
- `stderr` — captured standard error (string)
- `exit_code` — process exit code (int); a non-zero code is **not** an
  automatic error, so the script decides what to do with it. The
  convention is `if out.exit_code != 0 { throw out.stderr; }`.

```rhai
let out = run(["--table-format", "json", "product", "list"]);
if out.exit_code != 0 { throw out.stderr; }
```

### `parse_json(string) -> value`

Parses a JSON string into a Rhai value. Returns whatever the JSON is — an
array, or an object you then project into:

```rhai
parse_json(out.stdout)            // top-level array of rows
parse_json(out.stdout).logGroups  // rows nested under a key
```

### `parse_jsonl(string) -> array`

Parses newline-delimited JSON (one object per line, blank lines skipped)
into an array of values. For tools that stream one JSON object per line
instead of a single array:

```rhai
parse_jsonl(out.stdout)
```

## Scope variables

These are seeded before the script runs, describing the current read:

- `conditions` — array of `#{ field, op, value }`. Filters pushed onto the
  table: relation narrowing (e.g. a parent's id), `params:` from the table
  config, and `[searchable]` search terms. `op` is `"eq"` or `"in"`. Map
  each onto the tool's own flags:

  ```rhai
  let args = ["--table-format", "json", "deployment", "list"];
  for c in conditions {
      if c.field == "product_id" { args += ["--product-id", c.value]; }
  }
  ```

- `columns` — array of column names the caller asked for. Most CLIs return
  everything; use this only if the tool supports projecting fields.
- `limit` — `Option<int>`: the row cap, or unit `()` when unbounded. Guard
  before using: `if type_of(limit) != "()" { args += ["--max-items", limit.to_string()]; }`.
- `offset` — `Option<int>`: rows to skip (pagination), or `()`.
- `id_column` — `Option<string>`: the table's id column name, or `()`.

## Return value

The script must return an **array**; each element becomes one row. A
non-array result (or a thrown value) fails the fetch — the message shows
up in the Vantage logs, visible through the MCP `list_logs` tool. Fields
present in a row but not declared as table columns are ignored; declared
columns missing from a row read as empty.
