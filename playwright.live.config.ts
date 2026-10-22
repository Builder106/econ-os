import { defineConfig, devices } from '@playwright/test';

// Smoke check of the deployed desktop and its remote kernel. Read-only: no sudo.
export default defineConfig({
  testDir: 'e2e/live',
  timeout: 60_000,
  retries: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: process.env.LIVE_BASE_URL ?? 'https://econ-os.vercel.app',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
});
