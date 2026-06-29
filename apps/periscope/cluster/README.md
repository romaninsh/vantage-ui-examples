# Periscope demo cluster

Periscope browses a **real** Kubernetes cluster — so to try it you need one. This
folder spins up a throwaway local cluster (minikube) and seeds it with the demo
workloads Periscope expects, the same way `vantage-kubernetes` is exercised in CI.

## Prerequisites

- [minikube](https://minikube.sigs.k8s.io/docs/start/)
- [Helm](https://helm.sh/docs/intro/install/)
- `kubectl`

## Spin it up

```sh
cd apps/periscope/cluster
./start.sh      # start minikube (profile "vantage") + metrics-server, wait Ready
./ingress.sh    # deploy the demo workloads into the `demo` namespace via Helm
```

That gives you, in namespace `demo`:

- a 3-replica **nginx** Deployment (`web`) + its Service, ReplicaSet and pods,
- a two-container **`sidecar`** Pod (ready `2/2`),
- a short-lived **`pi`** Job,
- a **`demo-config`** ConfigMap and a **`demo-secret`** Secret.

`start.sh` sets your current kubectl context to `vantage`, and the Periscope
datasource (`../inventory/datasource/cluster.yaml`) uses the current context with
`namespace: demo` — so it connects with no extra config. Point any other cluster
you can reach with `kubectl` at it the same way.

## Change or tear down

```sh
# edit chart/values.yaml (e.g. web.replicas) then re-apply:
./ingress.sh
# when done:
./stop.sh       # minikube delete
```
