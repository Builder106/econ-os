import { ADMIN_TOKEN, expect, openDesktop, runInShell, test } from '../fixtures';

test('a malformed frame is rejected and the desktop stays usable', async ({ page }) => {
  const sent: Array<(m: string) => void> = [];
  await page.routeWebSocket('**/ws', (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => ws.send(m));
    sent.push((m) => ws.send(m));
  });
  await openDesktop(page);
  const step = await page.locator('[data-bar="step"]').textContent();
  sent[0]('not json at all');
  sent[0](JSON.stringify({ type: 'tick', step: 'NaN', market: {} }));
  sent[0](JSON.stringify({ type: 'event', kind: 'tax_changed' }));
  sent[0](JSON.stringify({ type: 'ack', id: 1, ok: 'yes' }));
  await expect(page.locator('[data-bar="step"]')).not.toHaveText(step ?? '');
  await page.locator('[data-ws="2"]').click();
  await expect(page.locator('.events .ev[data-kind="rejected"]')).toHaveCount(4);
  await page.locator('[data-tab="p-run"]').click();
  await expect(page.locator('.run .facts')).toContainText('frames rejected4');
  await page.locator('[data-ws="1"]').click();
  await runInShell(page, 'help');
  await expect(page.locator('.shell .scroll')).toContainText('EconOS shell');
});

test('the bar shows only values that match the latest tick', async ({ page }) => {
  let last: Record<string, unknown> | null = null;
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const data = JSON.parse(payload) as Record<string, unknown>;
      if (data.type === 'tick') last = data;
    });
  });
  await openDesktop(page);
  await runInShell(page, `sudo ${ADMIN_TOKEN}`);
  await runInShell(page, 'pause');
  await expect(page.locator('[data-bar="paused"]')).toBeVisible();
  await page.waitForTimeout(700);
  const tick = last as unknown as {
    step: number;
    policy: { tax_rate: number };
    metrics: { gini: number };
    policies_loaded: boolean;
  };
  await expect(page.locator('[data-bar="step"]')).toHaveText(`step ${tick.step}`);
  await expect(page.locator('[data-bar="tax"]')).toHaveText(`tax ${(tick.policy.tax_rate * 100).toFixed(2)}%`);
  await expect(page.locator('[data-bar="gini"]')).toHaveText(`gini ${tick.metrics.gini.toFixed(4)}`);
  await expect(page.locator('[data-bar="actions"]')).toHaveText(tick.policies_loaded ? 'trained policies' : 'sampled actions');
  await expect(page.locator('[data-bar="role"]')).toHaveText('admin');
  await expect(page.locator('[data-bar="conn"]')).toContainText('connected');
  await runInShell(page, 'resume');
  await expect(page.locator('[data-bar="paused"]')).toBeHidden();
});

test('export downloads the run snapshot and reports it', async ({ page }) => {
  await openDesktop(page);
  await page.locator('[data-ws="2"]').click();
  await page.locator('[data-tab="p-run"]').click();
  const download = page.waitForEvent('download');
  await page.locator('.run button', { hasText: 'download snapshot' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^econos-run-[0-9a-f]{32}-step-\d+\.json$/);
  await expect(page.locator('.run .result')).toContainText(`saved ${file.suggestedFilename()}`);
});

test('export reports a failure when the kernel is unreachable', async ({ page, consoleGuard }) => {
  await openDesktop(page);
  await page.route('**/export', (route) => route.abort('connectionrefused'));
  await page.locator('[data-ws="2"]').click();
  await page.locator('[data-tab="p-run"]').click();
  await page.locator('.run button', { hasText: 'download snapshot' }).click();
  await expect(page.locator('.run .result')).toHaveText('export failed: the kernel is unreachable');
  await expect(page.locator('.run .result')).toHaveClass(/err/);
  // The refused request is the scenario under test, not a fault.
  consoleGuard.splice(0, consoleGuard.length, ...consoleGuard.filter((p) => !p.includes('/export')));
});

test('the splash shows the real failure and never claims a connection', async ({ page }) => {
  await page.routeWebSocket('**/ws', (ws) => {
    ws.close({ code: 1011, reason: 'test refusal' });
  });
  await page.goto('/');
  const splash = page.locator('.splash');
  await expect(splash).toContainText('socket closed (code 1011, test refusal)');
  await expect(splash).toContainText('No tick has arrived');
  await expect(splash).not.toContainText('first tick');
  await splash.getByRole('button', { name: 'open the desktop without a kernel' }).click();
  await expect(splash).toHaveCount(0);
  await expect(page.locator('[data-bar="conn"]')).toContainText(/disconnected|connecting/);
  await expect(page.locator('[data-bar="step"]')).toHaveText('step –');
});
