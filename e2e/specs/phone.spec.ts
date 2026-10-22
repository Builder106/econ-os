import { expect, openDesktop, rect, test } from '../fixtures';

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('shows one pane at a time with a switcher', async ({ page }) => {
    await openDesktop(page);
    const tabs = page.locator('.phone-tabs .tab');
    await expect(tabs).toHaveText(['market', 'agents', 'shell']);
    await expect(page.locator('.pane:visible')).toHaveCount(1);
    await tabs.filter({ hasText: 'agents' }).click();
    await expect(page.locator('.pane:visible')).toHaveAttribute('data-app', 'agents');
    const pane = await rect(page, '.pane:visible');
    expect(pane.width).toBeCloseTo(390, 0);
    await page.locator('[data-ws="2"]').click();
    await expect(page.locator('.phone-tabs .tab')).toHaveText(['lorenz', 'policy', 'events', 'run']);
  });

  test('has no horizontal overflow at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openDesktop(page);
    for (const ws of ['1', '2']) {
      await page.locator(`[data-ws="${ws}"]`).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
      const bar = await rect(page, '#bar');
      expect(bar.width).toBeCloseTo(320, 0);
    }
  });
});
