# `tables` namespace

`tables` is a global object in every Rhai action body. Each property
is a handle to a table in the catalog; calling `.create()` returns
an unsaved record, and calling `.save()` on that record INSERTs it
via the dataset.

```rhai
let p = tables.product.create();
p.set(#{ name: "Croissant", price: 350 });
p.save();
```

Use this for toolbar `Add` actions and any other path where you
need a fresh row (vs editing an existing one — that's
[rhai-row-surface.md](./rhai-row-surface.md)).

## `.create()`, not `.new()`

Rhai 1.24 reserves `new` as a keyword, so the constructor is
exposed as `.create()`:

```rhai
let p = tables.product.create();   // OK
let p = tables.product.new();       // SYNTAX ERROR — `new` is reserved
```

## Leaf-key rule

The property name on `tables` is the **last `/`-segment** of the
catalog key. For example:

- `bakery-surreal/product` → `tables.product`
- `bakery-surreal/client` → `tables.client`
- `csv-bakery/order` → `tables.order`

## Collision behaviour

If two tables in the catalog share a leaf (e.g.
`bakery-surreal/product` and `csv-bakery/product`), the catalog
load **errors out** with a clear "tables.<name> collision" message.

Workaround for v1: rename one of the tables. (Follow-up:
fully-qualified `tables["bakery-surreal/product"]` lookup is
planned for when this actually bites in practice.)

## `.set(map)`

```rhai
let p = tables.product.create();
p.set(#{
  name:     "Croissant",
  price:    350,
  calories: 280,
  bakery:   "bakery:main",
});
p.save();
```

`.set()` accepts a Rhai map (or, typically, the record returned by
a `kind: form` action — see
[action-kinds.md](./action-kinds.md)):

```rhai
let r = actions.add_product();    // form returns a record
let p = tables.product.create();
p.set(r);
p.save();
```

## `.save()`

Calls the dataset's INSERT path. Returns the generated id as a
string. Throws on failure — wrap calls that depend on the new row's
id in a single body.

```rhai
let p = tables.product.create();
p.set(#{ name: "Sourdough" });
let new_id = p.save();
notify("Created " + new_id);
```

## v1 limitation: only the page's master table is in scope

The `tables` map is populated from the **master table of the
current page** only. Bodies on `page/products.yaml` see
`tables.product` and nothing else; bodies on `page/orders.yaml`
see `tables.order` and nothing else.

```rhai
# on page/products.yaml — works
let p = tables.product.create();
p.save();

# on page/products.yaml — throws "tables.client not registered"
let c = tables.client.create();
```

Multi-table availability (every catalog table reachable from every
page) is a follow-up. For now, only INSERT into the page's own
master table from a toolbar/row action.

## When to use `tables.<name>` vs `row.ref(...)`

| Need | Use |
|---|---|
| Add a brand-new row to the page's master table | `tables.<name>.create()` |
| Edit / save the right-clicked row | `row.X = v; row.save()` or `row.set(r); row.save()` |
| Delete the right-clicked row | `row.delete()` |
| Create a child row related to the right-clicked one (e.g. an order line for an order) | `row.ref("<relation>").create()` — **v1 STUB**, see [rhai-row-surface.md](./rhai-row-surface.md) |

`row.ref` is not yet wired in v1 — the cross-table-with-FK shape
arrives with the first scenario that needs it.
