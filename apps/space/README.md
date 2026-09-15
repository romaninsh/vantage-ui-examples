# Space — Launch Library 2 as a console

Every table here is one endpoint of The Space Devs' Launch Library 2, on its free
development host (`lldev.thespacedevs.com`). Vantage sends one request per scrolled window,
reads the `count` envelope to size the scrollbar, and shows the result as read-only grids.
The dev host serves stale, throttled data by design: counts and dates lag the production API.

## What to look at

- **Launches and Events** — one page each. The chips switch between the whole collection
  and the `upcoming/` and `previous/` endpoint variants; the ordering comes from the server
  (`ordering=-net` in the endpoint path), so the first rows are the newest even though only
  the visible window has loaded.
- **Agencies, Pads, Locations, Programs, Launcher configurations** — each row's Launches tab
  is narrowed by the API: the relation key becomes a query parameter (`?lsp__id=`, `?pad=`,
  `?location__ids=`, `?program=`, `?rocket__configuration__id=`). Programs also drill into
  Events, and Agencies into Mission patches.
- **Space stations, Expeditions, Boosters, Spacecraft, Payloads** — their joins
  (dockings, spacewalks, landings, flights) use the second datasource `ll2c` with
  `filter_strategy: client`: the dev API ignores those filter params, so Vantage loads the
  collection and narrows on the nested id each row carries.
- **Starship fleet** — a singleton endpoint (`dashboard/starship/`) whose `vehicles` key is
  the table. No envelope, no paging.
- **Reference data** — the API's 29 `config/` vocabularies behind one dropdown. Picking one
  remounts the grid over a different endpoint; it replaces a page per vocabulary.

## The menu

`menu/left.yaml` is grouped by domain with nested sections. The sidebar opens one section at a
time and scrolls; set `menu: { placement: native }` in `application.yaml` and the same tree
becomes the macOS menu bar instead.

## What the API does not allow

- Only equality filters via query parameters, and only where the endpoint honours them. The
  probes that decided each relation are in the table files' comments.
- No writes: binders show no Add or Delete, and the Details tab is read-only.
- No quicksearch on the server: the search box filters what has loaded.

Run the app's startup check from the repo root with `cargo run -p test-framework -- apps/space`.
