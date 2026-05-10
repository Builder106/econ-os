#!/usr/bin/env node
/**
 * Rasterize dashboard/og-image.svg → dashboard/og-image.png at exactly 1200x630.
 *
 * Most social platforms (Discord, Slack, iMessage, Twitter/X, Facebook,
 * LinkedIn) cache the embed image and don't reliably render SVG. Ship a PNG.
 *
 * Re-run this script whenever og-image.svg changes:
 *   node scripts/build-og-image.js
 *
 * Uses the Chromium bundled with @playwright/test (already a devDependency).
 * No new package install required.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const SVG_PATH = path.join(__dirname, '..', 'dashboard', 'og-image.svg');
const PNG_PATH = path.join(__dirname, '..', 'dashboard', 'og-image.png');

(async () => {
  const svg = fs.readFileSync(SVG_PATH, 'utf8');
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#0a0b0e;overflow:hidden}
  svg{display:block}
</style></head><body>${svg}</body></html>`;

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'load' });

  await page.screenshot({
    path: PNG_PATH,
    type: 'png',
    fullPage: false,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });

  await browser.close();
  const size = fs.statSync(PNG_PATH).size;
  console.log(`[og-image] wrote ${PNG_PATH} (${(size / 1024).toFixed(1)} KB)`);
})();
