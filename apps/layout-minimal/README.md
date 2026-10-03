# Meridian Ops Board — the minimal layout

A small Vantage app that shows off the **minimal window layout**: one title row and a live
flight board filling the rest of the window. All the data comes from `faker` datasources, so
there is nothing to install or connect.

## What to look at

- **One title row.** `layout/minimal.yaml` has no sidebar. The title bar holds the app name,
  a small project icon, a page selector listing `menu/left.yaml`, the tray and the tools.
- **The tray.** The "fake data" banner folds into a ghost icon in the tray: hover it for a
  short card, click it to connect your own data. About is a tray link that opens this file in
  a modal.
- **A live fleet.** `datasource/flights.yaml` runs `builtin:flight`: about 200 aircraft in
  the air on a 10× clock. Flights board, take off, cruise and land; landed rows stop changing
  and leave a minute later.
- **The board.** Departures first, then flights in the air by progress. Phase and delay colour
  the text, progress is a bar, and departure and ETA read as "in 12 min", ticking over.
- **The drawer.** Click a flight: a compact panel under the grid shows all its details. Arrow
  keys move through flights and the panel follows; drag its edge to resize it.

## Pages

- **Flights**: the live board.
- **Dashboard**: live counts from the flight table, and the ops event count.
- **Ops Feed**: a stream of gate, delay and boarding updates that come and go on their own.
- **Airports**: a small reference table.
- **About**: this file, from the tray.
