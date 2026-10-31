# Little Market

A deliberately small React/Node.js store for functional testing with **15 UI pages, 20 separately deployed backend services, and PostgreSQL**. Payment, shipping, and notifications are simulated. This is a local test application with synthetic accounts and data.

## Start with Kubernetes

Requirements: Node.js 24+, npm, Docker with a running Linux container runtime, kubectl, and kind. Allocate about 4 CPUs and 8 GiB RAM to Docker. Internet access is needed for the first dependency and container downloads.

```bash
npm ci
npm run k8s:deploy
KUBECONFIG=.local/kubeconfig kubectl --context kind-little-market \
  -n little-market port-forward service/frontend 8080:8080
```

Open **http://localhost:8080**. The deployment script creates a kind cluster named `little-market`, builds and loads both images, generates local Secrets, waits for PostgreSQL, runs migrations and seeds, and rolls out all services. It uses a repository-local kubeconfig: your current cloud cluster context is not used or changed.

If using Colima on macOS:

```bash
colima start --profile little-market --cpu 4 --memory 8 --disk 30
export DOCKER_CONTEXT=colima-little-market
npm run k8s:deploy
```

For this workspace, if kind was downloaded into `.local/bin`, prepend it to PATH: `export PATH="$PWD/.local/bin:$PATH"`.

Run `bash scripts/k8s-smoke.sh` to purchase through the deployed frontend, repeat the same checkout key, restart the local database pod, and verify the paid order persisted without restarting backend processes. It also temporarily stops notifications and restarts checkout to verify persisted recovery. This modifies demo data and changes only workloads in the local test namespace.

## Demo accounts

| Role           | Email                 | Password |
| -------------- | --------------------- | -------- |
| Shopper        | shopper@little.market | Demo123! |
| Second shopper | sam@little.market     | Demo123! |
| Administrator  | admin@little.market   | Demo123! |

The first shopper has a shipping address. Other accounts can add one. Coupon **WELCOME10** gives 10% off the product subtotal. Shipping is $5; tax is zero; prices use USD integer cents. Checkout has approval/decline controls and never accepts real card information.

## Development and tests

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npx playwright install chromium
npm run test:e2e
```

The default test run uses isolated in-memory stores, including tests of real Fastify routes and cross-service workflows. The Playwright runner starts all 20 HTTP services and Vite with synthetic in-memory data; these test processes stop when the runner finishes. Use `PLAYWRIGHT_CHROME=true npm run test:e2e` to use an installed Google Chrome instead of downloading Chromium.

Unit and component tests cover every service and every page, including validation, business rules, ownership, permissions, errors, and interactions. Coverage floors are enforced: 85% statements, 80% branches, 75% functions, and 85% lines. PostgreSQL tests exercise persistence, advisory locking, rollback, and schema-role isolation against a dedicated database.

To run the database tests independently:

```bash
docker run -d --name little-market-db-test \
  -e POSTGRES_DB=market_test -e POSTGRES_PASSWORD=test-postgres-password \
  -p 127.0.0.1:55432:5432 postgres:18-alpine
# Wait until: docker exec little-market-db-test pg_isready -U postgres -d market_test
TEST_DATABASE_URL=postgres://postgres:test-postgres-password@localhost:55432/market_test \
  npm run test:db
```

The integration suite refuses database names other than `market_test`. It migrates and truncates its test schemas. When `TEST_DATABASE_URL` is absent, database integration cases are explicitly skipped. CI supplies a real PostgreSQL database, runs all checks and browser tests, builds both images, and has a separate kind deployment/persistence smoke job.

To exercise the browser suite against the Kubernetes deployment instead of the memory fixture:

```bash
E2E_BASE_URL=http://127.0.0.1:8080 npm run test:e2e
```

This suite changes products, stock, account information, and orders. Run it against disposable demo data; tests can be rerun but are not a production verification suite.

For local development with PostgreSQL, create a `market` database and copy `.env.example` to `.env`. Replace the example credentials with local values; `DATABASE_URL` must initially use the database administrator role. Node 24+ supports loading this file:

```bash
node --env-file=.env --import tsx scripts/migrate.ts
node --env-file=.env --import tsx scripts/seed.ts
npm run dev
```

Open http://localhost:5173. Dev starts each backend on ports 4100–4119. Each service connects using its own database role; the admin URL is only used by migrations and seeds. For a disposable browser-only demo without PostgreSQL, run `node --import tsx scripts/demo.mjs` and, in another terminal, `npm run dev -w @market/web`. Its state is lost when stopped.

## Pages and service boundaries

| Pages                                                | Functional behavior                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| Home, catalog/search, product details                | Browse categories, search, prices, stock, reviews, recommendations    |
| Wishlist, cart                                       | Persist favorites, adjust quantities, remove items                    |
| Checkout, confirmation                               | Apply coupons, choose address, simulate payment, show result          |
| Login, profile, addresses                            | Session authentication and account details                            |
| Order history, order details/tracking, notifications | See purchases, shipment status, mark notifications read               |
| Admin products/inventory, admin orders               | Add/edit/hide products, set prices/stock, update shipping, view audit |

| Service         | Responsibility                                                |
| --------------- | ------------------------------------------------------------- |
| gateway         | Public `/api/v1` endpoints, session enforcement, aggregation  |
| auth            | Salted password hashes and opaque 24-hour sessions            |
| profile         | Shopper display names                                         |
| address         | Service-owned address records                                 |
| catalog         | Product descriptions, category references, visibility         |
| category        | Seeded category list                                          |
| search          | Case-insensitive catalog filtering through its API            |
| inventory       | Serialized stock updates and reservations                     |
| pricing         | Authoritative integer-cent prices                             |
| cart            | Shopper quantities and idempotent purchased-item removal      |
| wishlist        | Deduplicated saved product IDs                                |
| reviews         | One rating/comment per shopper and product                    |
| promotions      | Seeded coupon validation                                      |
| checkout        | Persisted purchase coordination and recovery                  |
| orders          | Immutable-at-purchase item/address snapshots and order status |
| payments        | Idempotent simulated approval, decline and internal refund    |
| shipping        | Flat quote and simulated shipment status/tracking             |
| notifications   | Idempotent in-app messages                                    |
| recommendations | Related products by category                                  |
| audit           | Administrative and checkout activity                          |

See [architecture and failure behavior](docs/architecture.md) for implementation details and [API guide](docs/api.md) for public contracts.

## Operations

```bash
# Inspect the isolated local deployment
KUBECONFIG=.local/kubeconfig kubectl -n little-market get deployments,pods,services,pvc
KUBECONFIG=.local/kubeconfig kubectl -n little-market logs deployment/checkout --tail=100
KUBECONFIG=.local/kubeconfig kubectl -n little-market logs job/market-migrate

# Render manifests without deploying
npm run k8s:render

# Redeploy after changes; ordinary deployments preserve data
npm run k8s:deploy
```

Secrets are created once and reused. A local generated copy lives in ignored `.local/secrets.env` with restrictive permissions. Do not commit it. Seed jobs add the demo dataset only once per service. Product edits and purchases therefore survive redeployment. The application pods do not receive the administrator database password.

If pods are not ready, inspect the pod events and migration Job logs. `ImagePullBackOff` usually means kind images were not loaded. Database connection failures commonly mean the migration Job failed or Secrets no longer match the persisted database. Do not regenerate credentials while reusing a volume without rotating the corresponding database passwords.

An explicit destructive reset is available for this local demo only:

```bash
bash scripts/reset-demo.sh --confirm-delete-demo-data
```

This deletes the local `little-market` namespace and its stored data, then deploys and seeds again. To remove the entire local cluster, use `KUBECONFIG=.local/kubeconfig kind delete cluster --name little-market`.

The manifests are portable Kubernetes resources, but the deployment script targets kind. For another cluster, publish the two images to your registry, replace image references, supply Secrets, choose a StorageClass, and run migration/seed Jobs before rollout. Cloud ingress, TLS, high availability, external integrations, and production hardening are outside this test build.

See [recorded verification results](docs/verification.md) for the checks completed during the initial build and this workspace's running URL.

### Share with another device on the same Wi-Fi

Use your Mac's current LAN IP (on macOS, `ipconfig getifaddr en0`). Keep this command running, replacing the example IP if it changes:

```bash
KUBECONFIG=.local/kubeconfig kubectl --context kind-little-market \
  -n little-market port-forward --address 127.0.0.1,192.168.1.105 \
  service/frontend 8180:8080
```

Open **http://192.168.1.105:8180/** on the other device, using HTTP. The same address serves the UI, static assets, and API. If the port is already in use by an existing frontend port-forward, use that running forward rather than starting a duplicate. A frontend pod rollout requires restarting the port-forward.

Checkout supports plain-HTTP LAN origins: it uses cryptographic `getRandomValues` when the browser does not expose the secure-context-only `randomUUID` API. If an old checkout page stays blank after updating, refresh it to load the new frontend bundle. For connection errors before the page loads, check macOS Firewall, VPN settings, and Wi-Fi client isolation.
