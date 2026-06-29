#!/usr/bin/env bash
# Spin up a local minikube cluster for the Periscope demo: start the node,
# enable metrics-server (so the `usage` dashboard has live CPU/memory), point
# kubectl at it, and wait until it's Ready. Then seed it with ./ingress.sh.
#
# Mirrors how vantage-kubernetes is exercised in CI
# (.github/workflows/kubernetes.yaml in the vantage repo): minikube +
# metrics-server, fixtures via Helm.
set -euo pipefail

PROFILE="${MINIKUBE_PROFILE:-vantage}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v minikube >/dev/null 2>&1; then
  echo "Error: minikube is not installed. See https://minikube.sigs.k8s.io/docs/start/" >&2
  exit 1
fi

echo "Starting minikube (profile: $PROFILE)..."
minikube start --profile "$PROFILE"

echo "Enabling metrics-server addon (for live CPU/memory)..."
minikube addons enable metrics-server --profile "$PROFILE"

echo "Pointing kubectl at the '$PROFILE' context..."
kubectl config use-context "$PROFILE"

echo "Waiting for the node to be Ready..."
kubectl wait --for=condition=Ready node --all --timeout=120s

echo "✅ minikube is up. Seed the demo workloads with: $SCRIPT_DIR/ingress.sh"
