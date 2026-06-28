// @ts-check
const { createBdd } = require('playwright-bdd');
const { expect } = require('@playwright/test');

const { Given, Then } = createBdd();

Given('I am on the dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#mainChart')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#proc-rows')).toBeVisible({ timeout: 5_000 });
});

Then('the macro chart is visible', async ({ page }) => {
  await expect(page.locator('#mainChart')).toBeVisible();
});

Then('the process explorer shows {int} agents', async ({ page }, count) => {
  await expect(page.locator('#proc-rows > div')).toHaveCount(count, { timeout: 10_000 });
});

Then('the kernel status shows LIVE', async ({ page }) => {
  await expect(page.locator('#sys-link')).toHaveText(/LIVE/, { timeout: 10_000 });
});

Then('the macro values are populated', async ({ page }) => {
  await expect(page.locator('#macro-gini')).not.toHaveText('—');
  await expect(page.locator('#macro-money')).not.toHaveText('—');
});

Then('the step counter is advancing', async ({ page }) => {
  const stepEl = page.locator('#sys-step');
  await expect(stepEl).toContainText(/STEP \d+/);
  const readStep = async () => {
    const t = (await stepEl.textContent()) || '';
    return parseInt(t.replace(/\D/g, ''), 10);
  };
  const before = await readStep();
  expect(before).toBeGreaterThan(0);
  await page.waitForTimeout(2_000);
  const after = await readStep();
  expect(after).toBeGreaterThan(before);
});

Then('there are {int} consumer agents', async ({ page }, count) => {
  const ids = await page.locator('#proc-rows > div > span:first-child').allTextContents();
  const consumers = ids.filter((s) => s.startsWith('C-'));
  expect(consumers).toHaveLength(count);
});

Then('there are {int} producer agents', async ({ page }, count) => {
  const ids = await page.locator('#proc-rows > div > span:first-child').allTextContents();
  const producers = ids.filter((s) => s.startsWith('P-'));
  expect(producers).toHaveLength(count);
});

Then('the chart canvas has visible data', async ({ page }) => {
  await page.waitForTimeout(2_000);
  const hasInk = await page.locator('#mainChart').evaluate((c) => {
    const canvas = /** @type {HTMLCanvasElement} */ (c);
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const { width, height } = canvas;
    if (!width || !height) return false;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true;
    }
    return false;
  });
  expect(hasInk).toBe(true);
});
