import { expect, openDesktop, rect, test, wm } from '../fixtures';

const pane = (app: string) => `[data-pane="p-${app}"]`;
const focused = '.pane[data-focused]';

test.beforeEach(async ({ page }) => {
  await openDesktop(page);
});

test.describe('focus', () => {
  test('moves with the keyboard', async ({ page }) => {
    await expect(page.locator(focused)).toHaveAttribute('data-app', 'market');
    await wm(page, 'l');
    await expect(page.locator(focused)).toHaveAttribute('data-app', 'agents');
    await wm(page, 'j');
    await expect(page.locator(focused)).toHaveAttribute('data-app', 'shell');
    await wm(page, 'ArrowLeft');
    await expect(page.locator(focused)).toHaveAttribute('data-app', 'market');
  });

  test('moves with the pointer', async ({ page }) => {
    await page.locator(`${pane('agents')} .title-name`).click();
    await expect(page.locator(focused)).toHaveAttribute('data-app', 'agents');
  });

  test('shows the binding mode in the bar', async ({ page }) => {
    await page.keyboard.press('Control+Backquote');
    await expect(page.locator('.blk.mode')).toHaveText('wm');
    await page.keyboard.press('Escape');
    await expect(page.locator('.blk.mode')).toBeHidden();
  });
});

test.describe('open and close', () => {
  test('keyboard: split below, open help, close it', async ({ page }) => {
    await wm(page, 'v', 'Shift+Slash');
    const keys = await rect(page, pane('keys'));
    const market = await rect(page, pane('market'));
    expect(Math.round(keys.x)).toBe(Math.round(market.x));
    expect(keys.y).toBeGreaterThan(market.y);
    await expect(page.locator(focused)).toHaveAttribute('data-app', 'keys');
    await wm(page, 'Shift+KeyQ');
    await expect(page.locator(pane('keys'))).toHaveCount(0);
  });

  test('pointer: split beside from the title bar, open from the launcher, close', async ({ page }) => {
    await page.locator(`${pane('market')} [data-act="splith"]`).click();
    await page.locator('[data-bar="launcher"]').click();
    await page.locator('#launcher-input').fill('keys');
    await page.locator('#launcher-list [data-match="keys"]').click();
    const keys = await rect(page, pane('keys'));
    const market = await rect(page, pane('market'));
    expect(keys.x).toBeGreaterThan(market.x);
    expect(Math.round(keys.y)).toBe(Math.round(market.y));
    await page.locator(`${pane('keys')} [data-act="close"]`).click();
    await expect(page.locator(pane('keys'))).toHaveCount(0);
  });

  test('the launcher runs shell commands', async ({ page }) => {
    await wm(page, 'd');
    await page.keyboard.type('gini');
    await page.keyboard.press('Enter');
    await expect(page.locator('.blk.notice')).toContainText('gini = ');
    await expect(page.locator('.shell .scroll')).toContainText('gini = ');
  });
});

test.describe('resize', () => {
  test('keyboard resize mode grows the focused pane', async ({ page }) => {
    const before = (await rect(page, pane('market'))).width;
    await page.keyboard.press('Control+Backquote');
    await page.keyboard.press('r');
    await expect(page.locator('.blk.mode')).toHaveText('resize');
    for (let i = 0; i < 3; i++) await page.keyboard.press('l');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect((await rect(page, pane('market'))).width).toBeGreaterThan(before + 100);
  });

  test('dragging a split resizes both sides', async ({ page }) => {
    const before = (await rect(page, pane('market'))).width;
    const handle = page.locator('.handle.h').first();
    const box = await handle.boundingBox();
    if (!box) throw new Error('no split handle');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 150, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    expect((await rect(page, pane('market'))).width).toBeLessThan(before - 100);
  });
});

test.describe('fullscreen', () => {
  test('keyboard toggles and restores', async ({ page }) => {
    const before = await rect(page, pane('market'));
    const work = await rect(page, '#work');
    await wm(page, 'f');
    await expect(page.locator(pane('market'))).toHaveClass(/fullscreen/);
    const full = await rect(page, pane('market'));
    expect(full.width).toBe(work.width);
    expect(full.height).toBe(work.height);
    await expect(page.locator(pane('agents'))).toBeHidden();
    // Reduced motion (set in the config) means no animation runs at all.
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await wm(page, 'f');
    const after = await rect(page, pane('market'));
    expect(after.width).toBeCloseTo(before.width, 0);
  });

  test('pointer toggles from the title bar', async ({ page }) => {
    await page.locator(`${pane('agents')} [data-act="fullscreen"]`).click();
    await expect(page.locator(pane('agents'))).toHaveClass(/fullscreen/);
    await page.locator(`${pane('agents')} [data-act="fullscreen"]`).click();
    await expect(page.locator(pane('market'))).toBeVisible();
  });
});

test.describe('scratchpad', () => {
  test('keyboard sends and shows', async ({ page }) => {
    await wm(page, 'l', 'Shift+Minus');
    await expect(page.locator(pane('agents'))).toBeHidden();
    await expect(page.locator('[data-bar="scratchpad"]')).toContainText('scratch 1');
    await wm(page, 'Minus');
    await expect(page.locator(pane('agents'))).toBeVisible();
    await expect(page.locator(pane('agents'))).toHaveClass(/floating/);
    await expect(page.locator('[data-bar="scratchpad"]')).toBeHidden();
  });

  test('pointer sends from the title bar and shows from the bar', async ({ page }) => {
    await page.locator(`${pane('shell')} [data-act="scratch"]`).click();
    await expect(page.locator(pane('shell'))).toBeHidden();
    await page.locator('[data-bar="scratchpad"]').click();
    await expect(page.locator(pane('shell'))).toBeVisible();
  });
});

test.describe('move', () => {
  test('keyboard swaps panes', async ({ page }) => {
    await wm(page, 'Shift+KeyL');
    const market = await rect(page, pane('market'));
    const agents = await rect(page, pane('agents'));
    expect(market.x).toBeGreaterThan(agents.x);
    await expect(page.locator(focused)).toHaveAttribute('data-app', 'market');
  });

  test('pointer swaps from the move menu', async ({ page }) => {
    await page.locator(`${pane('market')} [data-act="move"]`).click();
    await page.locator('#pane-menu').getByRole('menuitem', { name: 'right' }).click();
    expect((await rect(page, pane('market'))).x).toBeGreaterThan((await rect(page, pane('agents'))).x);
  });

  test('keyboard sends a pane to another workspace', async ({ page }) => {
    await wm(page, 'l', 'Shift+Digit4');
    await expect(page.locator(pane('agents'))).toBeHidden();
    await expect(page.locator('[data-ws="4"]')).toBeVisible();
    await wm(page, '4');
    await expect(page.locator(pane('agents'))).toBeVisible();
  });

  test('pointer sends a pane to another workspace', async ({ page }) => {
    await page.locator(`${pane('shell')} [data-act="move"]`).click();
    await page.locator('#pane-menu').getByRole('menuitem', { name: '5' }).click();
    await expect(page.locator(pane('shell'))).toBeHidden();
    await page.locator('[data-ws="5"]').click();
    await expect(page.locator(pane('shell'))).toBeVisible();
  });
});

test.describe('floating', () => {
  test('keyboard toggles floating and back', async ({ page }) => {
    await wm(page, 'Shift+Space');
    await expect(page.locator(pane('market'))).toHaveClass(/floating/);
    await wm(page, 'Shift+Space');
    await expect(page.locator(pane('market'))).not.toHaveClass(/floating/);
  });

  test('pointer floats a pane and drags it by its title', async ({ page }) => {
    await page.locator(`${pane('agents')} [data-act="float"]`).click();
    await expect(page.locator(pane('agents'))).toHaveClass(/floating/);
    const before = await rect(page, pane('agents'));
    const title = await rect(page, `${pane('agents')} .title`);
    const name = await rect(page, `${pane('agents')} .title-name`);
    // Grab the bar between the name and the tools; buttons do not start a drag.
    const grabX = name.x + name.width + 20;
    await page.mouse.move(grabX, title.y + 10);
    await page.mouse.down();
    await page.mouse.move(grabX + 100, title.y + 70, { steps: 6 });
    await page.mouse.up();
    const after = await rect(page, pane('agents'));
    expect(after.x).toBeGreaterThan(before.x + 50);
    expect(after.y).toBeGreaterThan(before.y + 30);
  });
});

test.describe('layouts and workspaces', () => {
  test('keyboard sets tabbed, stacked and split layouts', async ({ page }) => {
    await wm(page, 'l', 'w');
    await expect(page.locator('.strip.tabbed')).toBeVisible();
    await expect(page.locator('.strip.tabbed .tab')).toHaveCount(2);
    await wm(page, 's');
    await expect(page.locator('.strip.stacked')).toBeVisible();
    await wm(page, 'e');
    await expect(page.locator('.strip')).toHaveCount(0);
  });

  test('pointer cycles the layout from the bar', async ({ page }) => {
    await expect(page.locator('[data-bar="layout"]')).toContainText('split h');
    await page.locator('[data-bar="layout"]').click();
    await expect(page.locator('[data-bar="layout"]')).toContainText('split v');
    await page.locator('[data-bar="layout"]').click();
    await expect(page.locator('.strip.tabbed')).toBeVisible();
  });

  test('keyboard and pointer switch workspaces', async ({ page }) => {
    await wm(page, '2');
    await expect(page.locator('[data-ws="2"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator(pane('lorenz'))).toBeVisible();
    await expect(page.locator('.strip.tabbed .tab')).toHaveText(['events', 'run']);
    await page.locator('[data-ws="1"]').click();
    await expect(page.locator(pane('market'))).toBeVisible();
    await expect(page.locator(pane('lorenz'))).toBeHidden();
  });
});

test.describe('persistence', () => {
  test('layout and workspaces restore after a reload', async ({ page }) => {
    await wm(page, 'l', 'Shift+Minus');
    await wm(page, '2');
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('[data-ws="2"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-bar="scratchpad"]')).toContainText('scratch 1');
  });

  test('a viewport change keeps every pane inside the work area', async ({ page }) => {
    await page.locator(`${pane('agents')} [data-act="float"]`).click();
    await page.setViewportSize({ width: 900, height: 620 });
    await page.setViewportSize({ width: 1200, height: 760 });
    const work = await rect(page, '#work');
    for (const app of ['market', 'agents', 'shell']) {
      const r = await rect(page, pane(app));
      expect(r.width).toBeGreaterThan(80);
      expect(r.height).toBeGreaterThan(60);
      expect(r.x).toBeGreaterThanOrEqual(work.x - 1);
      expect(r.y).toBeGreaterThanOrEqual(work.y - 1);
      expect(r.x + r.width).toBeLessThanOrEqual(work.x + work.width + 1);
      expect(r.y + r.height).toBeLessThanOrEqual(work.y + work.height + 1);
    }
  });

  test('a corrupt saved layout falls back to the default', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('econos.desktop.v1', '{"wm":{"v":1,"workspaces":[{"num":99}]}}'));
    await page.reload();
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator(pane('market'))).toBeVisible();
  });
});
