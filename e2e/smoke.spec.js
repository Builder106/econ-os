// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Headless verification of the EconOS dashboard against a live kernel.
 *
 * The dashboard's IDs (#mainChart, #proc-rows, #sys-step, #sys-link, #macro-gini, etc.)
 * are load-bearing for the JS that updates them on every WS frame — they're not
 * test-only attributes, so locating by ID here is consistent with global guidance
 * to avoid `data-testid`.
 */

test('dashboard renders live kernel feed (boot → WS → tick advance)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = (m.location && m.location().url) || '';
    // Vercel Analytics' /_vercel/insights/script.js is served by Vercel's edge in production;
    // under local uvicorn it 404s — expected, not an app error.
    if (url.includes('/_vercel/insights/script.js')) return;
    errors.push(`console.error: ${m.text()} (${url})`);
  });

  await page.goto('/');

  // Boot loader takes ~3.5s, then auto-launches macro-monitor + process-explorer.
  // Anchor on a deterministic element from each window rather than networkidle,
  // which can resolve before the boot animation finishes.
  await expect(page.locator('#mainChart')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#proc-rows')).toBeVisible({ timeout: 5_000 });

  // WS handshake must succeed and the kernel must broadcast at least one frame.
  await expect(page.locator('#sys-link')).toHaveText(/LIVE/, { timeout: 10_000 });

  // Process Explorer must enumerate all 12 agents (10 consumers + 2 producers).
  await expect(page.locator('#proc-rows > div')).toHaveCount(12, { timeout: 10_000 });

  // Macro values populated from the feed (placeholder is em-dash).
  await expect(page.locator('#macro-gini')).not.toHaveText('—');
  await expect(page.locator('#macro-money')).not.toHaveText('—');

  // Step counter must advance — proves the tick loop is live, not a single-shot snapshot.
  const stepEl = page.locator('#sys-step');
  await expect(stepEl).toContainText(/STEP \d+/);
  const readStep = async () => {
    const t = (await stepEl.textContent()) || '';
    return parseInt(t.replace(/\D/g, ''), 10);
  };
  const before = await readStep();
  expect(before).toBeGreaterThan(0);
  await page.waitForTimeout(2_000); // ~4 ticks at 500ms cadence
  const after = await readStep();
  expect(after).toBeGreaterThan(before);

  expect(errors, `unexpected console/page errors:\n  ${errors.join('\n  ')}`).toEqual([]);
});

test('process explorer rows reflect role partition (10 consumers / 2 producers)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#proc-rows > div')).toHaveCount(12, { timeout: 20_000 });

  const ids = await page.locator('#proc-rows > div > span:first-child').allTextContents();
  const consumers = ids.filter((s) => s.startsWith('C-'));
  const producers = ids.filter((s) => s.startsWith('P-'));
  expect(consumers).toHaveLength(10);
  expect(producers).toHaveLength(2);
});

test('macro chart canvas has been drawn to (non-empty pixels)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#mainChart')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#sys-link')).toHaveText(/LIVE/, { timeout: 10_000 });

  // Allow a couple of ticks so Chart.js has data to render.
  await page.waitForTimeout(2_000);

  const hasInk = await page.locator('#mainChart').evaluate((c) => {
    const canvas = /** @type {HTMLCanvasElement} */ (c);
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const { width, height } = canvas;
    if (!width || !height) return false;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true; // any non-transparent pixel
    }
    return false;
  });
  expect(hasInk).toBe(true);
});
