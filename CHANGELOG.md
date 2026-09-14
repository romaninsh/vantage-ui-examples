# Changelog

Notable changes to the Vantage UI example apps.

## Unreleased

### Changed

- **Bakery becomes "Breg"** — renamed to `apps/breg-bakery/` (slug
  `breg-bakery`), and reworked into a live real-time demo of Vantage 0.40's
  container composer: Vantage starts SurrealDB itself from
  `composer.yaml` (nonroot, named volume, ephemeral loopback port; the
  datasource names the service and Vantage resolves the port).
  - A setup wizard seeds the catalog inside the composer stack — no host
    python or surreal CLI needed; the seed image carries both.
  - ✨ magic processes as background jobs: **promotion** (an ad campaign
    signs clients live, then invoices and — sometimes — collects),
    **restock** (an animated oven that refills the emptiest shelves) and
    **chase** (works the aged-debt list); stop any of them from the
    Services sheet.
  - A live dashboard: 30-second revenue bars, stock & sales stacked per
    product, latest orders / owed / low-stock tiles — all narrowed by a
    bakery dropdown, with branch subtitles on the "All bakeries" view.
  - Writers touch `client.deps_last_updated` after orders, invoices and
    payments, so read-computed balances refresh through the live feed.

### Added

- **Periscope** — a new example app (`apps/periscope/`): a Lens-style Kubernetes
  control room rendered entirely from YAML over the native `vantage-kubernetes`
  datasource (no `kubectl`, no proxy).
  - 12 resource tables — nodes, namespaces, pods, deployments, replicasets,
    services, configmaps, secrets, jobs, events, plus live `node_metrics` /
    `pod_metrics`.
  - Relations both ways: `references:` drill-downs (namespace → its eight child
    kinds; node → pods; deployment → replicasets → pods) and belongs-to links
    that turn namespace / node / owner cells into drill-ups.
  - Two dashboards (`overview`, `usage`) with a Namespace control, three custom
    Summary `view`s, `binder` relation-tab pages, and `burger` vertical-drill
    explorers.
  - Registered in `catalog.yaml` (status `coming` until a Vantage UI build ships
    the `vantage-kubernetes` backend).
