// @ts-check
const { test, expect } = require('@playwright/test');

/** @type {Array<{name: string, width: number, height: number, theme: 'dark' | 'light'}>} */
const viewports = [
  { name: 'desktop', width: 1440, height: 900, theme: 'dark' },
  { name: 'tablet', width: 768, height: 1024, theme: 'dark' },
  { name: 'phone', width: 390, height: 844, theme: 'light' },
  { name: 'small-phone', width: 320, height: 720, theme: 'light' },
];

for (const { name, width, height, theme } of viewports) {
  test(`live workspace fits a ${name} viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');

    await expect(page.locator('#mainChart')).toBeVisible();
    await expect(page.locator('#proc-rows > div')).toHaveCount(12);
    await expect(page.getByRole('button', { name: 'Shell' })).toBeVisible();
    await expect(page.locator('#sys-link')).toHaveText('Live');

    const horizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(horizontalOverflow).toBe(false);

    const clippedReadout = await page.evaluate(() => {
      const readout = document.getElementById('macro-money')?.getBoundingClientRect();
      const content = document.querySelector('#macro-monitor .window-content')?.getBoundingClientRect();
      return !readout || !content || readout.bottom > content.bottom;
    });
    expect(clippedReadout).toBe(false);

    if (name === 'desktop') {
      await page.getByRole('button', { name: 'Close Market monitor' }).click();
      await expect(page.locator('#mainChart')).toHaveCount(0);
      await page.getByRole('button', { name: 'Market' }).click();
      await expect(page.locator('#mainChart')).toBeVisible();
    }

    if (name === 'desktop' || name === 'tablet') {
      await page.getByRole('button', { name: 'Shell' }).click();
      const shellBounds = await page.locator('#econ-shell').boundingBox();
      if (!shellBounds) throw new Error('Shell window has no bounds');
      expect(shellBounds.x).toBeGreaterThanOrEqual(0);
      expect(shellBounds.x + shellBounds.width).toBeLessThanOrEqual(width);
      expect(shellBounds.y + shellBounds.height).toBeLessThanOrEqual(height);
      await page.getByRole('button', { name: 'Close Econ Shell' }).click();
    }

    if (name === 'phone') {
      await page.getByRole('button', { name: 'How it works' }).click();
      await expect(page.getByRole('heading', { name: 'How EconOS works' })).toBeVisible();
      const guideBounds = await page.locator('#about').boundingBox();
      if (!guideBounds) throw new Error('Guide window has no bounds');
      expect(guideBounds.y).toBeGreaterThanOrEqual(0);
      expect(guideBounds.y).toBeLessThan(height);
      await page.getByRole('button', { name: 'Close How EconOS works' }).click();
      await expect(page.locator('#about')).toHaveCount(0);
    }

    if (process.env.CAPTURE_UI && (name === 'desktop' || name === 'phone')) {
      await page.screenshot({ path: `test-results/econ-os-${name}.png`, fullPage: true });
    }
  });
}
