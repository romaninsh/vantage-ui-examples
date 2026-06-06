# Bakery

A small, fully-offline example app for Vantage UI — the "Hill Valley Bakery".

It demonstrates the minimum shape of a Vantage inventory:

- a **CSV datasource** (`datasource/bakery.yaml`) that needs no network or
  database — each `.csv` under `data/` (next to `inventory/`) becomes a table;
- two **tables** (`products`, `clients`) bound to that datasource;
- two **pages** rendering each table as a CRUD grid;
- a **menu** (`menu/left.yaml`) wiring the pages into the sidebar.

Because the datasource is CSV, the app starts cleanly with no external
dependencies — which is exactly what the shared startup test asserts.

## Layout

```
apps/bakery/
├── inventory/            # the catalog passed to vantage-ui
│   ├── datasource/bakery.yaml   # path: ../data
│   ├── table/{products,clients}.yaml
│   ├── page/{products,clients}.yaml
│   └── menu/left.yaml
├── data/{products,clients}.csv  # CSV data, next to inventory/
├── tests/                # bakery-specific scenarios (none yet)
└── docs/                 # notes about this example
```

## Run it

```sh
# from the repo root, with VANTAGE_UI_BIN set or ../vantage-ui built --release
cargo run -p test-framework -- apps/bakery
```

Or launch the app directly against this inventory:

```sh
vantage-ui apps/bakery/inventory
```
