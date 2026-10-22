import { expect, test } from '../fixtures';

test('the deployed desktop reaches the shared kernel', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash')).toHaveCount(0, { timeout: 30_000 });
  const step = page.locator('[data-bar="step"]');
  await expect(step).toHaveText(/step \d+/);
  await expect(page.locator('[data-bar="conn"]')).toContainText('connected');
  const first = Number((await step.textContent())?.replace(/\D/g, ''));
  await expect.poll(async () => Number((await step.textContent())?.replace(/\D/g, '')), { timeout: 5_000 }).not.toBe(first);
  await expect(page.locator('[data-bar="role"]')).toHaveText('visitor');
});
