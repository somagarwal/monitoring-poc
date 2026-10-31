import { services } from '../packages/shared/src/index.js';
import { PostgresStore } from '../apps/api/src/store.js';
import { seedService } from '../apps/api/src/seed.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
for (const name of services) {
  const store = new PostgresStore(process.env.DATABASE_URL, name);
  try {
    await seedService(name, store);
  } finally {
    await store.close();
  }
}
console.log('Demo data ready. Password for all demo accounts: Demo123!');
