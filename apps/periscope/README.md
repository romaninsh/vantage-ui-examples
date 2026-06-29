# Periscope

A Lens-style control room for a Kubernetes cluster — built entirely from YAML on
top of the native **`vantage-kubernetes`** datasource. No `kubectl`, no
`kubectl proxy`: Vantage talks to the real Kubernetes API, flattens the nested
object JSON into typed rows, parses quantity strings (`"16331752Ki"`) into
numbers, and resolves owner/label relations server-side — so capacity charts
render real cores and bytes and drill-downs narrow to exactly the right pods.

> The name: a periscope is how a submarine sees the surface — and it beats a
> *Lens*. Kubernetes is Greek for *helmsman*, so the nautical optics fit.

## What it demonstrates

- **A native Kubernetes datasource** (`datasource/cluster.yaml`, `type: kubernetes`)
  — the current kubeconfig context or an in-cluster service account.
- **Every standard resource as a table** — nodes, namespaces, pods, deployments,
  replicasets, services, configmaps, secrets, jobs, events, plus live
  `node_metrics` / `pod_metrics` from `metrics.k8s.io`.
- **Relations both ways** — `references:` wire the drill-downs (a namespace fans
  out to eight child kinds; node → pods; deployment → replicasets → pods) while
  belongs-to references turn namespace / node / owner cells into drill-**up**
  links.
- **Two layouts** — `binder` pages auto-derive a tab per relation plus a custom
  **Summary view** (Nodes, Deployments, Pods); `burger` pages stack a vertical
  drill (Explorer: namespace → deployments → pods; Infrastructure: node → pods).
- **Dashboards** — `overview` (capacity per node, replicas, restarts) and
  `usage` (live CPU/memory from metrics-server), each with a Namespace control
  that re-scopes the namespaced charts.

## Layout

```
inventory/
├── application.yaml      # theme (Tokyo Night / Ayu Light)
├── datasource/cluster.yaml
├── table/                # 12 resource tables (+ relations)
├── view/                 # node_summary, deployment_summary, pod_summary
├── page/                 # 2 dashboards + binder/burger/list pages
└── menu/left.yaml        # grouped sidebar
```

## Running it

Periscope needs **two things**:

1. **A Vantage UI binary built with the `vantage-kubernetes` backend.** The
   published builds don't ship it yet, so build the sibling
   [`vantage-ui`](https://github.com/) checkout and point the harness at it:

   ```sh
   export VANTAGE_UI_BIN=/path/to/vantage-ui/target/debug/vantage-ui
   ```

2. **A reachable cluster.** Any context `kubectl` can hit works; the bundled
   demo fixtures (a 3-replica nginx Deployment, a sidecar Pod, a Job, a
   ConfigMap + Secret in namespace `demo`). Spin up a throwaway one with the
   bundled scripts (minikube + Helm):

   ```sh
   ./cluster/start.sh      # minikube + metrics-server, wait Ready
   ./cluster/ingress.sh    # seed the demo workloads via Helm
   ```

   See [`cluster/README.md`](cluster/README.md) for prerequisites and teardown.

Then open it:

```sh
"$VANTAGE_UI_BIN" apps/periscope/inventory
# or, headless catalog check via the BDD harness:
cargo run -p test-framework -- apps/periscope
```
