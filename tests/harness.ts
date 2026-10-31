import type { FastifyInstance, InjectOptions } from 'fastify';
import { vi } from 'vitest';
import { createApp } from '../apps/api/src/app.js';
import { ApiError } from '../apps/api/src/domain.js';
import { MemoryStore } from '../apps/api/src/store.js';
import { seedService } from '../apps/api/src/seed.js';
import { services, type ServiceName } from '../packages/shared/src/index.js';
import type { Call } from '../apps/api/src/client.js';
export const token = 'test-internal-token-123';
export async function unit(name: ServiceName) {
  const store = new MemoryStore();
  await seedService(name, store);
  const call = vi.fn<Call>().mockResolvedValue({});
  const app = await createApp(name, { store, call: call as Call, token });
  return {
    app,
    store,
    call,
    request: (method: InjectOptions['method'], url: string, body?: unknown) =>
      app.inject({
        method,
        url,
        headers: { 'x-internal-token': token },
        ...(body === undefined ? {} : { payload: body as any }),
      }),
  };
}
export async function cluster() {
  const apps = {} as Record<ServiceName, FastifyInstance>;
  const stores = {} as Record<ServiceName, MemoryStore>;
  const call: Call = async <T>(
    service: ServiceName,
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> => {
    const res = await apps[service].inject({
      method: method as any,
      url: path,
      headers: { 'x-internal-token': token },
      ...(body === undefined ? {} : { payload: body as any }),
    });
    const result = res.json();
    if (res.statusCode >= 400) throw new ApiError(res.statusCode, result.message);
    return result as T;
  };
  for (const name of services) {
    stores[name] = new MemoryStore();
    await seedService(name, stores[name]);
    apps[name] = await createApp(name, { store: stores[name], call, token });
  }
  return {
    apps,
    stores,
    call,
    close: () => Promise.all(Object.values(apps).map((app) => app.close())),
  };
}
