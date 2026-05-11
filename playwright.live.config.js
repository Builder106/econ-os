// @ts-check
// Live-deploy spec config. No webServer — points at the actual production
// (or any deployed) URL. Runs the e2e/live.spec.js suite against the real
// Vercel dashboard + remote kernel pair.
//
// Default targets econ-os.vercel.app; override with LIVE_BASE_URL.
//
// Usage:
//   npx playwright test --config playwright.live.config.js
//   LIVE_BASE_URL=https://econ-os-git-mybranch.vercel.app npx playwright test --config playwright.live.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: /live\.spec\.js$/,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,                    // network flakiness vs. localhost; allow one retry
  reporter: [['list']],
  use: {
    baseURL: process.env.LIVE_BASE_URL || 'https://econ-os.vercel.app',
    headless: true,
    ignoreHTTPSErrors: false,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
