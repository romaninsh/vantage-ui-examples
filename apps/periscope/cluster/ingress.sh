#!/usr/bin/env bash
# Deploy (or update) the Periscope demo workloads into the `demo` namespace via
# Helm. Idempotent — re-run after editing chart/values.yaml to roll out changes.
# These are the rows Periscope browses: a 3-replica nginx Deployment (+ Service),
# a two-container sidecar Pod, a short-lived Job, and a ConfigMap + Secret.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NAMESPACE="${FIXTURE_NAMESPACE:-demo}"
RELEASE="periscope-demo"

if ! command -v helm >/dev/null 2>&1; then
  echo "Error: helm is not installed. See https://helm.sh/docs/intro/install/" >&2
  exit 1
fi

echo "Deploying demo workloads (release: $RELEASE, namespace: $NAMESPACE)..."
helm upgrade --install "$RELEASE" "$SCRIPT_DIR/chart" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --wait \
  --timeout 120s

echo "Waiting for the web deployment to be available..."
kubectl rollout status deployment/web --namespace "$NAMESPACE" --timeout=120s

echo "✅ demo workloads deployed in namespace '$NAMESPACE'."
echo "   Open Periscope against apps/periscope/inventory (it defaults to this namespace)."
