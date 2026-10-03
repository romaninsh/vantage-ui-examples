# Northwind Logistics — a workbench layout

A small Vantage app laid out as a workbench: a booking desk on the left, one page in the
middle, and an inspector on the right. The data is a live simulation from the `faker`
datasource, so there is nothing to install or connect.

## What to look at

- **Parcels that move.** Two sims in `datasource/logistics.yaml` play the data. Each
  shipment is booked, picked up, driven across Europe in three to six legs, sent out for
  delivery and delivered. The whole trip takes three to six real minutes. Now and then a
  parcel hits an exception (a customs hold, a weather delay) and runs late. Each step adds a
  tracking scan. When you open the project, the title bar shows "warming fake data" for a
  moment while 20 hours of history replay, so the grid opens with parcels at every stage.
- **The desk.** `view/desk.yaml` fills the left panel. Book a shipment with the form: a
  toast confirms it, the form clears, and within a few seconds the dispatcher sim picks the
  new row up and starts moving it. Under the form are the eight latest bookings. Three live
  stats sit at the foot of the panel: parcels in transit, the total declared value, and
  parcels behind their ETA. Click any of them to open Tracking.
- **An inspector that follows your click.** Select a row on Shipments or Tracking, and
  `view/inspector.yaml` on the right shows that parcel: status, ETA, route, last scan,
  carrier, weight and declared value. The facts update as the parcel moves, and the panel
  doesn't reload between clicks. cmd-i hides it.
- **Relative dates and colour.** ETAs and booking times read "in 4 min" or "12 min ago" and
  keep ticking. Status is coloured by stage, delivered rows are dimmed, and exceptions and
  late parcels show in red.
- **A quiet title bar.** The page selector in the title bar replaces a sidebar menu. The
  tray next to it folds the fake-data banner into an icon and holds this About page.

## Pages

- **Shipments**: every parcel, newest booking first.
- **Tracking**: parcels still on their way, the soonest ETA first. Select one to open a
  drawer under the grid with its facts and its tracking scans.
- **About**: this file, in a modal from the title-bar tray.
