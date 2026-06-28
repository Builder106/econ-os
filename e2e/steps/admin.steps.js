// @ts-check
const { createBdd } = require('playwright-bdd');
const { expect } = require('@playwright/test');

const { Given, When, Then } = createBdd();

const ADMIN_TOKEN = 'test-token-abc';

async function bootAndOpenShell(page) {
  await page.goto('/');
  await expect(page.locator('#sys-link')).toHaveText(/LIVE/, { timeout: 15_000 });
  await page.evaluate(() => window.launchWindow('econ-shell'));
  await expect(page.locator('#shell-input')).toBeEnabled({ timeout: 5_000 });
}

async function sendShell(page, line) {
  const input = page.locator('#shell-input');
  await input.fill(line);
  await input.press('Enter');
}

Given('I am on the dashboard with the shell open', async ({ page }) => {
  await bootAndOpenShell(page);
});

When('I run the command {string}', async ({ page }, cmd) => {
  await sendShell(page, cmd);
});

When('I elevate with the admin token', async ({ page }) => {
  await sendShell(page, `sudo ${ADMIN_TOKEN}`);
});

Given('I have elevated with the admin token', async ({ page }) => {
  await sendShell(page, `sudo ${ADMIN_TOKEN}`);
  await expect(page.locator('#shell-output')).toContainText(/admin enabled/i, { timeout: 5_000 });
});

Then('the shell output contains {string}', async ({ page }, text) => {
  await expect(page.locator('#shell-output')).toContainText(text, { timeout: 5_000, ignoreCase: true });
});

Given('the Policy Manager is open', async ({ page }) => {
  await page.evaluate(() => window.launchWindow('policy-manager'));
  await expect(page.locator('#pm-tax-slider')).toBeEnabled({ timeout: 5_000 });
});

When('I set the tax slider to {string}', async ({ page }, val) => {
  await page.locator('#pm-tax-slider').evaluate((el, v) => {
    const range = /** @type {HTMLInputElement} */ (el);
    range.value = v;
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
  }, val);
});

Then('the Policy Manager shows {string}', async ({ page }, text) => {
  await expect(page.locator('#pm-tax')).toContainText(text, { timeout: 8_000 });
});

Then('the Policy Manager shows admin auth status', async ({ page }) => {
  await expect(page.locator('#pm-auth')).toContainText(/admin/i);
});
