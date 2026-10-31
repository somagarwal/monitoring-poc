import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const base = process.argv[2];
let cookie = '';
async function request(path, method = 'GET', body, allowFailure = false) {
  const res = await fetch(base + '/api/v1' + path, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error(`${path}: unexpected HTTP ${res.status}`);
  }
  if (!allowFailure) assert.ok(res.ok, `${path}: ${data.message}`);
  return { status: res.status, data };
}
await request('/auth/login', 'POST', { email: 'shopper@little.market', password: 'Demo123!' });
if (process.argv.includes('--begin')) {
  const oldOrders = (await request('/orders')).data.map((order) => order.id);
  const cart = (await request('/cart')).data;
  for (const item of cart.items) await request(`/cart/items/${item.productId}`, 'DELETE');
  await request('/cart/items/product-3', 'PUT', { quantity: 1 });
  const [address] = (await request('/addresses')).data;
  const payload = { addressId: address.id, key: crypto.randomUUID(), paymentMode: 'approve' };
  const response = await request('/checkout', 'POST', payload, true);
  assert.ok(response.status >= 500, 'Notification outage should interrupt fulfillment');
  const order = (await request('/orders')).data.find((order) => !oldOrders.includes(order.id));
  assert.equal(order?.status, 'paid', 'Payment must remain successful during notification outage');
  const stock = (await request('/products/product-3')).data.stock;
  writeFileSync('.local/recovery-order.json', JSON.stringify({ payload, id: order.id, stock }));
  console.log('Paid checkout intent persisted while notifications were unavailable');
} else {
  const saved = JSON.parse(readFileSync('.local/recovery-order.json', 'utf8'));
  const notes = (await request('/notifications')).data;
  assert.ok(
    notes.some((note) => note.id === `order-${saved.id}`),
    'Recovery has not finished yet',
  );
  const repeated = (await request('/checkout', 'POST', saved.payload)).data;
  assert.equal(repeated.id, saved.id);
  assert.equal((await request('/products/product-3')).data.stock, saved.stock);
  console.log('Checkout recovered after process restart; no duplicate order or stock deduction');
}
