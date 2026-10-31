import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import { randomUUID, randomBytes } from 'node:crypto';
import { z, ZodError } from 'zod';
import type {
  ServiceName,
  User,
  Product,
  CartItem,
  Address,
  Order,
} from '../../../packages/shared/src/index.js';
import type { Store } from './store.js';
import { ApiError, ensure, verifyPassword } from './domain.js';
import type { Call } from './client.js';
import { registerCheckout, recoverCheckouts } from './checkout.js';
export type Context = { store: Store; call: Call; token: string; now?: () => number };
const id = z.string().min(1).max(100);
const quantity = z.number().int().min(1).max(99);
const asBody = <T>(schema: z.ZodType<T>, req: FastifyRequest) => schema.parse(req.body);
const params = (req: FastifyRequest) => req.params as Record<string, string>;
const query = (req: FastifyRequest) => req.query as Record<string, string>;
export async function createApp(name: ServiceName, ctx: Context, logging = false) {
  const { store, call, token } = ctx;
  const now = ctx.now ?? Date.now;
  const app = Fastify({ logger: logging, requestIdHeader: false, bodyLimit: 64 * 1024 });
  await app.register(cookie);
  await app.register(swagger, {
    openapi: { info: { title: `Little Market · ${name}`, version: '1.0.0' } },
  });
  app.get('/docs/json', async () => app.swagger());
  app.get('/docs', async (_req, reply) =>
    reply
      .type('text/html')
      .send(
        '<h1>Little Market API</h1><p><a href="/docs/json">OpenAPI specification (JSON)</a></p>',
      ),
  );
  app.setErrorHandler((error, req, reply) => {
    const status = error instanceof ZodError ? 400 : ((error as ApiError).statusCode ?? 500);
    if (status >= 500) req.log.error(error);
    reply.status(status).send({
      message:
        error instanceof ZodError
          ? 'Invalid request'
          : status === 500
            ? 'Internal server error'
            : (error as Error).message,
      requestId: req.id,
    });
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    if (req.url.startsWith('/health') || req.url.startsWith('/docs')) return;
    if (name !== 'gateway')
      ensure(req.headers['x-internal-token'] === token, 403, 'Internal access required');
  });
  app.get('/health/live', async () => ({ status: 'ok', service: name }));
  app.get('/health/ready', async () => {
    await store.ping();
    return { status: 'ready', service: name };
  });
  app.addHook('onClose', async () => store.close());
  if (name === 'gateway') {
    await gateway(app, ctx);
    return app;
  }
  if (name === 'auth') {
    app.post('/login', async (req) => {
      const b = asBody(z.object({ email: z.email(), password: z.string().min(1).max(128) }), req);
      const user = (await store.list<User & { passwordHash: string }>('users')).find(
        (u) => u.email === b.email,
      );
      ensure(
        user && verifyPassword(b.password, user.passwordHash),
        401,
        'Incorrect email or password',
      );
      const session = randomBytes(32).toString('hex');
      const { passwordHash: _, ...safe } = user;
      await store.put('sessions', session, { user: safe, expiresAt: now() + 86400000 });
      return { session, user: safe };
    });
    app.post('/session', async (req) => {
      const { session } = asBody(z.object({ session: z.string() }), req);
      const saved = await store.get<{ user: User; expiresAt: number }>('sessions', session);
      ensure(saved && saved.expiresAt > now(), 401, 'Please sign in');
      return saved.user;
    });
    app.post('/logout', async (req) => {
      const { session } = asBody(z.object({ session: z.string() }), req);
      await store.remove('sessions', session);
      return { ok: true };
    });
  }
  if (name === 'profile') {
    app.get(
      '/users/:userId',
      async (req) =>
        (await store.get('profiles', params(req).userId)) ?? { id: params(req).userId, name: '' },
    );
    app.put('/users/:userId', async (req) => {
      const b = asBody(z.object({ name: z.string().trim().min(1).max(80) }), req);
      const value = { id: params(req).userId, ...b };
      await store.put('profiles', value.id, value);
      return value;
    });
  }
  if (name === 'address') {
    app.get('/users/:userId', async (req) =>
      (await store.list<Address>('addresses')).filter((a) => a.userId === params(req).userId),
    );
    app.post('/users/:userId', async (req) => {
      const b = asBody(
        z.object({
          name: z.string().trim().min(1).max(80),
          line1: z.string().trim().min(1).max(160),
          city: z.string().trim().min(1).max(80),
          postalCode: z.string().trim().min(1).max(20),
          country: z.string().length(2),
        }),
        req,
      );
      const value = { id: randomUUID(), userId: params(req).userId, ...b };
      await store.put('addresses', value.id, value);
      return value;
    });
    app.delete('/users/:userId/:id', async (req) => {
      const p = params(req);
      const a = await store.get<Address>('addresses', p.id);
      ensure(a?.userId === p.userId, 404, 'Address not found');
      await store.remove('addresses', p.id);
      return { ok: true };
    });
  }
  if (name === 'catalog') {
    app.get('/products', async (req) =>
      (await store.list<Product>('products')).filter(
        (p) => query(req).admin === 'true' || p.active,
      ),
    );
    app.get('/products/:id', async (req) => {
      const p = await store.get<Product>('products', params(req).id);
      ensure(p?.active, 404, 'Product not found');
      return p;
    });
    app.post('/products', async (req) => {
      const b = asBody(productSchema, req);
      const value = { id: randomUUID(), ...b };
      await store.put('products', value.id, value);
      return value;
    });
    app.put('/products/:id', async (req) => {
      const b = asBody(productSchema, req);
      ensure(await store.get('products', params(req).id), 404, 'Product not found');
      const value = { id: params(req).id, ...b };
      await store.put('products', value.id, value);
      return value;
    });
  }
  if (name === 'category') app.get('/categories', async () => store.list('categories'));
  if (name === 'search')
    app.get('/products', async (req) => {
      const { q = '', category = '' } = query(req);
      const products = await call<Product[]>('catalog', '/products');
      return products.filter(
        (p) =>
          (!category || p.categoryId === category) &&
          `${p.name} ${p.description}`.toLowerCase().includes(q.toLowerCase()),
      );
    });
  if (name === 'pricing') {
    app.get('/prices/:id', async (req) => {
      const p = await store.get('prices', params(req).id);
      ensure(p, 404, 'Price not found');
      return p;
    });
    app.put('/prices/:id', async (req) => {
      const b = asBody(z.object({ amount: z.number().int().min(0).max(10000000) }), req);
      const value = { productId: params(req).id, ...b };
      await store.put('prices', value.productId, value);
      return value;
    });
  }
  if (name === 'inventory') {
    app.get(
      '/stock/:id',
      async (req) =>
        (await store.get('stock', params(req).id)) ?? { productId: params(req).id, quantity: 0 },
    );
    app.put('/stock/:id', async (req) =>
      store.transaction('stock', async (s) => {
        const b = asBody(z.object({ quantity: z.number().int().min(0).max(100000) }), req);
        const value = { productId: params(req).id, ...b };
        await s.put('stock', value.productId, value);
        return value;
      }),
    );
    app.post('/reserve', async (req) => {
      const b = asBody(
        z.object({ key: id, items: z.array(z.object({ productId: id, quantity })).min(1) }),
        req,
      );
      return store.transaction('stock', async (s) => {
        const previous = await s.get<any>('reservations', b.key);
        if (previous) {
          ensure(previous.status !== 'released', 409, 'Reservation expired');
          return previous;
        }
        ensure(
          new Set(b.items.map((i) => i.productId)).size === b.items.length,
          400,
          'Duplicate product',
        );
        for (const item of b.items) {
          const stock = await s.get<any>('stock', item.productId);
          ensure(stock && stock.quantity >= item.quantity, 409, 'Insufficient stock');
          await s.put('stock', item.productId, {
            ...stock,
            quantity: stock.quantity - item.quantity,
          });
        }
        const reservation = { ...b, status: 'reserved', expiresAt: now() + 300000 };
        await s.put('reservations', b.key, reservation);
        return reservation;
      });
    });
    app.post('/reservations/:id/:action', async (req) =>
      store.transaction('stock', async (s) => {
        const { id: key, action } = params(req);
        ensure(['release', 'commit'].includes(action), 400, 'Invalid reservation action');
        const r = await s.get<any>('reservations', key);
        ensure(r, 404, 'Reservation not found');
        if (r.status === 'reserved') {
          if (action === 'release')
            for (const item of r.items) {
              const stock = await s.get<any>('stock', item.productId);
              await s.put('stock', item.productId, {
                ...stock,
                quantity: stock.quantity + item.quantity,
              });
            }
          r.status = action === 'release' ? 'released' : 'committed';
          await s.put('reservations', key, r);
        } else if (action === 'commit')
          ensure(r.status === 'committed', 409, 'Reservation expired');
        return r;
      }),
    );
  }
  if (name === 'cart') {
    app.get(
      '/users/:userId',
      async (req) => (await store.get('carts', params(req).userId)) ?? { items: [] },
    );
    app.put('/users/:userId/items/:id', async (req) => {
      const b = asBody(z.object({ quantity }), req);
      await call('catalog', `/products/${encodeURIComponent(params(req).id)}`);
      return store.transaction(params(req).userId, async (s) => {
        const p = params(req);
        const cart = (await s.get<{ items: CartItem[] }>('carts', p.userId)) ?? { items: [] };
        cart.items = cart.items.filter((i) => i.productId !== p.id);
        cart.items.push({ productId: p.id, quantity: b.quantity });
        await s.put('carts', p.userId, cart);
        return cart;
      });
    });
    app.delete('/users/:userId/items/:id', async (req) =>
      store.transaction(params(req).userId, async (s) => {
        const p = params(req);
        const cart = (await s.get<{ items: CartItem[] }>('carts', p.userId)) ?? { items: [] };
        cart.items = cart.items.filter((i) => i.productId !== p.id);
        await s.put('carts', p.userId, cart);
        return cart;
      }),
    );
    app.post('/users/:userId/purchased', async (req) =>
      store.transaction(params(req).userId, async (s) => {
        const b = asBody(
          z.object({ key: id, items: z.array(z.object({ productId: id, quantity })) }),
          req,
        );
        if (await s.get('purchases', b.key))
          return (await s.get('carts', params(req).userId)) ?? { items: [] };
        const cart = (await s.get<{ items: CartItem[] }>('carts', params(req).userId)) ?? {
          items: [],
        };
        cart.items = cart.items
          .map((i) => ({
            ...i,
            quantity:
              i.quantity - (b.items.find((x) => x.productId === i.productId)?.quantity ?? 0),
          }))
          .filter((i) => i.quantity > 0);
        await s.put('carts', params(req).userId, cart);
        await s.put('purchases', b.key, { done: true });
        return cart;
      }),
    );
  }
  if (name === 'wishlist') {
    app.get(
      '/users/:userId',
      async (req) => (await store.get('wishlists', params(req).userId)) ?? { items: [] },
    );
    app.put('/users/:userId/:id', async (req) => {
      await call('catalog', `/products/${encodeURIComponent(params(req).id)}`);
      return store.transaction(params(req).userId, async (s) => {
        const p = params(req);
        const list = (await s.get<{ items: string[] }>('wishlists', p.userId)) ?? { items: [] };
        list.items = [...new Set([...list.items, p.id])];
        await s.put('wishlists', p.userId, list);
        return list;
      });
    });
    app.delete('/users/:userId/:id', async (req) =>
      store.transaction(params(req).userId, async (s) => {
        const p = params(req);
        const list = (await s.get<{ items: string[] }>('wishlists', p.userId)) ?? { items: [] };
        list.items = list.items.filter((i) => i !== p.id);
        await s.put('wishlists', p.userId, list);
        return list;
      }),
    );
  }
  if (name === 'reviews') {
    app.get('/products/:id', async (req) =>
      (await store.list<any>('reviews')).filter((r) => r.productId === params(req).id),
    );
    app.post('/products/:id', async (req) => {
      const b = asBody(
        z.object({
          userId: id,
          name: z.string().min(1).max(80),
          rating: z.number().int().min(1).max(5),
          comment: z.string().trim().min(1).max(1000),
        }),
        req,
      );
      await call('catalog', `/products/${encodeURIComponent(params(req).id)}`);
      const value = { id: `${b.userId}:${params(req).id}`, productId: params(req).id, ...b };
      await store.put('reviews', value.id, value);
      return value;
    });
  }
  if (name === 'promotions')
    app.get('/coupons/:code', async (req) => {
      const coupon = await store.get<any>('coupons', params(req).code.toUpperCase());
      ensure(coupon?.active, 400, 'Coupon is invalid');
      return coupon;
    });
  if (name === 'orders') {
    app.get('/orders', async (req) =>
      (await store.list<Order>('orders'))
        .filter((o) => !query(req).userId || o.userId === query(req).userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
    app.get('/orders/:id', async (req) => {
      const order = await store.get('orders', params(req).id);
      ensure(order, 404, 'Order not found');
      return order;
    });
    app.put('/orders/:id', async (req) => {
      const order = asBody(
        z.object({
          id,
          userId: id,
          status: z.enum(['pending', 'paid', 'failed']),
          quote: z.any(),
          address: z.any(),
          createdAt: z.iso.datetime(),
          failure: z.string().optional(),
        }),
        req,
      );
      ensure(order.id === params(req).id, 400, 'Order ID mismatch');
      await store.put('orders', order.id, order);
      return order;
    });
  }
  if (name === 'payments') {
    app.post('/charge', async (req) => {
      const b = asBody(
        z.object({
          key: id,
          amount: z.number().int().min(0),
          mode: z.enum(['approve', 'decline']),
        }),
        req,
      );
      return store.transaction(b.key, async (s) => {
        const old = await s.get('payments', b.key);
        if (old) return old;
        const value = {
          id: b.key,
          amount: b.amount,
          status: b.mode === 'decline' ? 'declined' : 'paid',
        };
        await s.put('payments', b.key, value);
        return value;
      });
    });
    app.post('/refund/:id', async (req) =>
      store.transaction(params(req).id, async (s) => {
        const p = await s.get<any>('payments', params(req).id);
        ensure(p, 404, 'Payment not found');
        if (p.status === 'paid') {
          p.status = 'refunded';
          await s.put('payments', p.id, p);
        }
        return p;
      }),
    );
  }
  if (name === 'shipping') {
    app.get('/quote', async () => ({ amount: 500, label: 'Standard shipping' }));
    app.post('/shipments', async (req) => {
      const b = asBody(z.object({ orderId: id }), req);
      return store.transaction(b.orderId, async (s) => {
        const old = await s.get('shipments', b.orderId);
        if (old) return old;
        const shipment = {
          orderId: b.orderId,
          status: 'processing',
          tracking: `LM-${b.orderId.slice(0, 8).toUpperCase()}`,
        };
        await s.put('shipments', b.orderId, shipment);
        return shipment;
      });
    });
    app.get(
      '/shipments/:id',
      async (req) =>
        (await store.get('shipments', params(req).id)) ?? { status: 'pending', tracking: null },
    );
    app.put('/shipments/:id', async (req) => {
      const b = asBody(z.object({ status: z.enum(['processing', 'shipped', 'delivered']) }), req);
      const shipment = await store.get<any>('shipments', params(req).id);
      ensure(shipment, 404, 'Shipment not found');
      const value = { ...shipment, ...b };
      await store.put('shipments', params(req).id, value);
      return value;
    });
  }
  if (name === 'notifications') {
    app.post('/notifications', async (req) => {
      const b = asBody(z.object({ id, userId: id, message: z.string().min(1).max(500) }), req);
      const old = await store.get('notifications', b.id);
      if (old) return old;
      const value = { ...b, read: false, createdAt: new Date(now()).toISOString() };
      await store.put('notifications', b.id, value);
      return value;
    });
    app.get('/users/:userId', async (req) =>
      (await store.list<any>('notifications')).filter((n) => n.userId === params(req).userId),
    );
    app.put('/users/:userId/:id/read', async (req) => {
      const p = params(req);
      const note = await store.get<any>('notifications', p.id);
      ensure(note?.userId === p.userId, 404, 'Notification not found');
      note.read = true;
      await store.put('notifications', p.id, note);
      return note;
    });
  }
  if (name === 'recommendations')
    app.get('/products/:id', async (req) => {
      const product = await call<Product>('catalog', `/products/${params(req).id}`);
      return (await call<Product[]>('catalog', '/products'))
        .filter((p) => p.id !== product.id && p.categoryId === product.categoryId)
        .slice(0, 4);
    });
  if (name === 'audit') {
    app.post('/events', async (req) => {
      const b = asBody(
        z.object({ id, actor: id, action: z.string().min(1).max(120), target: id }),
        req,
      );
      const value = { ...b, createdAt: new Date(now()).toISOString() };
      await store.put('events', value.id, value);
      return value;
    });
    app.get('/events', async () => store.list('events'));
  }
  if (name === 'checkout') registerCheckout(app, ctx);
  return app;
}
const productSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  categoryId: id,
  emoji: z.string().max(10),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  active: z.boolean(),
});

async function gateway(app: FastifyInstance, { call }: Context) {
  const user = async (req: FastifyRequest) =>
    call<User>('auth', '/session', 'POST', { session: req.cookies.session ?? '' });
  const admin = async (req: FastifyRequest) => {
    const u = await user(req);
    ensure(u.role === 'admin', 403, 'Admin access required');
    return u;
  };
  const body = (req: FastifyRequest) => req.body as any;
  const enrich = async (products: Product[]) =>
    Promise.all(
      products.map(async (p) => ({
        ...p,
        price: (await call('pricing', `/prices/${p.id}`)).amount,
        stock: (await call('inventory', `/stock/${p.id}`)).quantity,
      })),
    );
  app.post('/api/v1/auth/login', async (req, reply) => {
    const result = await call('auth', '/login', 'POST', req.body);
    reply.setCookie('session', result.session, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: 86400,
    });
    return result.user;
  });
  app.get('/api/v1/auth/me', async (req) => user(req));
  app.post('/api/v1/auth/logout', async (req, reply) => {
    await call('auth', '/logout', 'POST', { session: req.cookies.session ?? '' });
    reply.clearCookie('session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/v1/categories', async () => call('category', '/categories'));
  app.get('/api/v1/products', async (req) => {
    const q = query(req);
    return enrich(
      await call(
        'search',
        `/products?q=${encodeURIComponent(q.q ?? '')}&category=${encodeURIComponent(q.category ?? '')}`,
      ),
    );
  });
  app.get(
    '/api/v1/products/:id',
    async (req) =>
      (
        await enrich([
          await call<Product>('catalog', `/products/${encodeURIComponent(params(req).id)}`),
        ])
      )[0],
  );
  app.get('/api/v1/products/:id/recommendations', async (req) =>
    enrich(await call('recommendations', `/products/${encodeURIComponent(params(req).id)}`)),
  );
  app.get('/api/v1/products/:id/reviews', async (req) =>
    call('reviews', `/products/${encodeURIComponent(params(req).id)}`),
  );
  app.post('/api/v1/products/:id/reviews', async (req) => {
    const u = await user(req);
    return call('reviews', `/products/${encodeURIComponent(params(req).id)}`, 'POST', {
      ...body(req),
      userId: u.id,
      name: u.name,
    });
  });
  app.get('/api/v1/profile', async (req) => {
    const u = await user(req);
    return { ...u, ...(await call('profile', `/users/${u.id}`)) };
  });
  app.put('/api/v1/profile', async (req) =>
    call('profile', `/users/${(await user(req)).id}`, 'PUT', req.body),
  );
  for (const resource of ['address', 'cart', 'wishlist', 'notifications'] as const) {
    const path = resource === 'address' ? 'addresses' : resource;
    app.get(`/api/v1/${path}`, async (req) => call(resource, `/users/${(await user(req)).id}`));
  }
  app.post('/api/v1/addresses', async (req) =>
    call('address', `/users/${(await user(req)).id}`, 'POST', req.body),
  );
  app.delete('/api/v1/addresses/:id', async (req) =>
    call(
      'address',
      `/users/${(await user(req)).id}/${encodeURIComponent(params(req).id)}`,
      'DELETE',
    ),
  );
  for (const method of ['PUT', 'DELETE'] as const) {
    app.route({
      method,
      url: '/api/v1/cart/items/:id',
      handler: async (req) =>
        call(
          'cart',
          `/users/${(await user(req)).id}/items/${encodeURIComponent(params(req).id)}`,
          method,
          req.body,
        ),
    });
    app.route({
      method,
      url: '/api/v1/wishlist/:id',
      handler: async (req) =>
        call(
          'wishlist',
          `/users/${(await user(req)).id}/${encodeURIComponent(params(req).id)}`,
          method,
        ),
    });
  }
  app.put('/api/v1/notifications/:id/read', async (req) =>
    call(
      'notifications',
      `/users/${(await user(req)).id}/${encodeURIComponent(params(req).id)}/read`,
      'PUT',
    ),
  );
  app.post('/api/v1/checkout/quote', async (req) =>
    call('checkout', '/quote', 'POST', { ...body(req), userId: (await user(req)).id }),
  );
  app.post('/api/v1/checkout', async (req) =>
    call('checkout', '/checkout', 'POST', { ...body(req), userId: (await user(req)).id }),
  );
  app.get('/api/v1/orders', async (req) =>
    call('orders', `/orders?userId=${(await user(req)).id}`),
  );
  const ownedOrder = async (req: FastifyRequest) => {
    const u = await user(req);
    const order = await call<Order>('orders', `/orders/${encodeURIComponent(params(req).id)}`);
    ensure(order.userId === u.id || u.role === 'admin', 404, 'Order not found');
    return order;
  };
  app.get('/api/v1/orders/:id', async (req) => ownedOrder(req));
  app.get('/api/v1/orders/:id/shipment', async (req) => {
    await ownedOrder(req);
    return call('shipping', `/shipments/${encodeURIComponent(params(req).id)}`);
  });
  app.get('/api/v1/admin/products', async (req) => {
    await admin(req);
    return enrich(await call('catalog', '/products?admin=true'));
  });
  app.get('/api/v1/admin/orders', async (req) => {
    await admin(req);
    return call('orders', '/orders');
  });
  app.get('/api/v1/admin/audit', async (req) => {
    await admin(req);
    return call('audit', '/events');
  });
  for (const method of ['POST', 'PUT'] as const)
    app.route({
      method,
      url: `/api/v1/admin/products${method === 'PUT' ? '/:id' : ''}`,
      handler: async (req) => {
        const u = await admin(req);
        const b = z
          .object({
            product: productSchema,
            amount: z.number().int().min(0).max(10000000),
            quantity: z.number().int().min(0).max(100000),
          })
          .parse(req.body);
        const product = await call<Product>(
          'catalog',
          `/products${method === 'PUT' ? `/${encodeURIComponent(params(req).id)}` : ''}`,
          method,
          b.product,
        );
        await call('pricing', `/prices/${product.id}`, 'PUT', { amount: b.amount });
        await call('inventory', `/stock/${product.id}`, 'PUT', { quantity: b.quantity });
        await call('audit', '/events', 'POST', {
          id: randomUUID(),
          actor: u.id,
          action: 'product.saved',
          target: product.id,
        });
        return product;
      },
    });
  app.put('/api/v1/admin/orders/:id/shipment', async (req) => {
    const u = await admin(req);
    const order = await call<Order>('orders', `/orders/${encodeURIComponent(params(req).id)}`);
    ensure(order.status === 'paid', 409, 'Only paid orders can ship');
    const result = await call('shipping', `/shipments/${order.id}`, 'PUT', req.body);
    await call('audit', '/events', 'POST', {
      id: randomUUID(),
      actor: u.id,
      action: `shipment.${result.status}`,
      target: order.id,
    });
    return result;
  });
}
export { recoverCheckouts };
