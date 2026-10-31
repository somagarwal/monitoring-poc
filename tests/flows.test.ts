import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { cluster, token } from './harness.js';
import { recoverCheckouts } from '../apps/api/src/checkout.js';
import { ApiError } from '../apps/api/src/domain.js';
import { createApp } from '../apps/api/src/app.js';
let c: Awaited<ReturnType<typeof cluster>>;
beforeEach(async () => {
  c = await cluster();
});
afterEach(async () => {
  await c.close();
});
const checkout = (key = 'checkout-123', paymentMode = 'approve') =>
  c.call('checkout', '/checkout', 'POST', {
    userId: 'shopper-1',
    addressId: 'address-1',
    key,
    paymentMode,
    coupon: 'WELCOME10',
  });
async function add(quantity = 2) {
  await c.call('cart', '/users/shopper-1/items/product-1', 'PUT', { quantity });
}
async function login(email = 'shopper@little.market') {
  const res = await c.apps.gateway.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'Demo123!' },
  });
  expect(res.statusCode).toBe(200);
  return res.cookies[0].value;
}
const browser = (session: string, method: string, url: string, payload?: any) =>
  c.apps.gateway.inject({
    method: method as any,
    url: '/api/v1' + url,
    cookies: { session },
    ...(payload === undefined ? {} : { payload }),
  });
describe('checkout across services', () => {
  it('purchases with an authoritative quote and fulfills the order exactly once', async () => {
    await add();
    const quote = await c.call('checkout', '/quote', 'POST', {
      userId: 'shopper-1',
      coupon: 'WELCOME10',
    });
    expect(quote.total).toBe(3200);
    const order = await checkout();
    expect(order.status).toBe('paid');
    expect(order.quote.total).toBe(3200);
    expect((await checkout()).id).toBe(order.id);
    expect((await c.call('inventory', '/stock/product-1')).quantity).toBe(18);
    expect((await c.call('cart', '/users/shopper-1')).items).toHaveLength(0);
    expect(await c.stores.payments.list('payments')).toHaveLength(1);
    expect(await c.stores.shipping.list('shipments')).toHaveLength(1);
    expect(await c.stores.notifications.list('notifications')).toHaveLength(1);
    expect(await c.stores.audit.list('events')).toHaveLength(1);
  });
  it('declines payment, releases stock, retains cart and marks the order failed', async () => {
    await add();
    await expect(checkout('checkout-decline', 'decline')).rejects.toThrow('declined');
    expect((await c.call('inventory', '/stock/product-1')).quantity).toBe(20);
    expect((await c.call('cart', '/users/shopper-1')).items).toHaveLength(1);
    expect((await c.stores.orders.list<any>('orders'))[0].status).toBe('failed');
    await expect(checkout('checkout-decline', 'decline')).rejects.toThrow('declined');
  });
  it('rejects insufficient stock without payment', async () => {
    await add(25);
    await expect(checkout()).rejects.toThrow('stock');
    expect(await c.stores.payments.list('payments')).toHaveLength(0);
  });
  it('rejects empty carts, invalid coupons and addresses', async () => {
    await expect(checkout()).rejects.toThrow('empty');
    await add();
    await expect(
      c.call('checkout', '/quote', 'POST', { userId: 'shopper-1', coupon: 'FAKE' }),
    ).rejects.toThrow('invalid');
    await expect(
      c.call('checkout', '/checkout', 'POST', {
        userId: 'shopper-1',
        addressId: 'other',
        key: 'checkout-123',
        paymentMode: 'approve',
      }),
    ).rejects.toThrow('address');
  });
  it('rejects reuse of a key with changed details', async () => {
    await add();
    await checkout();
    await expect(checkout('checkout-123', 'decline')).rejects.toThrow('different details');
  });
  it('serializes duplicate concurrent checkout requests', async () => {
    await add();
    const results = await Promise.allSettled([checkout(), checkout()]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(await c.stores.payments.list('payments')).toHaveLength(1);
    expect((await c.call('inventory', '/stock/product-1')).quantity).toBe(18);
  });
  it('recovers notification failures without recharging or clearing new cart items', async () => {
    await add();
    const failing = vi.fn(c.call);
    failing.mockImplementation(async (service, path, method, body) => {
      if (service === 'notifications') throw new ApiError(503, 'notifications unavailable');
      return c.call(service, path, method, body);
    });
    const app = await createApp('checkout', { store: c.stores.checkout, call: failing, token });
    const res = await app.inject({
      method: 'POST',
      url: '/checkout',
      headers: { 'x-internal-token': token },
      payload: {
        userId: 'shopper-1',
        addressId: 'address-1',
        key: 'recovery-123',
        paymentMode: 'approve',
      },
    });
    expect(res.statusCode).toBe(503);
    expect((await c.stores.orders.list<any>('orders'))[0].status).toBe('paid');
    await add(3);
    await recoverCheckouts({ store: c.stores.checkout, call: c.call, token });
    expect(await c.stores.payments.list('payments')).toHaveLength(1);
    expect((await c.call('cart', '/users/shopper-1')).items[0].quantity).toBe(3);
    expect(await c.stores.notifications.list('notifications')).toHaveLength(1);
    await app.close();
  });
  it('recovers a lost payment response by replaying the same charge key', async () => {
    await add();
    let first = true;
    const call = vi.fn(c.call).mockImplementation(async (service, path, method, body) => {
      const result = await c.call(service, path, method, body);
      if (service === 'payments' && first) {
        first = false;
        throw new ApiError(503, 'Response lost');
      }
      return result;
    });
    const app = await createApp('checkout', { store: c.stores.checkout, call, token });
    const res = await app.inject({
      method: 'POST',
      url: '/checkout',
      headers: { 'x-internal-token': token },
      payload: {
        userId: 'shopper-1',
        addressId: 'address-1',
        key: 'lost-response',
        paymentMode: 'approve',
      },
    });
    expect(res.statusCode).toBe(503);
    await recoverCheckouts({ store: c.stores.checkout, call: c.call, token });
    expect(await c.stores.payments.list('payments')).toHaveLength(1);
    expect((await c.stores.orders.list<any>('orders'))[0].status).toBe('paid');
    await app.close();
  });
  it('releases an expired workflow reservation before payment', async () => {
    await add();
    const call = vi.fn(c.call).mockImplementation(async (service, path, method, body) => {
      if (service === 'inventory' && path === '/reserve') {
        await c.call(service, path, method, body);
        throw new ApiError(503, 'Lost reservation response');
      }
      return c.call(service, path, method, body);
    });
    const app = await createApp('checkout', { store: c.stores.checkout, call, token });
    await app.inject({
      method: 'POST',
      url: '/checkout',
      headers: { 'x-internal-token': token },
      payload: {
        userId: 'shopper-1',
        addressId: 'address-1',
        key: 'expire-123',
        paymentMode: 'approve',
      },
    });
    const [w] = await c.stores.checkout.list<any>('workflows');
    w.expiresAt = 0;
    await c.stores.checkout.put('workflows', w.key, w);
    await recoverCheckouts({ store: c.stores.checkout, call: c.call, token });
    expect((await c.call('inventory', '/stock/product-1')).quantity).toBe(20);
    expect(await c.stores.payments.list('payments')).toHaveLength(0);
    await app.close();
  });
});
describe('gateway authorization and public APIs', () => {
  it('allows public browsing and aggregates price and stock', async () => {
    const res = await c.apps.gateway.inject('/api/v1/products?q=TOTE');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(3);
    expect(res.json()[0]).toHaveProperty('price');
    expect(res.json()[0]).toHaveProperty('stock');
    expect((await c.apps.gateway.inject('/api/v1/categories')).json()).toHaveLength(4);
  });
  it('requires authentication and protects admin routes', async () => {
    expect((await c.apps.gateway.inject('/api/v1/cart')).statusCode).toBe(401);
    const session = await login();
    expect((await browser(session, 'GET', '/admin/products')).statusCode).toBe(403);
    expect((await browser(session, 'GET', '/auth/me')).json().id).toBe('shopper-1');
  });
  it('sets HTTP-only cookies and supports logout', async () => {
    const res = await c.apps.gateway.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'shopper@little.market', password: 'Demo123!' },
    });
    expect(res.headers['set-cookie']).toContain('HttpOnly');
    expect(res.headers['set-cookie']).toContain('SameSite=Strict');
    const session = res.cookies[0].value;
    await browser(session, 'POST', '/auth/logout');
    expect((await browser(session, 'GET', '/auth/me')).statusCode).toBe(401);
  });
  it('overrides spoofed user identities', async () => {
    const session = await login();
    const res = await browser(session, 'POST', '/products/product-1/reviews', {
      userId: 'shopper-2',
      name: 'Spoof',
      rating: 4,
      comment: 'Good',
    });
    expect(res.json().userId).toBe('shopper-1');
    expect(res.json().name).toBe('Alex Morgan');
  });
  it('protects orders and shipment tracking from another shopper', async () => {
    await add();
    const order = await checkout();
    const session = await login('sam@little.market');
    expect((await browser(session, 'GET', `/orders/${order.id}`)).statusCode).toBe(404);
    expect((await browser(session, 'GET', `/orders/${order.id}/shipment`)).statusCode).toBe(404);
    expect((await browser(session, 'GET', '/orders')).json()).toHaveLength(0);
  });
  it('allows admins to manage products and shipments with audit records', async () => {
    await add();
    const order = await checkout();
    const session = await login('admin@little.market');
    const product = {
      name: 'New mug',
      description: 'A nice mug',
      categoryId: 'home',
      emoji: '☕',
      color: '#aabbcc',
      active: true,
    };
    const saved = await browser(session, 'POST', '/admin/products', {
      product,
      amount: 2200,
      quantity: 5,
    });
    expect(saved.statusCode).toBe(200);
    expect((await c.call('pricing', `/prices/${saved.json().id}`)).amount).toBe(2200);
    expect(
      (
        await browser(session, 'PUT', `/admin/orders/${order.id}/shipment`, { status: 'shipped' })
      ).json().status,
    ).toBe('shipped');
    expect((await browser(session, 'GET', '/admin/audit')).json()).toHaveLength(3);
  });
  it('supports account, cart, wishlist and notification routes', async () => {
    const session = await login();
    expect((await browser(session, 'PUT', '/profile', { name: 'Alex New' })).statusCode).toBe(200);
    expect((await browser(session, 'GET', '/profile')).json().name).toBe('Alex New');
    expect((await browser(session, 'GET', '/addresses')).json()).toHaveLength(1);
    await browser(session, 'PUT', '/wishlist/product-1');
    expect((await browser(session, 'GET', '/wishlist')).json().items).toEqual(['product-1']);
    await browser(session, 'DELETE', '/wishlist/product-1');
    await browser(session, 'PUT', '/cart/items/product-1', { quantity: 1 });
    expect((await browser(session, 'POST', '/checkout/quote', {})).json().total).toBe(2000);
    await browser(session, 'DELETE', '/cart/items/product-1');
    expect((await browser(session, 'GET', '/cart')).json().items).toEqual([]);
  });
});
