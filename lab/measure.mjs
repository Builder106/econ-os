import { chromium, firefox, webkit } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const name = process.argv[2] || 'chromium';
const browserType = { chromium, firefox, webkit }[name];
if (!browserType) throw new Error(`Unknown browser: ${name}`);

const browser = await browserType.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

let cdp;
let before;
let browserCdp;
let beforeProcessCpu;
if (name === 'chromium') {
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  before = await cdp.send('Performance.getMetrics');
  browserCdp = await browser.newBrowserCDPSession();
  const processes = await browserCdp.send('SystemInfo.getProcessInfo');
  beforeProcessCpu = processes.processInfo.reduce((sum, process) => sum + process.cpuTime, 0);
}

try {
  await page.goto('http://localhost:8765/', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Boot Linux' }).click();
  await page.getByRole('status').getByText('Linux ready').waitFor({ timeout: 120000 });
  const boot = await page.locator('#boot-time').textContent();
  const transfer = await page.locator('#transfer').textContent();

  const steps = [];
  for (let query = 1; query <= 3; query += 1) {
    await page.locator('#command').fill('econos');
    await page.locator('#command').press('Enter');
    await page.waitForFunction(
      (expected) => (document.querySelector('#console')?.value.match(/EconOS shared economy \(read only\)/g) || []).length >= expected,
      query,
      { timeout: 20000 },
    );
    const output = await page.locator('#console').inputValue();
    steps.push(Number([...output.matchAll(/Step: (\d+)/g)].at(-1)?.[1]));
    await page.waitForTimeout(700);
  }
  if (steps.some((step) => !Number.isFinite(step)) || steps[2] <= steps[0]) {
    throw new Error(`Snapshot steps did not advance: ${steps.join(', ')}`);
  }

  let cpuTaskSeconds;
  let jsHeapMiB;
  let processCpuSeconds;
  let processRssMiB;
  if (cdp) {
    const after = await cdp.send('Performance.getMetrics');
    const metric = (result, key) => result.metrics.find((item) => item.name === key)?.value;
    cpuTaskSeconds = metric(after, 'TaskDuration') - metric(before, 'TaskDuration');
    jsHeapMiB = metric(after, 'JSHeapUsedSize') / 1024 / 1024;
    const processes = await browserCdp.send('SystemInfo.getProcessInfo');
    processCpuSeconds = processes.processInfo.reduce((sum, process) => sum + process.cpuTime, 0) - beforeProcessCpu;
    const ids = processes.processInfo.map((process) => process.id).join(',');
    const rss = execFileSync('ps', ['-p', ids, '-o', 'rss='], { encoding: 'utf8' });
    processRssMiB = rss.trim().split(/\s+/).reduce((sum, value) => sum + Number(value), 0) / 1024;
  }

  if (process.env.ECONOS_LAB_SCREENSHOT) {
    await page.screenshot({ path: process.env.ECONOS_LAB_SCREENSHOT, fullPage: true });
  }
  console.log(JSON.stringify({ browser: name, boot, transfer, cpuTaskSeconds, processCpuSeconds, processRssMiB, jsHeapMiB, querySteps: steps, keyboard: 'passed', errors }));
  if (errors.length) process.exitCode = 1;
} catch (error) {
  const status = await page.locator('#status').textContent();
  const output = (await page.locator('#console').inputValue()).slice(-1000);
  console.error(JSON.stringify({ browser: name, status, output, errors, failure: String(error) }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
