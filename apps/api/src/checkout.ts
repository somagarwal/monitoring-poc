import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  Address,
  CartItem,
  Order,
  Product,
  Quote,
} from '../../../packages/shared/src/index.js';
import type { Context } from './app.js';
import { ApiError, calculateQuote, ensure } from './domain.js';
const quoteBody = z.object({ userId: z.string().min(1), coupon: z.string().max(50).optional() });
const checkoutBody = quoteBody.extend({
  addressId: z.string().min(1),
  key: z.string().min(8).max(80),
  paymentMode: z.enum(['approve', 'decline']),
});
type Workflow = {
  key: string;
  fingerprint: string;
  order: Order;
  paymentMode: 'approve' | 'decline';
  phase: 'initial' | 'reserved' | 'charged' | 'paid' | 'failed' | 'done';
  expiresAt: number;
  error?: string;
};
export async function quote(ctx: Context, userId: string, coupon?: string): Promise<Quote> {
  const cart = await ctx.call<{ items: CartItem[] }>('cart', `/users/${userId}`);
  const items = await Promise.all(
    cart.items.map(async (item) => {
      const product = await ctx.call<Product>('catalog', `/products/${item.productId}`);
      const price = await ctx.call<{ amount: number }>('pricing', `/prices/${item.productId}`);
      return { ...item, name: product.name, unitPrice: price.amount, lineTotal: 0 };
    }),
  );
  const discount = coupon
    ? (await ctx.call<{ percent: number }>('promotions', `/coupons/${encodeURIComponent(coupon)}`))
        .percent
    : 0;
  const shipping = await ctx.call<{ amount: number }>('shipping', '/quote');
  return calculateQuote(items, discount, shipping.amount);
}
export function registerCheckout(app: FastifyInstance, ctx: Context) {
  app.post('/quote', async (req) => {
    const b = quoteBody.parse(req.body);
    return quote(ctx, b.userId, b.coupon);
  });
  app.post('/checkout', async (req) => {
    const b = checkoutBody.parse(req.body);
    const key = `${b.userId}:${b.key}`;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([b.addressId, b.coupon ?? '', b.paymentMode]))
      .digest('hex');
    return ctx.store
      .transaction(key, async (store) => {
        let workflow = await store.get<Workflow>('workflows', key);
        if (workflow)
          ensure(
            workflow.fingerprint === fingerprint,
            409,
            'This checkout key was already used with different details',
          );
        else {
          const addresses = await ctx.call<Address[]>('address', `/users/${b.userId}`);
          const address = addresses.find((a) => a.id === b.addressId);
          ensure(address, 400, 'Choose a valid shipping address');
          workflow = {
            key,
            fingerprint,
            order: {
              id: randomUUID(),
              userId: b.userId,
              status: 'pending',
              quote: await quote(ctx, b.userId, b.coupon),
              address,
              createdAt: new Date().toISOString(),
            },
            paymentMode: b.paymentMode,
            phase: 'initial',
            expiresAt: (ctx.now ?? Date.now)() + 300000,
          };
          // Commit the intent before making any external changes. Execution occurs outside this transaction.
          await store.put('workflows', key, workflow);
        }
        return { key };
      })
      .then(async () => {
        const result = await execute(ctx, key);
        if (result.phase === 'failed') throw new ApiError(409, result.error ?? 'Checkout failed');
        return result.order;
      });
  });
}
async function execute(ctx: Context, key: string): Promise<Workflow> {
  // Session-level advisory lock serializes attempts; progress is autocommitted so a crash is recoverable.
  // Store transaction is used only for a lease, never for external side effects.
  const owner = randomUUID();
  const now = ctx.now ?? Date.now;
  const acquired = await ctx.store.transaction(`lease:${key}`, async (s) => {
    const lease = await s.get<{ owner: string; until: number }>('leases', key);
    if (lease && lease.until > now()) return false;
    await s.put('leases', key, { owner, until: now() + 120000 });
    return true;
  });
  ensure(acquired, 409, 'Checkout is processing; retry with the same checkout key');
  try {
    const w = await ctx.store.get<Workflow>('workflows', key);
    ensure(w, 404, 'Checkout not found');
    const save = async () => ctx.store.put('workflows', key, w);
    if (w.phase === 'done' || w.phase === 'failed') return w;
    const orderId = w.order.id;
    if (w.phase === 'initial') {
      await ctx.call('orders', `/orders/${orderId}`, 'PUT', w.order);
      try {
        ensure(now() < w.expiresAt, 409, 'Checkout reservation expired');
        await ctx.call('inventory', '/reserve', 'POST', {
          key: orderId,
          items: w.order.quote.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        });
        w.phase = 'reserved';
        await save();
      } catch (e) {
        if (e instanceof ApiError && e.statusCode === 409) {
          await fail(ctx, w, e.message);
          return w;
        }
        throw e;
      }
    }
    if (w.phase === 'reserved') {
      // The payment endpoint is idempotent, including retries after a lost response.
      const payment = await ctx.call<{ status: string }>('payments', '/charge', 'POST', {
        key: orderId,
        amount: w.order.quote.total,
        mode: w.paymentMode,
      });
      if (payment.status !== 'paid') {
        await fail(ctx, w, 'Payment declined. No charge was made.');
        return w;
      }
      w.phase = 'charged';
      await save();
    }
    if (w.phase === 'charged') {
      await ctx.call('inventory', `/reservations/${orderId}/commit`, 'POST');
      w.order.status = 'paid';
      await ctx.call('orders', `/orders/${orderId}`, 'PUT', w.order);
      w.phase = 'paid';
      await save();
    }
    if (w.phase === 'paid') {
      await ctx.call('cart', `/users/${w.order.userId}/purchased`, 'POST', {
        key: orderId,
        items: w.order.quote.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });
      await ctx.call('shipping', '/shipments', 'POST', { orderId });
      await ctx.call('notifications', '/notifications', 'POST', {
        id: `order-${orderId}`,
        userId: w.order.userId,
        message: `Your order ${orderId.slice(0, 8)} is confirmed. Thank you for shopping small!`,
      });
      await ctx.call('audit', '/events', 'POST', {
        id: `checkout-${orderId}`,
        actor: w.order.userId,
        action: 'checkout.paid',
        target: orderId,
      });
      w.phase = 'done';
      await save();
    }
    return w;
  } finally {
    await ctx.store.transaction(`lease:${key}`, async (s) => {
      const lease = await s.get<{ owner: string }>('leases', key);
      if (lease?.owner === owner) await s.remove('leases', key);
    });
  }
}
async function fail(ctx: Context, w: Workflow, message: string) {
  // Release also handles a successful reservation whose response was lost.
  try {
    await ctx.call('inventory', `/reservations/${w.order.id}/release`, 'POST');
  } catch (e) {
    if (!(e instanceof ApiError && e.statusCode === 404)) throw e;
  }
  w.order.status = 'failed';
  w.order.failure = message;
  await ctx.call('orders', `/orders/${w.order.id}`, 'PUT', w.order);
  w.phase = 'failed';
  w.error = message;
  await ctx.store.put('workflows', w.key, w);
  await ctx.call('audit', '/events', 'POST', {
    id: `checkout-${w.order.id}`,
    actor: w.order.userId,
    action: 'checkout.failed',
    target: w.order.id,
  });
}
export async function recoverCheckouts(ctx: Context) {
  for (const w of await ctx.store.list<Workflow>('workflows'))
    if (w.phase !== 'done' && w.phase !== 'failed') {
      try {
        await execute(ctx, w.key);
      } catch (e) {
        if (!(e instanceof ApiError && e.statusCode === 409))
          console.error('Checkout recovery pending', w.order.id, (e as Error).message);
      }
    }
}
