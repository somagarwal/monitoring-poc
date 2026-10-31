import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Quote } from '../../../packages/shared/src/index.js';
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new ApiError(status, message);
}
export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function calculateQuote(
  items: Quote['items'],
  discountPercent: number,
  shipping: number,
): Quote {
  ensure(items.length > 0, 400, 'Your cart is empty');
  ensure(
    Number.isInteger(discountPercent) && discountPercent >= 0 && discountPercent <= 100,
    400,
    'Invalid discount',
  );
  const subtotal = items.reduce((sum, item) => {
    ensure(
      Number.isSafeInteger(item.unitPrice) &&
        item.unitPrice >= 0 &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 99,
      400,
      'Invalid price or quantity',
    );
    return sum + item.unitPrice * item.quantity;
  }, 0);
  const discount = Math.floor((subtotal * discountPercent) / 100);
  return {
    items: items.map((i) => ({ ...i, lineTotal: i.unitPrice * i.quantity })),
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
    currency: 'USD',
  };
}
