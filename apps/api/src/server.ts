import { services, type ServiceName } from '../../../packages/shared/src/index.js';
import { createApp, recoverCheckouts } from './app.js';
import { createClient } from './client.js';
import { PostgresStore } from './store.js';
const name = process.env.SERVICE_NAME as ServiceName;
if (!services.includes(name)) throw new Error('Set SERVICE_NAME to a supported service');
const token = process.env.INTERNAL_TOKEN;
if (!token || token.length < 16)
  throw new Error('INTERNAL_TOKEN must contain at least 16 characters');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const ctx = {
  store: new PostgresStore(process.env.DATABASE_URL, name),
  call: createClient(token),
  token,
};
const app = await createApp(name, ctx, true);
await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' });
let recovering = false;
const timer =
  name === 'checkout'
    ? setInterval(async () => {
        if (recovering) return;
        recovering = true;
        try {
          await recoverCheckouts(ctx);
        } catch (e) {
          app.log.error(e);
        } finally {
          recovering = false;
        }
      }, 15000)
    : undefined;
const stop = async () => {
  if (timer) clearInterval(timer);
  await app.close();
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
