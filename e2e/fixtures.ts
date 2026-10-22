import { type Page, expect, test as base } from '@playwright/test';
import { test as bddBase } from 'playwright-bdd';

// Vercel serves /_vercel/insights/script.js only on its own edge. Locally and on the
// standalone kernel it 404s, and the desktop guards every call behind window.va.
const ALLOWED = [/\/_vercel\/insights\/script\.js/];

export const ADMIN_TOKEN = 'test-token';

type Guard = { consoleGuard: string[] };

const consoleGuard = async ({ page }: { page: Page }, use: (problems: string[]) => Promise<void>) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const where = msg.location().url;
    if (ALLOWED.some((re) => re.test(where) || re.test(msg.text()))) return;
    problems.push(`${msg.type()}: ${msg.text()} (${where})`);
  });
  page.on('requestfailed', (req) => {
    if (ALLOWED.some((re) => re.test(req.url()))) return;
    if (req.failure()?.errorText.includes('ERR_ABORTED')) return;
    problems.push(`request failed: ${req.url()} ${req.failure()?.errorText ?? ''}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !ALLOWED.some((re) => re.test(res.url()))) {
      problems.push(`HTTP ${res.status()}: ${res.url()}`);
    }
  });
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  await use(problems);
  expect(problems, 'unexpected console output').toEqual([]);
};

/** Plain specs. */
export const test = base.extend<Guard>({ consoleGuard: [consoleGuard, { auto: true }] });

/** Gherkin scenarios: the same guard on playwright-bdd's test. */
export const bddTest = bddBase.extend<Guard>({ consoleGuard: [consoleGuard, { auto: true }] });

export { expect };

/** Open the desktop with a clean layout and wait for the first real tick. */
export async function openDesktop(page: Page, path = '/'): Promise<void> {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('econos-test-keep')) localStorage.clear();
    sessionStorage.setItem('econos-test-keep', '1');
  });
  await page.goto(path);
  await expect(page.locator('.splash')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('[data-bar="step"]')).toHaveText(/step \d+/);
}

export async function runInShell(page: Page, line: string): Promise<void> {
  const input = page.locator('.shell-input');
  if (!(await input.isVisible())) {
    await page.keyboard.press('Control+Backquote');
    await page.keyboard.press('Enter');
  }
  await input.fill(line);
  await input.press('Enter');
}

export async function wm(page: Page, ...keys: string[]): Promise<void> {
  await page.keyboard.press('Control+Backquote');
  for (const k of keys) await page.keyboard.press(k);
  if (await page.locator('.blk.mode').isVisible()) await page.keyboard.press('Escape');
}

export async function rect(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} is not visible`);
  return box;
}
