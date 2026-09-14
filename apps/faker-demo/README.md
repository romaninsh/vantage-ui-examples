# PristineGym — the faker demo

A Vantage app with **no backend at all**: every table is generated in memory by the
`faker` datasource, and most of them keep moving on their own. Nothing to install, nothing
to connect, nothing survives a restart — that is the point. Use it to see what a live
Vantage page looks like, and to watch how the UI behaves against backends that are slow,
flaky or churning.

The pages are deliberately independent; each shows one thing.

## Live Ops

- **Command Centre** — a `pulse` sim: eleven regions whose headcounts drift around a
  baseline, one of them dropping offline now and then. Stat tiles read aggregates declared
  on the table, the donut and its legend share one sorted observation, the arrivals bars
  grow through the current minute, and the feed shows every movement as it lands. Nothing
  on this page polls.
- **Regions** and **Live Feed** — the same sim as plain grids: the aggregate (rows updated
  in place) and the raw stream (rows arriving and expiring).
- **Check-ins** — the `fifo` effect: a new row every second, each gone again 20–35 seconds
  later. The grid animates arrivals and departures with no refresh configured.
- **Log Finder** — the `live_folder` effect: a log tree that grows every second, browsed
  with the finder component. Folder sizes are lifted in lazily through an `augment:`.

## Incidents

The `rhai` effect: a script runs every two seconds, raising incidents, ageing the open ones
and escalating their severity when nobody acknowledges them. The page is a full binder —
Add, Details, Delete, filters — plus *Acknowledge*, *Resolve* and *Reopen* row actions.
Your edits and the script's edits land in the same store, so an incident you acknowledge
stops escalating and one you reopen starts ageing again.

## Lab

One page per backend personality. Each opens with what it simulates and what to try.

- **Scope & wiring** — how template holes, named outputs, profiles, view mounts and `when:`
  gates connect components on a page.
- **Flaky backend** — one read in five fails, ten seconds offline every minute, a total
  that lies, page boundaries that shift.
- **Sluggish backend** — every read takes 0.8–2.5 s, pages of 50, read-only, one odd text
  cell in ten.
- **Slow search** — 50,000 rows whose server-side search answers late and out of order.
- **Revolving rows** — one row deleted and one inserted twice a second, under your
  selection.

All of these are the same seeded data with a different `faker.shape`, so every difference
on screen comes from the backend's behaviour.

## Profiles

`application.yaml` declares `dev` and `prod` profiles. Start with `VANTAGE_PROFILE=prod`
and the banner on the Command Centre changes — the pages read the profile's `motd` value.
