import type { Page, WebSocketRoute } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { bddTest, expect, openDesktop, runInShell } from '../fixtures';

const { Given, When, Then, After } = createBdd(bddTest);

// One kernel tick is 500 ms. "Within one tick" allows the tick plus delivery.
const ONE_TICK = 1_200;

interface World {
  pages: Page[];
  route: WebSocketRoute | null;
}

const world: World = { pages: [], route: null };
const viewer = (which: string): Page => world.pages[which === 'first' ? 0 : 1];

After(async () => {
  for (const extra of world.pages.slice(1)) await extra.context().close();
  world.pages = [];
});

Given('one viewer has the desktop open', async ({ page }) => {
  world.pages = [page];
  await openDesktop(page);
});

Given('two viewers have the desktop open', async ({ page, browser }) => {
  const other = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  world.pages = [page, other];
  await openDesktop(page);
  await openDesktop(other);
  await other.locator('[data-ws="2"]').click();
});

Given('one viewer has the desktop open with a socket the test can drop', async ({ page }) => {
  world.pages = [page];
  world.route = null;
  await page.routeWebSocket('**/ws', (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => ws.send(m));
    world.route = ws;
  });
  await openDesktop(page);
});

When('the {word} viewer runs {string} in the shell', async ({}, which: string, line: string) => {
  const page = viewer(which);
  await runInShell(page, line);
  await expect(page.locator('.shell .ln.in').last()).toBeVisible();
  await expect(page.locator('.shell-input')).not.toHaveAttribute('aria-busy', 'true');
});

When('the socket drops and the desktop reconnects', async () => {
  const page = world.pages[0];
  const dropped = world.route;
  expect(dropped).not.toBeNull();
  await dropped?.close({ code: 4000, reason: 'test drop' });
  await expect(page.locator('[data-bar="conn"]')).toContainText(/disconnected|reconnecting|connecting/, { timeout: ONE_TICK });
  await expect(page.locator('[data-bar="conn"]')).toContainText('connected', { timeout: 10_000 });
});

Then("the {word} viewer's bar shows {string} within one tick", async ({}, which: string, text: string) => {
  await expect(viewer(which).locator('[data-bar="tax"]')).toHaveText(text, { timeout: ONE_TICK });
});

Then("the {word} viewer's events show {string}", async ({}, which: string, text: string) => {
  await expect(viewer(which).locator('.events .ev .what').first()).toContainText(text, { timeout: ONE_TICK });
});

Then("the {word} viewer's bar notice mentions {string}", async ({}, which: string, text: string) => {
  await expect(viewer(which).locator('.blk.notice')).toContainText(text, { timeout: ONE_TICK });
});

Then("the {word} viewer's shell shows {string}", async ({}, which: string, text: string) => {
  await expect(viewer(which).locator('.shell .scroll')).toContainText(text);
});

Then("the {word} viewer's shell never shows {string}", async ({}, which: string, secret: string) => {
  const page = viewer(which);
  await expect(page.locator('.shell .scroll')).toContainText('sudo ********');
  await expect(page.locator('.shell .scroll')).not.toContainText(secret);
  await page.locator('.shell-input').press('ArrowUp');
  await expect(page.locator('.shell-input')).not.toHaveValue(new RegExp(secret));
});

Then('the {word} viewer is a visitor with locked policy controls', async ({}, which: string) => {
  const page = viewer(which);
  await expect(page.locator('[data-bar="role"]')).toHaveText('visitor');
  await page.locator('[data-ws="2"]').click();
  await expect(page.locator('.policy [data-cmd="tax"]')).toBeDisabled();
  await expect(page.locator('.policy .lock-text')).toContainText('Locked');
  await page.locator('[data-ws="1"]').click();
});

Then('the {word} viewer is an admin with unlocked policy controls', async ({}, which: string) => {
  const page = viewer(which);
  await expect(page.locator('[data-bar="role"]')).toHaveText('admin');
  await page.locator('[data-ws="2"]').click();
  await expect(page.locator('.policy [data-cmd="tax"]')).toBeEnabled();
  await page.locator('[data-ws="1"]').click();
});
