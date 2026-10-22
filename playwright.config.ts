import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const PORT = 8765;

const bddTestDir = defineBddConfig({
  features: 'e2e/features/*.feature',
  steps: ['e2e/steps/*.ts', 'e2e/fixtures.ts'],
});

// One shared kernel serves every test, as in production, so tests run one at a time.
export default defineConfig({
  timeout: 45_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    video: process.env.ECONOS_VIDEO ? { mode: 'on', size: { width: 1440, height: 900 } } : 'off',
    colorScheme: process.env.ECONOS_SCHEME === 'light' ? 'light' : 'dark',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    // Geometry checks read final rectangles; motion is covered by the QA recordings.
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'scenarios', testDir: bddTestDir },
    { name: 'desktop', testDir: 'e2e/specs' },
  ],
  webServer: {
    command: `npm run build && uv run --frozen python -m uvicorn server.main:app --host 127.0.0.1 --port ${PORT} --workers 1 --log-level warning`,
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { ADMIN_TOKEN: 'test-token', ECONOS_KERNEL_WS_URL: '' },
  },
});
