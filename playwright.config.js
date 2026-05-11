// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Recording mode: RECORD_DEMOS=1 enables full video, larger viewport, slowMo
// pacing so each action reads at human speed in the captured GIF. Tests still
// pass at the relaxed timeouts; QA-mode (default) keeps full speed + headless.
const RECORDING = !!process.env.RECORD_DEMOS;

module.exports = defineConfig({
  testDir: './e2e',
  // Live-deploy spec runs under playwright.live.config.js (different baseURL,
  // no webServer); skip it here so `npx playwright test` stays local-only.
  testIgnore: /live\.spec\.js$/,
  timeout: RECORDING ? 120_000 : 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8765',
    headless: true,
    trace: RECORDING ? 'off' : 'retain-on-failure',
    video: RECORDING ? 'on' : 'retain-on-failure',
    viewport: RECORDING ? { width: 1920, height: 1080 } : undefined,
    launchOptions: RECORDING ? { slowMo: 600 } : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Re-pin viewport at project level when recording — the device preset
        // overrides the top-level `use` block silently otherwise.
        ...(RECORDING ? {
          viewport: { width: 1920, height: 1080 },
          video: { mode: 'on', size: { width: 1920, height: 1080 } },
        } : {}),
      },
    },
  ],
  webServer: {
    command: 'python3 -m uvicorn server.main:app --host 127.0.0.1 --port 8765 --log-level warning',
    url: 'http://127.0.0.1:8765/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ADMIN_TOKEN: 'test-token-abc',
    },
  },
});
