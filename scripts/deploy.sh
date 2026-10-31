#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local
export KUBECONFIG="$PWD/.local/kubeconfig"
for tool in docker kubectl kind; do command -v "$tool" >/dev/null || { echo "Install $tool first."; exit 1; }; done
docker info >/dev/null
if ! kind get clusters | grep -qx little-market; then kind create cluster --config deploy/kind.yaml; fi
context=kind-little-market
# Every kubectl operation explicitly targets the local kind cluster.
k() { kubectl --context "$context" "$@"; }
docker build -t little-market-api:dev -f apps/api/Dockerfile .
docker build -t little-market-web:dev -f apps/web/Dockerfile .
kind load docker-image little-market-api:dev little-market-web:dev --name little-market
k apply -f deploy/base/namespace.yaml
if ! k -n little-market get secret market-secrets >/dev/null 2>&1; then
  mkdir -p .local
  node scripts/secrets.mjs
  k -n little-market create secret generic market-secrets --from-env-file=.local/secrets.env
fi
k -n little-market apply -f deploy/base/postgres.yaml
k -n little-market rollout status statefulset/postgres --timeout=180s
for job in migrate seed; do
  k -n little-market delete job "market-$job" --ignore-not-found
  k apply -f "deploy/$job.yaml"
  if ! k -n little-market wait --for=condition=complete "job/market-$job" --timeout=180s; then
    k -n little-market logs "job/market-$job"; exit 1
  fi
done
k apply -k deploy/local
# The local :dev tag is reused; restart to pick up images on subsequent deploys.
k -n little-market rollout restart deployment
k -n little-market rollout status deployment --timeout=240s
echo 'Ready: KUBECONFIG=.local/kubeconfig kubectl --context kind-little-market -n little-market port-forward service/frontend 8080:8080'
