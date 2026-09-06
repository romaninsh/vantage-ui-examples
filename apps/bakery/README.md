# Bakery

The Hill Valley Bakery franchise back-office — the example that exercises the
widest slice of Vantage in one app.

Five pages over a SurrealDB catalog: a dashboard of query-sourced charts and
lists, and CRUD boards for bakeries, clients, products and orders with
relation drill-downs between them.

It carries one action of every kind, which is the point of it:

| Action | Kind | Shows |
|---|---|---|
| `add-product`, `edit-product` | form | dialog forms, prefilled from the row |
| `delete-product` | confirm | a destructive confirmation |
| `cancel-order` | form | a row-scoped workflow with a reason |
| `send-password-reset` | http_request | an outbound call with a Rhai-built body |
| `bake-muffins` | terminal | a local script streamed into a terminal sheet |
| `import-products` | wizard | a multi-step dialog with a background worker |

The import wizard's worker lives in its own file, `action/import-products.rhai`,
spliced in with `!include` — which is why this app needs Vantage 0.38 or newer.

## Layout

The project root is the app directory itself: the kind directories sit
directly under it, with no `inventory/` level.

```
apps/bakery/
├── datasource/bakery-surreal.yaml
├── table/bakery-surreal/*.yaml     # 5 stored tables + 4 query-sourced
├── page/{dashboard,bakeries,clients,products,orders}.yaml
├── action/*.yaml                   # one per action kind, plus the worker .rhai
├── menu/left.yaml
├── scripts/bake-muffins.py         # what the terminal action runs
├── seed.py                         # bulk demo data generator
├── import-products.csv             # the wizard's input
└── features/                       # per-feature agent briefs
```

## Run it

The datasource connects on startup, so bring the database up first.

```sh
surreal start --user root --pass root
python3 apps/bakery/seed.py          # ~2k orders over a year
```

Then open the app:

```sh
vantage-ui apps/bakery
```

`seed.py xs` is a faster smoke-sized dataset and `seed.py xl` a stress one;
`--wipe` drops only the generated records, leaving the hand-authored clients
and products alone.

Because it needs a database, this app carries a `.bdd-skip` and is left out of
the `--all` CI sweep. Run its scenarios explicitly once the database is up:

```sh
cargo run -p test-framework -- apps/bakery
```
