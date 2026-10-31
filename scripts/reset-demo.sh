#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" != "--confirm-delete-demo-data" ]]; then
  echo 'This deletes all Little Market data in the local kind cluster.'
  echo 'Run: bash scripts/reset-demo.sh --confirm-delete-demo-data'
  exit 1
fi
KUBECONFIG=.local/kubeconfig kubectl --context kind-little-market delete namespace little-market --wait=true
bash scripts/deploy.sh
