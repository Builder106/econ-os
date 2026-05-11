#!/usr/bin/env node
/**
 * Rasterize the banner SVG(s) to PNG at 1280x320. Renders both
 * docs/banner.svg (dark) and docs/banner-light.svg (light) if they exist,
 * so the README can <picture>-switch on prefers-color-scheme.
 *
 * Run whenever either SVG changes:
 *   node scripts/build-banner.js
 *
 * Uses the Chromium bundled with @playwright/test (already a devDependency).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const TARGETS = [
  { svg: '../docs/banner.svg',       png: '../docs/banner.png' },
  { svg: '../docs/banner-light.svg', png: '../docs/banner-light.png' },
];

(async () => {
  const browser = await chromium.launch();
  for (const t of TARGETS) {
    const svgPath = path.join(__dirname, t.svg);
    const pngPath = path.join(__dirname, t.png);
    if (!fs.existsSync(svgPath)) {
      console.log(`[banner] ${svgPath} not found, skipping`);
      continue;
    }
    const svg = fs.readFileSync(svgPath, 'utf8');
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#0a0b0e;overflow:hidden}
  svg{display:block}
</style></head><body>${svg}</body></html>`;

    const context = await browser.newContext({
      viewport: { width: 1280, height: 320 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({
      path: pngPath,
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 320 },
    });
    await context.close();

    const size = fs.statSync(pngPath).size;
    console.log(`[banner] wrote ${pngPath} (${(size / 1024).toFixed(1)} KB)`);
  }
  await browser.close();
})();
