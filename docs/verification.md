# Verification — 31 October 2026

Completed locally in this workspace:

| Check                                                                  | Result                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Unit, component, service-flow, and real PostgreSQL tests               | 192 passed                                                                 |
| Application statement coverage                                         | 94.15%                                                                     |
| Application branch coverage                                            | 88.61%                                                                     |
| Application function coverage                                          | 87.90%                                                                     |
| Application line coverage                                              | 94.08%                                                                     |
| Playwright scenarios with independent HTTP service processes           | 6 passed                                                                   |
| Same Playwright scenarios against deployed Kubernetes/Nginx/PostgreSQL | 6 passed                                                                   |
| ESLint, TypeScript, formatting, production build                       | Passed                                                                     |
| npm dependency audit                                                   | 0 vulnerabilities at verification time                                     |
| API and frontend Docker builds                                         | Passed on Node.js 24 / ARM64                                               |
| kind deployment                                                        | 20 backend Deployments and frontend ready; PostgreSQL ready                |
| Migration and seed Jobs                                                | Completed; redeployment preserved data                                     |
| Kubernetes checkout idempotency                                        | Same key returned the original paid order                                  |
| PostgreSQL pod restart                                                 | Paid order persisted; application containers did not restart               |
| Notification outage plus checkout restart                              | Paid intent resumed from PostgreSQL; no duplicate order or stock deduction |

The PostgreSQL integration suite includes an actual termination of idle database connections and verifies that the application pool reconnects without an uncaught error. The Kubernetes test checks container restart counts around a database restart.

The application is left running in the dedicated Colima profile and kind cluster `little-market`. The user-facing port-forward for this session is **http://127.0.0.1:8180**; port 8080 was already occupied by another local application. If the port-forward stops, restart it:

```bash
KUBECONFIG=.local/kubeconfig kubectl --context kind-little-market \
  -n little-market port-forward --address 127.0.0.1 service/frontend 8180:8080
```

Tests have left synthetic purchases, profile changes, audit entries, and a product price/stock edit in the demo database so those screens have data to explore. Use the README's explicit reset command if you want the original seed dataset. The temporary standalone database-test container was removed after verification.

The configured GitHub Actions workflows have not been run remotely. No cloud cluster was accessed or changed, and no hosted website was published. Production-grade security, database HA, real integrations, and a full telemetry stack remain outside the agreed test scope.
