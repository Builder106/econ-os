// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Deployed-environment smoke test. Runs against the real Vercel dashboard
 * + the real remote kernel (Tailscale Funnel URL embedded in config.js).
 *
 * Catches the failure modes the local suite structurally can't:
 *   - Vercel env-var drift (ECONOS_KERNEL_WS_URL wrong / missing)
 *   - CORS denials from the production kernel (post-tightening)
 *   - Dead Tailscale Funnel / DNS / cert issues
 *   - Tailwind CDN, Phosphor, Chart.js CDN outages affecting prod only
 *   - /og-image.png, /favicon.svg, /_vercel/insights/script.js routing breaks
 *
 * Run:
 *   npx playwright test --config playwright.live.config.js
 *
 * The default baseURL is econ-os.vercel.app; override with LIVE_BASE_URL to
 * point at a preview deploy.
 */

test('deployed dashboard connects to remote kernel and ticks', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const url = (m.location && m.location().url) || '';
        // Browser extensions and chrome internals sometimes log to console;
        // we only care about errors from this origin.
        if (!url || url.startsWith('chrome-extension://')) return;
        errors.push(`console.error: ${m.text()} (${url})`);
    });

    await page.goto('/');

    // Boot loader + first frame from the remote kernel. WAN-latency-tolerant.
    await expect(page.locator('#mainChart')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('#sys-link')).toHaveText(/LIVE/, { timeout: 25_000 });
    await expect(page.locator('#proc-rows > div')).toHaveCount(12, { timeout: 25_000 });

    // Step counter must advance — proves the remote kernel is actually ticking
    // and the WS stream isn't a single one-shot snapshot.
    const readStep = async () => {
        const t = (await page.locator('#sys-step').textContent()) || '';
        return parseInt(t.replace(/\D/g, ''), 10);
    };
    const before = await readStep();
    expect(before).toBeGreaterThan(0);
    await page.waitForTimeout(3_000);
    const after = await readStep();
    expect(after).toBeGreaterThan(before);

    // Macro values populated, not the '—' placeholders.
    await expect(page.locator('#macro-gini')).not.toHaveText('—');
    await expect(page.locator('#macro-money')).not.toHaveText('—');

    expect(errors, `unexpected console/page errors:\n  ${errors.join('\n  ')}`).toEqual([]);
});

test('deployed /og-image.png and /favicon.svg serve 200', async ({ request }) => {
    for (const path of ['/og-image.png', '/favicon.svg']) {
        const res = await request.get(path);
        expect(res.status(), `${path} returned ${res.status()}`).toBe(200);
        const ct = res.headers()['content-type'] || '';
        expect(ct, `${path} content-type was ${ct}`).toMatch(/image\/(png|svg)/);
    }
});
