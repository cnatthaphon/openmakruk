// Production smoke test for openmakruk.com.
// Hits both apex + www, verifies app actually boots (React mount, WASM
// load, no console errors, service worker registers, engine playable).
//
// Standalone — does NOT go through playwright.config.ts (skips dev server
// auto-start). Run from project root:
//   node /tmp/smoke-prod.mjs

import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const URLS = [
  'https://openmakruk.com',
  'https://www.openmakruk.com',
];

const TIMEOUT = 45_000;

async function smokeOne(url) {
  const report = {
    url,
    httpStatus: null,
    consoleErrors: [],
    failedRequests: [],
    bootSplashSeen: false,
    appMounted: false,
    boardRendered: false,
    swRegistered: false,
    contentManifestLoaded: false,
    ffishLoaded: false,
    stockfishLoaded: false,
    apiReachable: false,
    timing: {},
    screenshot: null,
    fatalError: null,
  };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    // Mobile-ish viewport to also catch responsive issues
    viewport: { width: 1280, height: 800 },
    // SharedArrayBuffer requires COOP/COEP — Playwright respects the
    // page's own headers, so no extra config needed beyond the page.
  });
  const page = await ctx.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    report.failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    const u = res.url();
    if (u.endsWith('/ffish.wasm')) report.ffishLoaded = res.ok();
    if (u.includes('/engine/stockfish')) report.stockfishLoaded = res.ok() || report.stockfishLoaded;
    if (u.includes('/content/manifest.json')) report.contentManifestLoaded = res.ok();
    if (u.includes('/api/')) report.apiReachable = res.ok() || report.apiReachable;
  });

  const t0 = Date.now();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    report.httpStatus = resp?.status() ?? null;
    report.timing.domContentLoaded = Date.now() - t0;

    // Boot splash should appear before React mounts
    const splash = await page.locator('text=กำลังโหลด OpenMakruk').count();
    report.bootSplashSeen = splash > 0;

    // Wait for React to mount — Play tab is default, board should appear
    try {
      await page.waitForSelector('.cg-wrap, .play-page, nav.tabs', { timeout: TIMEOUT });
      report.appMounted = true;
      report.timing.appMounted = Date.now() - t0;
    } catch {
      report.appMounted = false;
    }

    // Wait for board specifically (ffish + stockfish must boot for this)
    try {
      await page.waitForSelector('.cg-wrap', { timeout: TIMEOUT });
      report.boardRendered = true;
      report.timing.boardRendered = Date.now() - t0;
    } catch {
      report.boardRendered = false;
    }

    // Service worker registration (only over HTTPS, only in prod)
    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return 'none';
        return reg.active ? 'active' : (reg.installing ? 'installing' : 'waiting');
      } catch (err) {
        return `error: ${String(err)}`;
      }
    });
    report.swRegistered = swState === 'active' || swState === 'installing';
    report.swState = swState;

    // Screenshot for visual confirmation
    const safeUrl = url.replace(/[^a-z0-9]/gi, '_');
    const shotPath = `/tmp/smoke-${safeUrl}.png`;
    await page.screenshot({ path: shotPath, fullPage: false });
    report.screenshot = shotPath;
  } catch (err) {
    report.fatalError = String(err);
  } finally {
    await ctx.close();
    await browser.close();
  }

  return report;
}

const results = [];
for (const url of URLS) {
  console.log(`\n=== ${url} ===`);
  const r = await smokeOne(url);
  results.push(r);
  console.log(`  HTTP:           ${r.httpStatus}`);
  console.log(`  Boot splash:    ${r.bootSplashSeen ? '✓' : '✗'}`);
  console.log(`  App mounted:    ${r.appMounted ? '✓' : '✗'} (${r.timing.appMounted ?? '—'}ms)`);
  console.log(`  Board rendered: ${r.boardRendered ? '✓' : '✗'} (${r.timing.boardRendered ?? '—'}ms)`);
  console.log(`  SW state:       ${r.swState ?? '—'}`);
  console.log(`  ffish.wasm:     ${r.ffishLoaded ? '✓' : '✗'}`);
  console.log(`  stockfish:      ${r.stockfishLoaded ? '✓' : '✗'}`);
  console.log(`  content mfst:   ${r.contentManifestLoaded ? '✓' : '✗'}`);
  console.log(`  /api/* hit:     ${r.apiReachable ? '✓' : '— (none called yet)'}`);
  console.log(`  Console errors: ${r.consoleErrors.length}`);
  if (r.consoleErrors.length > 0) {
    for (const e of r.consoleErrors.slice(0, 5)) console.log(`    · ${e.slice(0, 200)}`);
  }
  console.log(`  Failed reqs:    ${r.failedRequests.length}`);
  if (r.failedRequests.length > 0) {
    for (const f of r.failedRequests.slice(0, 5)) console.log(`    · ${f.slice(0, 200)}`);
  }
  console.log(`  Screenshot:     ${r.screenshot}`);
  if (r.fatalError) console.log(`  FATAL:          ${r.fatalError}`);
}

await writeFile('/tmp/smoke-prod-report.json', JSON.stringify(results, null, 2));
console.log(`\nFull JSON report: /tmp/smoke-prod-report.json`);
console.log(`Screenshots: ${results.map((r) => r.screenshot).filter(Boolean).join(', ')}`);

// Exit code: non-zero if any URL failed to mount the app
const anyFailed = results.some((r) => !r.appMounted || !r.boardRendered);
process.exit(anyFailed ? 1 : 0);
