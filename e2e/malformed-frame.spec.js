import { test, expect } from '@playwright/test';

test('ignores malformed WebSocket frames without breaking the dashboard', async ({ page }) => {
  await page.addInitScript(() => {
    class MalformedSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      /** @type {number} */
      readyState = MalformedSocket.OPEN;
      /** @type {(() => void) | undefined} */
      onopen;
      /** @type {(() => void) | undefined} */
      onclose;
      /** @type {((event: { data: string }) => void) | undefined} */
      onmessage;
      send() {}
      close() { this.onclose?.(); }
      constructor() {
        queueMicrotask(() => this.onopen?.());
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'tick', agents: 'invalid' }) }));
      }
    }
    // @ts-expect-error The test double only implements the WebSocket surface used by the dashboard.
    window.WebSocket = MalformedSocket;
  });
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('#desktop')).toBeVisible();
});
