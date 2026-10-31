import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_CHROME === 'true' ? { channel: 'chrome' } : {}),
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node --import tsx scripts/demo.mjs',
          url: 'http://127.0.0.1:4100/health/ready',
          reuseExistingServer: !process.env.CI,
        },
        {
          command: 'npm run dev -w @market/web',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: !process.env.CI,
        },
      ],
  reporter: process.env.CI ? 'github' : 'list',
});
