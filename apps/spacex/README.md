# SpaceX

A public-data example app for Vantage UI — SpaceX launches, rockets, capsules, and related entities,
backed by a community GraphQL mirror.

It demonstrates a **GraphQL datasource** pointing at a remote, read-only API. Because the endpoint
is public and best-effort, this example is **not** offline-clean — the startup test may fail if the
mirror is down.

## Layout

```
apps/spacex/
├── inventory/            # the catalog passed to vantage-ui
│   ├── datasource/spacex.yaml   # GraphQL endpoint
│   ├── table/*.yaml              # 10 entity tables
│   ├── page/*.yaml               # 10 page views
│   └── menu/left.yaml            # sidebar grouped by domain
└── tests/                # spacex-specific scenarios
```

## Run it

```sh
# from the repo root, with VANTAGE_UI_BIN set or ../vantage-ui built --release
cargo run -p test-framework -- apps/spacex
```

Or launch the app directly against this inventory:

```sh
vantage-ui apps/spacex/inventory
```
