# Rhai row surface

Inside a row-action `action:` body, `row` is bound to the
right-clicked record. Verbs below stage and commit changes against
it. See [rhai-expressions.md](./rhai-expressions.md) for the
broader Rhai cheat sheet.

(Toolbar bodies have no `row` — see
[toolbar-and-row-actions.md](./toolbar-and-row-actions.md).)

## `row.X = v` — stage a single field

```rhai
row.status = "cancelled";
row.cancellation_reason = "out_of_stock";
row.save();
```

Reads and writes work for any column declared on the page's table.
Writes are staged; nothing hits the dataset until `row.save()`.

Dotted paths write through nested maps:

```rhai
row.inventory.stock = 0;
row.save();   // patches inventory.stock without clobbering inventory.warehouse
```

## `row.set(other)` — bulk-copy a record or map

Takes either an `actions.<form>(...)` result record or a Rhai map.
Each key maps onto a field on the row (dotted paths walk nested
structures). Equivalent to assigning every field one by one.

```rhai
let r = actions.edit_product(row);   // form returns a record
row.set(r);                           // stage every form field onto the row
row.save();
```

```rhai
row.set(#{ status: "paid", paid_at: now() });
row.save();
```

Keys not present on the row's table are still staged — the dataset
will reject unknown columns at save time if it's strict; SurrealDB
silently ignores them.

## `row.save()` — commit staged changes

Diff-on-save: only the fields you touched (since the row was
loaded) get sent as a patch. Goes through Diorama so the grid
re-renders and any other open page mirroring the same record
updates too.

```rhai
row.x = 5;
row.y = "hello";
row.save();   // sends { x: 5, y: "hello" } as a patch
```

Throws on dataset failure; the snippet aborts and any subsequent
verbs (`row.delete()`, further `actions.X()`) don't run.

## `row.delete()` — delete + invalidate

Deletes the underlying record via the dataset, then invalidates the
Dio cache for the record so the grid re-renders without it.

```rhai
if actions.delete_product(row) { row.delete(); }
```

Guard with `kind: confirm` for anything irreversible — see
[action-kinds.md](./action-kinds.md).

## `row.ref("<name>")` — follow a relation

**v1 stub.** Registered on the engine but throws
`row.ref("..."): not yet wired in this cycle`. The intended shape:

```rhai
// FUTURE — does not work in v1
let line = row.ref("lines").create();   // unsaved related row, FK pre-filled
line.set(#{ qty: 1, sku: "AB" });
line.save();
```

Follow-up: full flat-FK wiring (and a clear "not implemented" path
for graph-edge relations) lands when the first scenario needs it
(likely cash-payment linking or restock-with-history). None of the
v1 actions ship with `row.ref` in their bodies.

For now, do cross-table INSERTs via `tables.<name>.create()` if the
table is in scope — see
[rhai-tables-namespace.md](./rhai-tables-namespace.md).
