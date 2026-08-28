import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:5173';
const API_URL = process.env.VITE_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    extraHTTPHeaders: { Origin: WEB_URL },
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_API_URL: API_URL,
    },
  },
});
