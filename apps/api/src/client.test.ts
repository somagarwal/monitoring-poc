import { afterEach, it, expect, vi } from 'vitest';
import { createClient, serviceUrl } from './client.js';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('uses Kubernetes DNS or local service ports', () => {
  vi.stubEnv('LOCAL_SERVICES', 'false');
  expect(serviceUrl('auth')).toBe('http://auth:4000');
  vi.stubEnv('LOCAL_SERVICES', 'true');
  expect(serviceUrl('auth')).toBe('http://127.0.0.1:4101');
});
it('sends internal credentials and returns JSON', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a' }) });
  vi.stubGlobal('fetch', fetch);
  expect(await createClient('token')('auth', '/login', 'POST', { email: 'test' })).toEqual({
    id: 'a',
  });
  expect(fetch.mock.calls[0][1].headers['x-internal-token']).toBe('token');
});
it('turns connection failures into service-unavailable errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
  await expect(createClient('token')('auth', '/login')).rejects.toMatchObject({ statusCode: 503 });
});
it('propagates validation errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'Bad input' }) }),
  );
  await expect(createClient('token')('auth', '/login')).rejects.toThrow('Bad input');
});

it('does not label bodyless requests as JSON', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', fetch);
  await createClient('token')('inventory', '/reservations/a/commit', 'POST');
  expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('content-type');
  expect(fetch.mock.calls[0][1].body).toBeUndefined();
});
