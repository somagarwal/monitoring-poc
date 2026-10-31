import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:8080';
let cookie = '';
async function request(path, method = 'GET', body) {
  const res = await fetch(base + '/api/v1' + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const value = await res.json();
  assert.ok(res.ok, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
await request('/auth/login', 'POST', { email: 'shopper@little.market', password: 'Demo123!' });
if (process.argv.includes('--verify-persistence')) {
  const { id } = JSON.parse(readFileSync('.local/smoke-order.json', 'utf8'));
  const order = await request(`/orders/${id}`);
  assert.equal(order.status, 'paid');
  console.log('Paid order persisted after PostgreSQL restart');
} else {
  const products = await request('/products');
  assert.ok(products.length >= 30);
  const cart = await request('/cart');
  for (const item of cart.items) await request(`/cart/items/${item.productId}`, 'DELETE');
  await request('/cart/items/product-1', 'PUT', { quantity: 1 });
  const [address] = await request('/addresses');
  const quote = await request('/checkout/quote', 'POST', { coupon: 'WELCOME10' });
  assert.ok(quote.discount > 0);
  const key = crypto.randomUUID();
  const payload = { addressId: address.id, key, paymentMode: 'approve', coupon: 'WELCOME10' };
  const order = await request('/checkout', 'POST', payload);
  assert.equal(order.status, 'paid');
  assert.equal((await request('/checkout', 'POST', payload)).id, order.id);
  assert.equal((await request('/cart')).items.length, 0);
  assert.ok((await request(`/orders/${order.id}/shipment`)).tracking);
  writeFileSync('.local/smoke-order.json', JSON.stringify({ id: order.id }));
  console.log('Shopping flow and checkout idempotency passed against Kubernetes');
}
