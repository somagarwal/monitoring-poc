export const services = [
  'gateway',
  'auth',
  'profile',
  'address',
  'catalog',
  'category',
  'search',
  'inventory',
  'pricing',
  'cart',
  'wishlist',
  'reviews',
  'promotions',
  'checkout',
  'orders',
  'payments',
  'shipping',
  'notifications',
  'recommendations',
  'audit',
] as const;
export type ServiceName = (typeof services)[number];
export type User = { id: string; email: string; name: string; role: 'shopper' | 'admin' };
export type Product = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  emoji: string;
  color: string;
  active: boolean;
};
export type CartItem = { productId: string; quantity: number };
export type Address = {
  id: string;
  userId: string;
  name: string;
  line1: string;
  city: string;
  postalCode: string;
  country: string;
};
export type Quote = {
  items: Array<CartItem & { name: string; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  currency: 'USD';
};
export type Order = {
  id: string;
  userId: string;
  status: 'pending' | 'paid' | 'failed';
  quote: Quote;
  address: Address;
  createdAt: string;
  failure?: string;
};
export const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
