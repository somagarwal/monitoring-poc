import { test, expect, type Page } from '@playwright/test';
async function login(page: Page, admin = false) {
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(admin ? 'admin@little.market' : 'shopper@little.market');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(admin ? /\/admin\/products/ : /\/catalog/);
}
async function clearCart(page: Page) {
  const res = await page.request.get('/api/v1/cart');
  const cart = await res.json();
  for (const item of cart.items) await page.request.delete(`/api/v1/cart/items/${item.productId}`);
}
test('guest browsing, search, filters, product details and protected pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Little things/ })).toBeVisible();
  await page.getByRole('link', { name: 'Find your everyday' }).click();
  await expect(page.getByRole('heading', { name: 'Good things for every day.' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search products', exact: true }).fill('Ceramic mug');
  await expect(page.getByText('3 thoughtful finds')).toBeVisible();
  await page.getByLabel('Filter category').selectOption('home');
  await page.getByRole('link', { name: 'View Ceramic mug', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ceramic mug' })).toBeVisible();
  await expect(page.getByText('You might also love')).toBeVisible();
  await page.goto('/cart');
  await expect(page).toHaveURL(/\/login/);
});
test('shopper completes a purchase and reads order tracking and notification', async ({ page }) => {
  await login(page);
  await clearCart(page);
  await page.goto('/products/product-1');
  await page.getByRole('button', { name: /Add to bag/ }).click();
  await expect(page.getByRole('status')).toContainText('added to your bag');
  await page.goto('/cart');
  await expect(page.getByText('Everyday tote', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Continue to checkout/ }).click();
  await page.getByLabel('Coupon code').fill('WELCOME10');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const product = await (await page.request.get('/api/v1/products/product-1')).json();
  const expectedDiscount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.floor(product.price * 0.1) / 100);
  await expect(page.getByText(`−${expectedDiscount}`)).toBeVisible();
  await page.getByRole('button', { name: /Place demo order/ }).click();
  await expect(page).toHaveURL(/\/confirmation\//);
  await page.getByRole('link', { name: 'View your order' }).click();
  await expect(page.getByText('processing', { exact: true })).toBeVisible();
  await expect(page.getByText(/LM-/)).toBeVisible();
  await page.goto('/orders');
  await expect(page.getByText('paid', { exact: true }).first()).toBeVisible();
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Mark read' }).first().click();
  await expect(page.getByText('Read', { exact: true }).first()).toBeVisible();
});
test('declined checkout retains the cart and does not consume stock', async ({ page }) => {
  await login(page);
  await clearCart(page);
  const before = await (await page.request.get('/api/v1/products/product-2')).json();
  await page.request.put('/api/v1/cart/items/product-2', { data: { quantity: 1 } });
  await page.goto('/checkout');
  await page.getByLabel('Payment outcome').selectOption('decline');
  await page.getByRole('button', { name: /Place demo order/ }).click();
  await expect(page.getByRole('alert')).toContainText('Payment declined');
  const after = await (await page.request.get('/api/v1/products/product-2')).json();
  expect(after.stock).toBe(before.stock);
  await page.goto('/cart');
  await expect(page.getByText('Ceramic mug', { exact: true })).toBeVisible();
  await clearCart(page);
});
test('wishlist, profile, address and review flows', async ({ page }) => {
  await login(page);
  await page.goto('/catalog');
  await page.getByRole('button', { name: 'Save Everyday tote', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved to your wishlist');
  await page.goto('/wishlist');
  await expect(page.getByText('Everyday tote', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove from wishlist' }).click();
  await expect(page.getByRole('heading', { name: 'Room for a few favorites' })).toBeVisible();
  await page.goto('/profile');
  await page.getByLabel('Name', { exact: true }).fill('Alex Test');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('profile is updated');
  await page.goto('/addresses');
  const addressName = `Test address ${Date.now()}`;
  await page.getByLabel('Full name').fill(addressName);
  await page.getByLabel('Street address').fill('5 Test Street');
  await page.getByLabel('City', { exact: true }).fill('Portland');
  await page.getByLabel('Postal code').fill('97201');
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByText(addressName, { exact: true })).toBeVisible();
  await page
    .locator('.address-card')
    .filter({ hasText: addressName })
    .getByRole('button', { name: 'Remove address' })
    .click();
  await expect(page.getByText(addressName, { exact: true })).toHaveCount(0);
  await page.goto('/products/product-1');
  await page.getByLabel('Your review').fill('Useful and lovely');
  await page.getByRole('button', { name: 'Post review' }).click();
  await expect(page.getByRole('status')).toContainText('Thank you for your review');
  await expect(
    page.locator('.reviews article').getByText('Useful and lovely', { exact: true }),
  ).toBeVisible();
});
test('admin edits stock and product pricing, advances shipping and sees audit', async ({
  page,
}) => {
  await login(page, true);
  await page.getByRole('button', { name: 'Edit Everyday tote', exact: true }).click();
  await page.getByLabel('Price (cents)').fill('1800');
  await page.getByLabel('Stock', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Everyday tote' }).first()).toContainText(
    '$18.00',
  );
  await page.goto('/admin/orders');
  const select = page.getByRole('combobox').first();
  if (await select.count()) {
    await select.selectOption('shipped');
    await expect(page.getByRole('status')).toContainText('Shipment updated');
  }
  await expect(page.getByText('product.saved', { exact: true }).first()).toBeVisible();
});
test('mobile layout stays within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Little things/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.getByRole('link', { name: 'Shop all', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-home.png', fullPage: true });
});

test('checkout works when randomUUID is unavailable on plain HTTP LAN origins', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await clearCart(page);
  await page.request.put('/api/v1/cart/items/product-2', { data: { quantity: 1 } });
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Make it yours.' })).toBeVisible();
  await page.getByLabel('Payment outcome').selectOption('decline');
  await page.getByLabel('Payment outcome').selectOption('approve');
  await page.getByRole('button', { name: /Place demo order/ }).click();
  await expect(page).toHaveURL(/\/confirmation\//);
  expect(errors).toEqual([]);
});
