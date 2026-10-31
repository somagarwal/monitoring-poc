// In-memory demo for browser smoke tests only; normal dev and Kubernetes use PostgreSQL.
import { services } from '../packages/shared/src/index.ts';
import { createApp } from '../apps/api/src/app.ts';
import { MemoryStore } from '../apps/api/src/store.ts';
import { seedService } from '../apps/api/src/seed.ts';
import { createClient } from '../apps/api/src/client.ts';
process.env.LOCAL_SERVICES = 'true';
const token = 'test-internal-token-123';
const apps = [];
for (const [i, name] of services.entries()) {
  const store = new MemoryStore();
  await seedService(name, store);
  const app = await createApp(name, { store, call: createClient(token), token });
  await app.listen({ port: 4100 + i, host: '127.0.0.1' });
  apps.push(app);
}
console.log('In-memory test services ready');
const stop = async () => {
  await Promise.all(apps.map((app) => app.close()));
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
