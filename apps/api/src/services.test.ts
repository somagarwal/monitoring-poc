import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { unit } from '../../../tests/harness.js';
import { services } from '../../../packages/shared/src/index.js';
const cleanup: FastifyInstance[] = [];
async function setup(name: (typeof services)[number]) {
  const s = await unit(name);
  cleanup.push(s.app);
  return s;
}
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((a) => a.close()));
});
describe.each(services)('%s health and boundaries', (name) => {
  it('reports liveness and readiness', async () => {
    const { app } = await setup(name);
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    expect((await app.inject('/health/ready')).json().service).toBe(name);
  });
  if (name !== 'gateway')
    it('rejects direct external access', async () => {
      const { app } = await setup(name);
      expect((await app.inject('/private')).statusCode).toBe(403);
    });
  it('exposes an OpenAPI document', async () => {
    const { app } = await setup(name);
    expect((await app.inject('/docs/json')).json().info.title).toContain(name);
  });
});
describe('auth', () => {
  it('logs in without exposing password hashes and expires sessions', async () => {
    const { request, store } = await setup('auth');
    const res = await request('POST', '/login', {
      email: 'shopper@little.market',
      password: 'Demo123!',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.passwordHash).toBeUndefined();
    const session = res.json().session;
    expect((await request('POST', '/session', { session })).json().id).toBe('shopper-1');
    await store.put('sessions', session, { user: res.json().user, expiresAt: 0 });
    expect((await request('POST', '/session', { session })).statusCode).toBe(401);
  });
  it('rejects bad credentials and unknown sessions', async () => {
    const { request } = await setup('auth');
    expect(
      (await request('POST', '/login', { email: 'shopper@little.market', password: 'wrong' }))
        .statusCode,
    ).toBe(401);
    expect(
      (await request('POST', '/login', { email: 'nobody@example.com', password: 'wrong' }))
        .statusCode,
    ).toBe(401);
    expect((await request('POST', '/session', { session: 'missing' })).statusCode).toBe(401);
  });
  it('invalidates a logged-out session', async () => {
    const { request } = await setup('auth');
    const { session } = (
      await request('POST', '/login', { email: 'admin@little.market', password: 'Demo123!' })
    ).json();
    await request('POST', '/logout', { session });
    expect((await request('POST', '/session', { session })).statusCode).toBe(401);
  });
  it('validates login input', async () => {
    const { request } = await setup('auth');
    expect((await request('POST', '/login', { email: 'invalid' })).statusCode).toBe(400);
  });
});
describe('profile and address', () => {
  it('updates profiles and rejects empty names', async () => {
    const { request } = await setup('profile');
    expect((await request('PUT', '/users/shopper-1', { name: 'New Name' })).json().name).toBe(
      'New Name',
    );
    expect((await request('GET', '/users/shopper-1')).json().name).toBe('New Name');
    expect((await request('PUT', '/users/shopper-1', { name: ' ' })).statusCode).toBe(400);
  });
  it('adds and deletes owned addresses and protects others', async () => {
    const { request } = await setup('address');
    expect((await request('DELETE', '/users/shopper-2/address-1')).statusCode).toBe(404);
    const a = (
      await request('POST', '/users/shopper-2', {
        name: 'Sam',
        line1: '1 Test St',
        city: 'Test',
        postalCode: '123',
        country: 'US',
      })
    ).json();
    expect((await request('GET', '/users/shopper-2')).json()).toHaveLength(1);
    await request('DELETE', `/users/shopper-2/${a.id}`);
    expect((await request('GET', '/users/shopper-2')).json()).toHaveLength(0);
  });
  it('rejects incomplete addresses', async () => {
    const { request } = await setup('address');
    expect((await request('POST', '/users/shopper-1', { name: 'A' })).statusCode).toBe(400);
  });
});
describe('catalog and discovery', () => {
  it('creates and hides products while admin can see them', async () => {
    const { request } = await setup('catalog');
    const product = {
      name: 'Test',
      description: 'Test item',
      categoryId: 'home',
      emoji: '☕',
      color: '#aabbcc',
      active: false,
    };
    const saved = (await request('POST', '/products', product)).json();
    expect((await request('GET', `/products/${saved.id}`)).statusCode).toBe(404);
    expect((await request('GET', '/products')).json()).toHaveLength(30);
    expect((await request('GET', '/products?admin=true')).json()).toHaveLength(31);
    expect(
      (await request('PUT', `/products/${saved.id}`, { ...product, active: true })).statusCode,
    ).toBe(200);
    expect((await request('GET', `/products/${saved.id}`)).json().name).toBe('Test');
  });
  it('validates products and missing update targets', async () => {
    const { request } = await setup('catalog');
    expect((await request('POST', '/products', {})).statusCode).toBe(400);
    expect(
      (
        await request('PUT', '/products/missing', {
          name: 'A',
          description: 'B',
          categoryId: 'home',
          emoji: '',
          color: '#ffffff',
          active: true,
        })
      ).statusCode,
    ).toBe(404);
  });
  it('provides four categories', async () => {
    const { request } = await setup('category');
    expect((await request('GET', '/categories')).json()).toHaveLength(4);
  });
  it('searches case-insensitively and filters categories', async () => {
    const { request, call } = await setup('search');
    call.mockResolvedValue([
      { id: '1', name: 'Mug', description: 'Ceramic', categoryId: 'home' },
      { id: '2', name: 'Bag', description: 'Cotton', categoryId: 'essentials' },
    ]);
    expect((await request('GET', '/products?q=CERAMIC&category=home')).json()).toHaveLength(1);
    expect((await request('GET', '/products?q=mug&category=essentials')).json()).toHaveLength(0);
    expect((await request('GET', '/products')).json()).toHaveLength(2);
  });
  it('recommends related products excluding the current product', async () => {
    const { request, call } = await setup('recommendations');
    call.mockResolvedValueOnce({ id: 'a', categoryId: 'home' }).mockResolvedValueOnce([
      { id: 'a', categoryId: 'home' },
      { id: 'b', categoryId: 'home' },
      { id: 'c', categoryId: 'desk' },
    ]);
    expect((await request('GET', '/products/a')).json()).toEqual([{ id: 'b', categoryId: 'home' }]);
  });
});
describe('pricing and promotions', () => {
  it('stores integer prices and rejects negatives', async () => {
    const { request } = await setup('pricing');
    expect((await request('GET', '/prices/product-1')).json().amount).toBe(1500);
    expect((await request('PUT', '/prices/product-1', { amount: 999 })).json().amount).toBe(999);
    for (const amount of [-1, 1.5])
      expect((await request('PUT', '/prices/product-1', { amount })).statusCode).toBe(400);
    expect((await request('GET', '/prices/missing')).statusCode).toBe(404);
  });
  it('accepts seeded coupons and rejects invalid or inactive coupons', async () => {
    const { request, store } = await setup('promotions');
    expect((await request('GET', '/coupons/welcome10')).json().percent).toBe(10);
    expect((await request('GET', '/coupons/missing')).statusCode).toBe(400);
    await store.put('coupons', 'WELCOME10', { active: false });
    expect((await request('GET', '/coupons/WELCOME10')).statusCode).toBe(400);
  });
});
describe('inventory', () => {
  it('reserves atomically and idempotently', async () => {
    const { request } = await setup('inventory');
    const b = { key: 'order-a', items: [{ productId: 'product-1', quantity: 2 }] };
    await request('POST', '/reserve', b);
    await request('POST', '/reserve', b);
    expect((await request('GET', '/stock/product-1')).json().quantity).toBe(18);
  });
  it('rolls back all items if one is out of stock', async () => {
    const { request } = await setup('inventory');
    expect(
      (
        await request('POST', '/reserve', {
          key: 'a',
          items: [
            { productId: 'product-1', quantity: 2 },
            { productId: 'product-2', quantity: 30 },
          ],
        })
      ).statusCode,
    ).toBe(409);
    expect((await request('GET', '/stock/product-1')).json().quantity).toBe(20);
  });
  it('releases once and refuses to commit a released reservation', async () => {
    const { request } = await setup('inventory');
    await request('POST', '/reserve', {
      key: 'a',
      items: [{ productId: 'product-1', quantity: 2 }],
    });
    await request('POST', '/reservations/a/release');
    await request('POST', '/reservations/a/release');
    expect((await request('GET', '/stock/product-1')).json().quantity).toBe(20);
    expect((await request('POST', '/reservations/a/commit')).statusCode).toBe(409);
  });
  it('commits once and cannot release committed stock', async () => {
    const { request } = await setup('inventory');
    await request('POST', '/reserve', {
      key: 'a',
      items: [{ productId: 'product-1', quantity: 2 }],
    });
    await request('POST', '/reservations/a/commit');
    await request('POST', '/reservations/a/commit');
    await request('POST', '/reservations/a/release');
    expect((await request('GET', '/stock/product-1')).json().quantity).toBe(18);
  });
  it('prevents overselling under concurrency', async () => {
    const { request } = await setup('inventory');
    await request('PUT', '/stock/product-1', { quantity: 1 });
    const results = await Promise.all(
      ['a', 'b'].map((key) =>
        request('POST', '/reserve', { key, items: [{ productId: 'product-1', quantity: 1 }] }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });
  it('rejects duplicate product IDs', async () => {
    const { request } = await setup('inventory');
    expect(
      (
        await request('POST', '/reserve', {
          key: 'a',
          items: [
            { productId: 'product-1', quantity: 1 },
            { productId: 'product-1', quantity: 1 },
          ],
        })
      ).statusCode,
    ).toBe(400);
  });
  it('rejects invalid stock and missing reservations', async () => {
    const { request } = await setup('inventory');
    expect((await request('PUT', '/stock/a', { quantity: -1 })).statusCode).toBe(400);
    expect((await request('POST', '/reservations/missing/release')).statusCode).toBe(404);
    expect((await request('POST', '/reservations/a/invalid')).statusCode).toBe(400);
    expect((await request('GET', '/stock/missing')).json().quantity).toBe(0);
  });
});
describe('cart and wishlist', () => {
  it('updates, validates and removes cart items', async () => {
    const { request } = await setup('cart');
    expect((await request('GET', '/users/u')).json().items).toEqual([]);
    await request('PUT', '/users/u/items/p', { quantity: 2 });
    await request('PUT', '/users/u/items/p', { quantity: 3 });
    expect((await request('GET', '/users/u')).json().items).toEqual([
      { productId: 'p', quantity: 3 },
    ]);
    expect((await request('PUT', '/users/u/items/p', { quantity: 0 })).statusCode).toBe(400);
    await request('DELETE', '/users/u/items/p');
    expect((await request('GET', '/users/u')).json().items).toEqual([]);
  });
  it('clears purchased items only once and preserves added quantities', async () => {
    const { request } = await setup('cart');
    await request('PUT', '/users/u/items/p', { quantity: 4 });
    const b = { key: 'order-a', items: [{ productId: 'p', quantity: 2 }] };
    await request('POST', '/users/u/purchased', b);
    await request('POST', '/users/u/purchased', b);
    expect((await request('GET', '/users/u')).json().items).toEqual([
      { productId: 'p', quantity: 2 },
    ]);
  });
  it('deduplicates wishlist entries and removes them', async () => {
    const { request } = await setup('wishlist');
    await request('PUT', '/users/u/p');
    await request('PUT', '/users/u/p');
    expect((await request('GET', '/users/u')).json().items).toEqual(['p']);
    await request('DELETE', '/users/u/p');
    expect((await request('GET', '/users/u')).json().items).toEqual([]);
  });
});
describe('reviews', () => {
  it('validates ratings and updates one review per user/product', async () => {
    const { request } = await setup('reviews');
    const b = { userId: 'u', name: 'Alex', rating: 4, comment: 'Good' };
    await request('POST', '/products/p', b);
    await request('POST', '/products/p', { ...b, rating: 5 });
    expect((await request('GET', '/products/p')).json()).toHaveLength(1);
    expect((await request('GET', '/products/p')).json()[0].rating).toBe(5);
    for (const rating of [0, 6, 2.5])
      expect((await request('POST', '/products/p', { ...b, rating })).statusCode).toBe(400);
  });
});
describe('orders and payments', () => {
  it('filters orders by user and rejects missing orders', async () => {
    const { request, store } = await setup('orders');
    await store.put('orders', 'a', { id: 'a', userId: 'u', createdAt: '2026-01-01' });
    await store.put('orders', 'b', { id: 'b', userId: 'v', createdAt: '2026-01-02' });
    expect((await request('GET', '/orders?userId=u')).json()).toHaveLength(1);
    expect((await request('GET', '/orders')).json()[0].id).toBe('b');
    expect((await request('GET', '/orders/missing')).statusCode).toBe(404);
  });
  it('charges once and refunds once', async () => {
    const { request } = await setup('payments');
    const b = { key: 'a', amount: 2000, mode: 'approve' };
    await request('POST', '/charge', b);
    expect((await request('POST', '/charge', { ...b, mode: 'decline' })).json().status).toBe(
      'paid',
    );
    expect((await request('POST', '/refund/a')).json().status).toBe('refunded');
    expect((await request('POST', '/refund/a')).json().status).toBe('refunded');
    expect((await request('POST', '/refund/missing')).statusCode).toBe(404);
  });
  it('declines payments and rejects invalid amounts', async () => {
    const { request } = await setup('payments');
    expect(
      (await request('POST', '/charge', { key: 'a', amount: 2, mode: 'decline' })).json().status,
    ).toBe('declined');
    expect(
      (await request('POST', '/charge', { key: 'b', amount: -1, mode: 'approve' })).statusCode,
    ).toBe(400);
  });
});
describe('shipping, notifications and audit', () => {
  it('creates one shipment and validates updates', async () => {
    const { request } = await setup('shipping');
    expect((await request('GET', '/quote')).json().amount).toBe(500);
    expect((await request('GET', '/shipments/missing')).json().status).toBe('pending');
    await request('POST', '/shipments', { orderId: 'a' });
    await request('PUT', '/shipments/a', { status: 'shipped' });
    expect((await request('POST', '/shipments', { orderId: 'a' })).json().status).toBe('shipped');
    expect((await request('PUT', '/shipments/a', { status: 'invalid' })).statusCode).toBe(400);
    expect((await request('PUT', '/shipments/missing', { status: 'delivered' })).statusCode).toBe(
      404,
    );
  });
  it('deduplicates notifications and protects read updates', async () => {
    const { request } = await setup('notifications');
    const b = { id: 'n', userId: 'u', message: 'Order confirmed' };
    await request('POST', '/notifications', b);
    await request('PUT', '/users/u/n/read');
    await request('POST', '/notifications', b);
    expect((await request('GET', '/users/u')).json()).toHaveLength(1);
    expect((await request('GET', '/users/u')).json()[0].read).toBe(true);
    expect((await request('GET', '/users/v')).json()).toEqual([]);
    expect((await request('PUT', '/users/v/n/read')).statusCode).toBe(404);
  });
  it('records audit events idempotently', async () => {
    const { request } = await setup('audit');
    const b = { id: 'event', actor: 'admin', action: 'product.saved', target: 'p' };
    await request('POST', '/events', b);
    await request('POST', '/events', b);
    expect((await request('GET', '/events')).json()).toHaveLength(1);
  });
});
