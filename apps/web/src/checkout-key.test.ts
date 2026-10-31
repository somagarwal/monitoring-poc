import { afterEach, expect, it, vi } from 'vitest';
import { createCheckoutKey } from './checkout-key';

afterEach(() => vi.unstubAllGlobals());

it('uses native randomUUID when the browser supports it', () => {
  const randomUUID = vi.fn(() => 'native-checkout-key');
  vi.stubGlobal('crypto', { randomUUID });
  expect(createCheckoutKey()).toBe('native-checkout-key');
  expect(randomUUID).toHaveBeenCalledOnce();
});

it('generates a version 4 UUID without randomUUID on HTTP LAN origins', () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(255));
  vi.stubGlobal('crypto', { getRandomValues });
  expect(createCheckoutKey()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  expect(getRandomValues).toHaveBeenCalledOnce();
});

it('generates independent keys using cryptographic randomness in the fallback', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  });
  const first = createCheckoutKey();
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(createCheckoutKey()).not.toBe(first);
});
