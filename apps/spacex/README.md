# SpaceX — a public GraphQL API as a console

Every table here is one root field of the community SpaceX GraphQL mirror at
`spacex-api.fly.dev`. Vantage builds the query document from the table's columns, sends
one request per table, and treats the result as a read-only grid. Nothing is cached
between runs and nothing can be written: the API is public and best-effort, so if a page
stays empty the mirror is probably down.

## What to look at

- **Overview** — stat tiles and charts from `aggregates:` declared on the tables. A GraphQL
  datasource has no query tables, but each root field returns its whole result in one
  request, so reductions over the loaded rows are exact here.
- **Launches** — a year picker. Its value becomes `launches(find: {launch_year: "2018"})`:
  the filter is pushed to the server, and only that year's rows cross the wire. Nested
  objects (`rocket.rocket_name`, `launch_site.site_name`) show as dotted columns.
- **Rockets, Capsules, Cores, Programmes, Payloads, Launchpads, Ships** — each has a
  *Launches* tab. The relation key (`rocket_id`, `cap_serial`, `core_serial`, `mission_id`,
  `payload_id`, `site_id`, `ship`) is a key of the API's `LaunchFind` input, so the tab
  narrows server-side too.
- **Dragons** and **Landpads** have no relations: their root fields take no `find:`
  argument, and no launch filter names them. They are flat grids.

## What the API does not allow

- Only equality filters, and only on root fields that accept `find:`. `rockets`,
  `dragons`, `landpads` and `launchpads` do not — those tables carry `graphql: { filter:
  false }`, so any narrowing happens on the loaded rows.
- No server-side sort or search: the grids sort and search what they loaded.
- No writes: the binders show no Add or Delete, and the Details tab is read-only.

Run the app's startup check from the repo root with `cargo run -p test-framework -- apps/spacex`.
