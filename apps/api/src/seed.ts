import type { Store } from './store.js';
import { hashPassword } from './domain.js';
import type { ServiceName, Product } from '../../../packages/shared/src/index.js';
const names = [
  ['Everyday tote', 'essentials', '👜', '#eadcc8'],
  ['Ceramic mug', 'home', '☕', '#e6d5c1'],
  ['Desk lamp', 'home', '💡', '#e6e6cb'],
  ['Canvas sneakers', 'essentials', '👟', '#d4ddd4'],
  ['Pocket notebook', 'desk', '📓', '#e6d8d2'],
  ['Water bottle', 'outdoors', '🍶', '#d3dfdd'],
  ['Wool blanket', 'home', '🧶', '#e9d5ca'],
  ['Wireless headphones', 'desk', '🎧', '#d7d9e1'],
  ['Daypack', 'outdoors', '🎒', '#dedfc7'],
  ['Plant pot', 'home', '🪴', '#dce3cb'],
];
export async function seedService(name: ServiceName, store: Store) {
  if (await store.get('meta', 'seeded')) return;
  if (name === 'auth')
    for (const [id, email, display, role] of [
      ['shopper-1', 'shopper@little.market', 'Alex Morgan', 'shopper'],
      ['shopper-2', 'sam@little.market', 'Sam Rivera', 'shopper'],
      ['admin-1', 'admin@little.market', 'Store Admin', 'admin'],
    ])
      await store.put('users', id, {
        id,
        email,
        name: display,
        role,
        passwordHash: hashPassword('Demo123!'),
      });
  if (name === 'profile')
    for (const [id, display] of [
      ['shopper-1', 'Alex Morgan'],
      ['shopper-2', 'Sam Rivera'],
      ['admin-1', 'Store Admin'],
    ])
      await store.put('profiles', id, { id, name: display });
  if (name === 'address')
    await store.put('addresses', 'address-1', {
      id: 'address-1',
      userId: 'shopper-1',
      name: 'Alex Morgan',
      line1: '123 Market Street',
      city: 'Portland',
      postalCode: '97201',
      country: 'US',
    });
  if (name === 'category')
    for (const [id, label] of [
      ['essentials', 'Everyday essentials'],
      ['home', 'Home & living'],
      ['desk', 'Work & desk'],
      ['outdoors', 'Out & about'],
    ])
      await store.put('categories', id, { id, name: label });
  for (let i = 0; i < 30; i++) {
    const [label, categoryId, emoji, color] = names[i % 10];
    const id = `product-${i + 1}`;
    if (name === 'catalog')
      await store.put<Product>('products', id, {
        id,
        name: label + (i >= 10 ? ` · ${i >= 20 ? 'Studio' : 'Classic'}` : ''),
        description:
          'Thoughtfully made for the little moments. A practical, beautifully simple addition to your everyday routine.',
        categoryId,
        emoji,
        color,
        active: true,
      });
    if (name === 'pricing')
      await store.put('prices', id, { productId: id, amount: 1500 + i * 350 });
    if (name === 'inventory') await store.put('stock', id, { productId: id, quantity: 20 });
    if (name === 'reviews' && i < 5)
      await store.put('reviews', `review-${i}`, {
        id: `review-${i}`,
        userId: 'shopper-2',
        productId: id,
        rating: 5,
        comment: 'Lovely quality. Exactly what I was looking for.',
        name: 'Sam Rivera',
      });
  }
  if (name === 'promotions')
    await store.put('coupons', 'WELCOME10', { code: 'WELCOME10', percent: 10, active: true });
  await store.put('meta', 'seeded', { at: new Date().toISOString() });
}
