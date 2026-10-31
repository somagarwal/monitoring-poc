import { describe, it, expect } from 'vitest';
import { calculateQuote, hashPassword, verifyPassword } from './domain.js';
import { MemoryStore } from './store.js';
const item = { productId: 'a', name: 'A', unitPrice: 1001, quantity: 3, lineTotal: 0 };
describe('pricing rules', () => {
  it('calculates authoritative totals in cents with rounded-down discounts', () => {
    expect(calculateQuote([item], 10, 500)).toMatchObject({
      subtotal: 3003,
      discount: 300,
      shipping: 500,
      total: 3203,
      currency: 'USD',
      items: [{ lineTotal: 3003 }],
    });
  });
  it('handles no discount and free shipping', () => {
    expect(calculateQuote([item], 0, 0).total).toBe(3003);
  });
  it('handles a full discount', () => {
    expect(calculateQuote([item], 100, 500).total).toBe(500);
  });
  it('rejects empty carts', () => expect(() => calculateQuote([], 0, 500)).toThrow('empty'));
  it.each([-1, 101, 1.5])('rejects invalid discount %s', (n) =>
    expect(() => calculateQuote([item], n, 500)).toThrow('discount'),
  );
  it.each([0, -1, 100, 1.5])('rejects invalid quantity %s', (quantity) =>
    expect(() => calculateQuote([{ ...item, quantity }], 0, 500)).toThrow('quantity'),
  );
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid price %s', (unitPrice) =>
    expect(() => calculateQuote([{ ...item, unitPrice }], 0, 500)).toThrow('price'),
  );
});
describe('password security', () => {
  it('hashes with a unique salt', () => {
    expect(hashPassword('test')).not.toBe(hashPassword('test'));
  });
  it('accepts the correct password', () => {
    expect(verifyPassword('Demo123!', hashPassword('Demo123!'))).toBe(true);
  });
  it('rejects incorrect passwords', () => {
    expect(verifyPassword('wrong', hashPassword('right'))).toBe(false);
  });
  it.each(['broken', 'salt:00'])('rejects malformed hashes %s', (hash) =>
    expect(verifyPassword('test', hash)).toBe(false),
  );
});
describe('in-memory transactional test adapter', () => {
  it('rolls back failed transactions', async () => {
    const s = new MemoryStore();
    await s.put('a', '1', { v: 1 });
    await expect(
      s.transaction('a', async (tx) => {
        await tx.put('a', '1', { v: 2 });
        throw Error('fail');
      }),
    ).rejects.toThrow();
    expect(await s.get('a', '1')).toEqual({ v: 1 });
  });
  it('serializes concurrent writes', async () => {
    const s = new MemoryStore();
    await s.put('a', '1', 0);
    await Promise.all(
      Array.from({ length: 20 }, () =>
        s.transaction('a', async (tx) => tx.put('a', '1', (await tx.get<number>('a', '1'))! + 1)),
      ),
    );
    expect(await s.get('a', '1')).toBe(20);
  });
  it('clones returned data', async () => {
    const s = new MemoryStore();
    await s.put('a', '1', { v: 1 });
    const a = await s.get<any>('a', '1');
    a.v = 9;
    expect(await s.get('a', '1')).toEqual({ v: 1 });
  });
  it('lists only the requested collection and removes records', async () => {
    const s = new MemoryStore();
    await s.put('a', '1', 1);
    await s.put('b', '1', 2);
    expect(await s.list('a')).toEqual([1]);
    await s.remove('a', '1');
    expect(await s.list('a')).toEqual([]);
  });
});
