# Faker Demo

The smallest possible **live** Vantage app — no backend, no network.

It uses the `faker` datasource (from the `vantage-faker` crate): rows are
generated in memory from each column's name, and the `fifo` effect keeps the
data moving — a new `events` row appears every second (newest on top) and
expires 8–15 seconds later. The grid animates the inserts and removals with no
extra wiring, because a faker delta bumps the Diorama scenery generation the grid
already redraws on. It's the GPUI counterpart of the `vantage-faker`
`scenery_cli` example.

Shape of the inventory:

- a **faker datasource** (`datasource/faker.yaml`), `effect: fifo`;
- one **table** (`events`) with id + name-aware columns (first_name, email,
  city, amount);
- a **page** rendering it as a grid, wired into the **menu**.

To try a static (non-moving) table instead, add a table with
`faker: { effect: static, count: 20 }`.
