// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { App, QuoteSummary } from './App';
import { api } from './api';
const shopper = {
  id: 'shopper-1',
  name: 'Alex Morgan',
  email: 'shopper@little.market',
  role: 'shopper',
};
const product = {
  id: 'product-1',
  name: 'Everyday tote',
  description: 'Made for everyday',
  categoryId: 'essentials',
  emoji: '👜',
  color: '#aabbcc',
  active: true,
  price: 1500,
  stock: 20,
};
const address = {
  id: 'address-1',
  userId: 'shopper-1',
  name: 'Alex Morgan',
  line1: '123 Market Street',
  city: 'Portland',
  postalCode: '97201',
  country: 'US',
};
const quote = {
  items: [
    {
      productId: 'product-1',
      name: 'Everyday tote',
      quantity: 2,
      unitPrice: 1500,
      lineTotal: 3000,
    },
  ],
  subtotal: 3000,
  discount: 300,
  shipping: 500,
  total: 3200,
  currency: 'USD' as const,
};
const order = {
  id: 'order-123456',
  userId: 'shopper-1',
  status: 'paid',
  createdAt: '2026-10-31T10:00:00.000Z',
  quote,
  address,
};
let signedIn = true;
let role = 'shopper';
let empty = false;
let fail = '';
let cart = [{ productId: 'product-1', quantity: 2 }];
let notes = [
  { id: 'note-1', message: 'Your order is confirmed', createdAt: order.createdAt, read: false },
];
let mock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  signedIn = true;
  role = 'shopper';
  empty = false;
  fail = '';
  cart = [{ productId: 'product-1', quantity: 2 }];
  notes = [
    { id: 'note-1', message: 'Your order is confirmed', createdAt: order.createdAt, read: false },
  ];
  sessionStorage.clear();
  mock = vi.fn(async (url: string, options: RequestInit = {}) => {
    const path = url.replace('/api/v1', '');
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(String(options.body)) : {};
    const response = (data: unknown, status = 200) => ({
      ok: status < 400,
      status,
      json: async () => data,
    });
    if (fail && path.startsWith(fail))
      return response({ message: 'Service unavailable. Try again.' }, 503);
    if (path === '/auth/me')
      return signedIn
        ? response({ ...shopper, role })
        : response({ message: 'Please sign in' }, 401);
    if (path === '/auth/login') {
      signedIn = true;
      return response({ ...shopper, role });
    }
    if (path === '/auth/logout') {
      signedIn = false;
      return response({ ok: true });
    }
    if (path === '/profile') return response({ ...shopper, ...body });
    if (path === '/categories')
      return response([
        { id: 'essentials', name: 'Everyday essentials' },
        { id: 'home', name: 'Home & living' },
      ]);
    if (path.startsWith('/products?') || path === '/products' || path === '/admin/products')
      return response(empty ? [] : [product]);
    if (path.endsWith('/recommendations')) return response([]);
    if (path.endsWith('/reviews')) return response(method === 'GET' ? [] : body);
    if (path === '/products/product-1') return response(product);
    if (path === '/addresses')
      return response(method === 'GET' ? (empty ? [] : [address]) : { ...address, ...body });
    if (path.startsWith('/addresses/')) return response({ ok: true });
    if (path === '/wishlist') return response({ items: empty ? [] : ['product-1'] });
    if (path.startsWith('/wishlist/')) return response({ ok: true });
    if (path === '/cart') return response({ items: empty ? [] : cart });
    if (path.startsWith('/cart/items/')) {
      cart = method === 'DELETE' ? [] : [{ productId: 'product-1', quantity: body.quantity }];
      return response({ items: cart });
    }
    if (path === '/checkout/quote') return response(quote);
    if (path === '/checkout') return response(order);
    if (path === '/orders' || path === '/admin/orders') return response(empty ? [] : [order]);
    if (path.endsWith('/shipment'))
      return response({ status: 'processing', tracking: 'LM-ORDER-1' });
    if (path.startsWith('/orders/')) return response(order);
    if (path === '/notifications') return response(empty ? [] : notes);
    if (path.endsWith('/read')) {
      notes = notes.map((n) => ({ ...n, read: true }));
      return response({ ok: true });
    }
    if (path === '/admin/audit')
      return response([
        { id: 'event-1', action: 'checkout.paid', actor: 'shopper-1', createdAt: order.createdAt },
      ]);
    return response({ id: 'product-2', ...body });
  });
  vi.stubGlobal('fetch', mock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function open(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
const called = (path: string, method: string) =>
  mock.mock.calls.some(([url, opt]) => url === '/api/v1' + path && opt?.method === method);
describe('all 15 page routes', () => {
  it.each([
    ['/', 'Little things.'],
    ['/catalog', 'Good things for every day.'],
    ['/products/product-1', 'A thoughtful find'],
    ['/wishlist', 'Your little favorites.'],
    ['/cart', 'Your shopping bag.'],
    ['/checkout', 'Make it yours.'],
    ['/confirmation/order-123456', 'Thanks for shopping small.'],
    ['/profile', 'Hello, you.'],
    ['/addresses', 'Your address book.'],
    ['/orders', 'Your good finds, so far.'],
    ['/orders/order-123456', 'Order #order-12'],
    ['/notifications', 'A few little updates.'],
  ])('renders %s', async (path, title) => {
    open(path);
    if (path === '/') await screen.findByRole('heading', { name: /Little things/ });
    else if (path.includes('/products/'))
      await screen.findByRole('heading', { level: 1, name: 'Everyday tote' });
    else await screen.findByRole('heading', { level: 1, name: title });
  });
  it('renders login for guests', async () => {
    signedIn = false;
    open('/login');
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  });
  it.each([
    ['/admin/products', 'The little store room.'],
    ['/admin/orders', 'Orders, on their way.'],
  ])('renders admin page %s', async (path, title) => {
    role = 'admin';
    open(path);
    expect(await screen.findByRole('heading', { name: title })).toBeVisible();
  });
});
describe('navigation and access', () => {
  it('redirects a guest away from private pages', async () => {
    signedIn = false;
    open('/cart');
    await screen.findByRole('heading', { name: 'Welcome back.' });
  });
  it('blocks shoppers from admin pages', async () => {
    open('/admin/products');
    await screen.findByRole('heading', { name: 'Admin access required' });
    expect(screen.queryByRole('button', { name: /Add product/ })).not.toBeInTheDocument();
  });
  it('handles unknown routes', async () => {
    open('/missing');
    await screen.findByRole('heading', { name: 'This page wandered off.' });
  });
  it('opens and closes mobile navigation', async () => {
    open();
    await screen.findByRole('heading', { name: /Little things/ });
    await userEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
    expect(screen.getByRole('link', { name: 'Shop all' }).parentElement).toHaveClass('open');
    await userEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
    expect(screen.getByRole('link', { name: 'Shop all' }).parentElement).not.toHaveClass('open');
  });
  it('logs in and routes to catalog', async () => {
    signedIn = false;
    open('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Good things for every day.' });
    expect(called('/auth/login', 'POST')).toBe(true);
  });
  it('shows login failures', async () => {
    signedIn = false;
    fail = '/auth/login';
    open('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  });
  it('signs out', async () => {
    open('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Welcome back.' });
    expect(called('/auth/logout', 'POST')).toBe(true);
  });
});
describe('shopping interactions', () => {
  it('updates search and category filters', async () => {
    open('/catalog');
    const search = await screen.findByRole('textbox', { name: 'Search products' });
    await userEvent.type(search, 'mug');
    await waitFor(() => expect(mock.mock.calls.some(([url]) => url.includes('q=mug'))).toBe(true));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Filter category' }),
      'home',
    );
    await waitFor(() =>
      expect(mock.mock.calls.some(([url]) => url.includes('category=home'))).toBe(true),
    );
  });
  it('shows empty search results', async () => {
    empty = true;
    open('/catalog');
    await screen.findByRole('heading', { name: 'No finds just yet' });
  });
  it('shows backend errors', async () => {
    fail = '/products';
    open('/catalog');
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  });
  it('saves a product to the wishlist and dismisses the toast', async () => {
    open('/catalog');
    await userEvent.click(await screen.findByRole('button', { name: 'Save Everyday tote' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved to your wishlist');
    expect(called('/wishlist/product-1', 'PUT')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('takes guests to login when saving a product', async () => {
    signedIn = false;
    open('/catalog');
    await userEvent.click(await screen.findByRole('button', { name: 'Save Everyday tote' }));
    await screen.findByRole('heading', { name: 'Welcome back.' });
  });
  it('adds a product while preserving existing quantity', async () => {
    open('/products/product-1');
    await userEvent.click(await screen.findByRole('button', { name: /Add to bag/ }));
    await screen.findByRole('status');
    expect(
      mock.mock.calls.find(
        ([url, opt]) => url.endsWith('/cart/items/product-1') && opt?.method === 'PUT',
      )?.[1]?.body,
    ).toBe(JSON.stringify({ quantity: 3 }));
  });
  it('posts a review', async () => {
    open('/products/product-1');
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Your review' }),
      'A lovely tote',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Thank you');
    expect(called('/products/product-1/reviews', 'POST')).toBe(true);
  });
  it('removes wishlist items', async () => {
    open('/wishlist');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from wishlist' }));
    await waitFor(() => expect(called('/wishlist/product-1', 'DELETE')).toBe(true));
  });
  it('shows an empty wishlist', async () => {
    empty = true;
    open('/wishlist');
    await screen.findByRole('heading', { name: 'Room for a few favorites' });
  });
  it('increases cart quantity', async () => {
    open('/cart');
    await userEvent.click(await screen.findByRole('button', { name: 'Increase Everyday tote' }));
    await waitFor(() => expect(called('/cart/items/product-1', 'PUT')).toBe(true));
    expect(cart[0].quantity).toBe(3);
  });
  it('removes cart items', async () => {
    open('/cart');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await screen.findByRole('heading', { name: 'Your bag is taking a little break' });
  });
  it('renders correct quote totals', () => {
    render(<QuoteSummary quote={quote} />);
    expect(screen.getByText('$32.00')).toBeVisible();
    expect(screen.getByText('−$3.00')).toBeVisible();
  });
  it('places a demo order and displays confirmation', async () => {
    open('/checkout');
    const button = await screen.findByRole('button', { name: /Place demo order/ });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await screen.findByRole('heading', { name: 'Thanks for shopping small.' });
    expect(called('/checkout', 'POST')).toBe(true);
    expect(sessionStorage.getItem('checkoutKey')).toBeNull();
  });
  it('applies a coupon to the quote', async () => {
    open('/checkout');
    await userEvent.type(await screen.findByRole('textbox', { name: 'Coupon code' }), 'WELCOME10');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url, opt]) =>
            url.endsWith('/checkout/quote') &&
            opt?.body === JSON.stringify({ coupon: 'WELCOME10' }),
        ),
      ).toBe(true),
    );
  });
  it('keeps the checkout key when a request fails for a safe retry', async () => {
    open('/checkout');
    const button = await screen.findByRole('button', { name: /Place demo order/ });
    await waitFor(() => expect(button).toBeEnabled());
    fail = '/checkout';
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(sessionStorage.getItem('checkoutKey')).toBeTruthy();
  });
  it('requires a shipping address', async () => {
    empty = true;
    open('/checkout');
    await screen.findByText(/Add a shipping address/);
    expect(screen.getByRole('button', { name: /Place demo order/ })).toBeDisabled();
  });
});
describe('account and admin interactions', () => {
  it('saves a profile name', async () => {
    open('/profile');
    const name = await screen.findByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Alex New');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('profile is updated');
  });
  it('adds an address', async () => {
    open('/addresses');
    await userEvent.type(await screen.findByRole('textbox', { name: 'Full name' }), 'Alex');
    await userEvent.type(screen.getByRole('textbox', { name: 'Street address' }), '1 Main St');
    await userEvent.type(screen.getByRole('textbox', { name: 'City' }), 'Portland');
    await userEvent.type(screen.getByRole('textbox', { name: 'Postal code' }), '97201');
    await userEvent.click(screen.getByRole('button', { name: 'Save address' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Address added');
    expect(called('/addresses', 'POST')).toBe(true);
  });
  it('deletes an address', async () => {
    open('/addresses');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove address' }));
    await waitFor(() => expect(called('/addresses/address-1', 'DELETE')).toBe(true));
  });
  it('shows empty order history', async () => {
    empty = true;
    open('/orders');
    await screen.findByRole('heading', { name: 'Your first find is waiting' });
  });
  it('shows order tracking and delivery address', async () => {
    open('/orders/order-123456');
    await screen.findByText('LM-ORDER-1');
    expect(screen.getByText(/123 Market Street/)).toBeVisible();
    expect(screen.getByText('$32.00')).toBeVisible();
  });
  it('marks notifications read', async () => {
    open('/notifications');
    await userEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    await screen.findByText('Read');
    expect(called('/notifications/note-1/read', 'PUT')).toBe(true);
  });
  it('opens, saves and closes the product editor', async () => {
    role = 'admin';
    open('/admin/products');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Everyday tote' }));
    const dialog = screen.getByRole('dialog', { name: 'Product editor' });
    expect(dialog).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(called('/admin/products/product-1', 'PUT')).toBe(true);
  });
  it('opens a new product form and allows cancel', async () => {
    role = 'admin';
    open('/admin/products');
    await userEvent.click(await screen.findByRole('button', { name: 'Add product' }));
    expect(screen.getByRole('heading', { name: 'Add a good find' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('updates a shipment and shows audit entries', async () => {
    role = 'admin';
    open('/admin/orders');
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Update shipment order-12' }),
      'shipped',
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Shipment updated');
    expect(called('/admin/orders/order-123456/shipment', 'PUT')).toBe(true);
    expect(screen.getByText('checkout.paid')).toBeVisible();
  });
});
describe('HTTP client', () => {
  it('sends JSON and same-origin credentials', async () => {
    await api('/profile', 'PUT', { name: 'Test' });
    expect(mock.mock.calls[0][1]).toMatchObject({
      credentials: 'same-origin',
      body: '{"name":"Test"}',
      headers: { 'content-type': 'application/json' },
    });
  });
  it('surfaces API error messages', async () => {
    fail = '/profile';
    await expect(api('/profile')).rejects.toThrow('Service unavailable');
  });
});
