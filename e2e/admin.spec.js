// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * End-to-end admin flow against a live kernel.
 *
 * Note: Playwright runs workers=1 here so all specs share the same uvicorn /
 * kernel process. State (tax_rate, queued shocks) carries between tests. The
 * specs below are written so order doesn't matter — each one re-sudo's because
 * each `page.goto` creates a fresh WebSocket connection (admin elevation is
 * per-connection by design).
 */

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

test('visitor is denied admin commands until sudo elevates the connection', async ({ page }) => {
    await bootAndOpenShell(page);

    await sendShell(page, 'tax 50');
    await expect(page.locator('#shell-output')).toContainText(/requires admin/i, { timeout: 5_000 });

    await sendShell(page, `sudo ${ADMIN_TOKEN}`);
    await expect(page.locator('#shell-output')).toContainText(/admin enabled/i, { timeout: 5_000 });
});

test('admin tax command propagates to Policy Manager UI', async ({ page }) => {
    await bootAndOpenShell(page);
    await sendShell(page, `sudo ${ADMIN_TOKEN}`);
    await expect(page.locator('#shell-output')).toContainText(/admin enabled/i);

    await sendShell(page, 'tax 25');
    await expect(page.locator('#shell-output')).toContainText(/tax_rate.*25\.00%/, { timeout: 5_000 });

    await page.evaluate(() => window.launchWindow('policy-manager'));
    await expect(page.locator('#pm-tax')).toHaveText(/25\.00%/, { timeout: 8_000 });
    await expect(page.locator('#pm-auth')).toContainText(/admin/i);
});

test('admin shock fires a broadcast event that surfaces in the shell', async ({ page }) => {
    await bootAndOpenShell(page);
    await sendShell(page, `sudo ${ADMIN_TOKEN}`);
    await expect(page.locator('#shell-output')).toContainText(/admin enabled/i);

    await sendShell(page, 'shock wage 10');
    await expect(page.locator('#shell-output')).toContainText(/queued wage shock \+10\.00%/, { timeout: 5_000 });
    // The same shock is rebroadcast as an [ADMIN] event line — visible to all visitors.
    await expect(page.locator('#shell-output')).toContainText(/\* \[ADMIN\] shock_applied/, { timeout: 5_000 });
});

test('Policy Manager slider issues tax command (admin-mode UI gating)', async ({ page }) => {
    await bootAndOpenShell(page);
    await sendShell(page, `sudo ${ADMIN_TOKEN}`);
    await expect(page.locator('#shell-output')).toContainText(/admin enabled/i);

    await page.evaluate(() => window.launchWindow('policy-manager'));
    const slider = page.locator('#pm-tax-slider');
    await expect(slider).toBeEnabled({ timeout: 5_000 });

    // Set value programmatically and dispatch 'change' (release event the dashboard listens for).
    await slider.evaluate((el, val) => {
        const range = /** @type {HTMLInputElement} */ (el);
        range.value = val;
        range.dispatchEvent(new Event('input',  { bubbles: true }));
        range.dispatchEvent(new Event('change', { bubbles: true }));
    }, '40');

    await expect(page.locator('#pm-tax')).toHaveText(/40\.00%/, { timeout: 8_000 });
});

test('unknown command returns a helpful error to the shell', async ({ page }) => {
    await bootAndOpenShell(page);
    await sendShell(page, 'frobnicate the kernel');
    await expect(page.locator('#shell-output')).toContainText(/unknown command/i, { timeout: 5_000 });
});

test('sudo with wrong token does not elevate', async ({ page }) => {
    await bootAndOpenShell(page);
    await sendShell(page, 'sudo definitely-wrong');
    await expect(page.locator('#shell-output')).toContainText(/invalid token/i);

    await sendShell(page, 'tax 5');
    await expect(page.locator('#shell-output')).toContainText(/requires admin/i);
});
