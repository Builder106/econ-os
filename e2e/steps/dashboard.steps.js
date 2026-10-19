// @ts-check
const { createBdd } = require('playwright-bdd');
const { expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');

const { Given, When, Then } = createBdd();
const snapshots = new WeakMap();

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
  await expect(page.locator('#sys-link')).toHaveText(/Live/, { timeout: 10_000 });
});

Then('the macro values are populated', async ({ page }) => {
  await expect(page.locator('#macro-gini')).not.toHaveText('—');
  await expect(page.locator('#macro-money')).not.toHaveText('—');
});

Then('the step counter is advancing', async ({ page }) => {
  const stepEl = page.locator('#sys-step');
  await expect(stepEl).toContainText(/Step \d+/);
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

When('I export the run snapshot', async ({ page }) => {
  await page.getByRole('button', { name: 'Apps' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export snapshot' }).click();
  const download = await downloadPromise;
  snapshots.set(page, JSON.parse(await readFile(await download.path(), 'utf8')));
  expect(download.suggestedFilename()).toMatch(/^econos-snapshot-.*\.json$/);
});

Then('the download explains the shared economy', async ({ page }) => {
  const capture = snapshots.get(page);
  expect(capture.format).toBe('econos-run-snapshot');
  expect(capture.schema_version).toBe(1);
  expect(capture.run.id).toMatch(/^[0-9a-f]{32}$/);
  expect(capture.run.initial_conditions.agent_balances).toBeTruthy();
  expect(capture.run.models.consumer.action_source).toMatch(/^(trained_ppo|sampled_actions)$/);
  expect(capture.run.step_interval.to).toBe(capture.state.step);
  expect(capture.state.agents).toHaveLength(12);
  expect(capture.replay.exact).toBe(false);
  await expect(page.locator('#export-status')).toHaveText('Snapshot downloaded');
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
