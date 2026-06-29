# Changelog

Notable changes to the Vantage UI example apps.

## Unreleased

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
