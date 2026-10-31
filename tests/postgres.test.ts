import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { PostgresStore } from '../apps/api/src/store.js';
const url = process.env.TEST_DATABASE_URL;
const password = 'test-service-password-123456';
let store: PostgresStore;
let peer: PostgresStore;
let db: pg.Client;
describe.skipIf(!url)('PostgreSQL adapter and service schema isolation', () => {
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.pathname !== '/market_test')
      throw Error('Database integration tests require a dedicated market_test database');
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {
      env: { ...process.env, DATABASE_URL: url!, DATABASE_PASSWORD: password },
      stdio: 'pipe',
    });
    db = new pg.Client({ connectionString: url });
    await db.connect();
    await db.query('TRUNCATE auth.records, catalog.records');
    const scoped = new URL(url!);
    scoped.username = 'market_auth';
    scoped.password = password;
    store = new PostgresStore(scoped.toString(), 'auth');
    peer = new PostgresStore(scoped.toString(), 'auth');
  });
  afterAll(async () => {
    await store?.close();
    await peer?.close();
    await db?.end();
  });
  it('persists JSON records across separate connections', async () => {
    await store.put('test', 'a', { nested: { value: 2 } });
    expect(await peer.get('test', 'a')).toEqual({ nested: { value: 2 } });
  });
  it('lists and removes only the requested collection', async () => {
    await store.put('isolated', '1', { id: '1' });
    expect(await store.list('isolated')).toEqual([{ id: '1' }]);
    await store.remove('isolated', '1');
    expect(await store.list('isolated')).toEqual([]);
  });
  it('rolls back writes when the transaction fails', async () => {
    await store.put('test', 'rollback', 1);
    await expect(
      store.transaction('rollback', async (tx) => {
        await tx.put('test', 'rollback', 2);
        throw Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await peer.get('test', 'rollback')).toBe(1);
  });
  it('serializes concurrent transactions across independent pools', async () => {
    await store.put('test', 'counter', 0);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? store : peer).transaction('counter', async (tx) => {
          const value = await tx.get<number>('test', 'counter');
          await tx.put('test', 'counter', value! + 1);
        }),
      ),
    );
    expect(await store.get('test', 'counter')).toBe(20);
  });
  it('supports nested transaction operations within the existing transaction', async () => {
    await store.transaction('nested', async (tx) =>
      tx.transaction('nested', async (inner) => inner.put('test', 'nested', true)),
    );
    expect(await store.get('test', 'nested')).toBe(true);
  });
  it('checks readiness with the service role', async () => {
    await expect(store.ping()).resolves.toBeUndefined();
  });
  it('denies cross-service schema reads', async () => {
    const scoped = new URL(url!);
    scoped.username = 'market_auth';
    scoped.password = password;
    const client = new pg.Client({ connectionString: scoped.toString() });
    await client.connect();
    try {
      await expect(client.query('SELECT * FROM catalog.records')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.end();
    }
  });
  it('survives idle connections being terminated and reconnects', async () => {
    await store.ping();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await db.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='market_auth' AND datname='market_test'",
      );
      await expect.poll(() => log.mock.calls.length).toBeGreaterThan(0);
      await expect
        .poll(async () => {
          try {
            await store.ping();
            return true;
          } catch {
            return false;
          }
        })
        .toBe(true);
      expect(log.mock.calls.flat().join(' ')).not.toContain(password);
    } finally {
      log.mockRestore();
    }
  });
  it('rejects unsafe schema names', () =>
    expect(() => new PostgresStore(url!, 'auth; DROP TABLE records')).toThrow('Invalid schema'));
});
