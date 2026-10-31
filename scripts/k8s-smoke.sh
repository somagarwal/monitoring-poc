#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export KUBECONFIG="$PWD/.local/kubeconfig"
k() { kubectl --context kind-little-market -n little-market "$@"; }
k rollout status deployment --timeout=180s
k port-forward service/frontend 18080:8080 > .local/smoke-port-forward.log 2>&1 &
forward_pid=$!
restore_notifications=false
cleanup() {
  kill "$forward_pid" 2>/dev/null || true
  if [[ "$restore_notifications" == true ]]; then k scale deployment/notifications --replicas=1 >/dev/null; fi
}
trap cleanup EXIT
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:18080/api/v1/categories >/dev/null 2>&1; then break; fi
  sleep 1
done
node scripts/http-smoke.mjs http://127.0.0.1:18080
# Restart the DB pod while preserving its volume; verify the paid order survived.
before_restarts=$(k get pods -l 'app,app!=postgres' -o jsonpath='{range .items[*]}{.metadata.name}:{.status.containerStatuses[0].restartCount}{"\n"}{end}' | sort)
k delete pod postgres-0 --wait=true
k rollout status statefulset/postgres --timeout=180s
for attempt in {1..30}; do
  if node scripts/http-smoke.mjs http://127.0.0.1:18080 --verify-persistence; then break; fi
  if [[ "$attempt" == 30 ]]; then exit 1; fi
  sleep 2
done
k wait --for=condition=Ready pods -l 'app,app!=postgres' --timeout=120s >/dev/null
after_restarts=$(k get pods -l 'app,app!=postgres' -o jsonpath='{range .items[*]}{.metadata.name}:{.status.containerStatuses[0].restartCount}{"\n"}{end}' | sort)
[[ "$before_restarts" == "$after_restarts" ]] || { echo 'Backend pods restarted during database outage'; exit 1; }
echo 'Kubernetes shopping and database persistence checks passed; application pods did not restart.'

# Prove an interrupted paid checkout resumes from PostgreSQL after its process restarts.
restore_notifications=true
k scale deployment/notifications --replicas=0
k rollout status deployment/notifications --timeout=120s
node scripts/http-recovery.mjs http://127.0.0.1:18080 --begin
k rollout restart deployment/checkout
k rollout status deployment/checkout --timeout=120s
k scale deployment/notifications --replicas=1
k rollout status deployment/notifications --timeout=120s
restore_notifications=false
for attempt in {1..30}; do
  if node scripts/http-recovery.mjs http://127.0.0.1:18080 --verify; then break; fi
  if [[ "$attempt" == 30 ]]; then exit 1; fi
  sleep 2
done
echo 'Persisted checkout recovery check passed.'
