import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { statements: 85, branches: 80, functions: 75, lines: 85 },
      reporter: ['text', 'html'],
      include: ['apps/api/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
      exclude: ['**/main.tsx', '**/server.ts'],
    },
  },
});
