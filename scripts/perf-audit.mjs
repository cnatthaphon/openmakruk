// Quick perf audit — Core Web Vitals proxy via Playwright since we
// don't have chrome-devtools MCP wired up. Hits production cold,
// captures LCP / CLS / FCP via PerformanceObserver, prints a digest
// + the largest network resources.

import { chromium } from '@playwright/test';

const TARGET = process.env.PERF_TARGET || 'https://openmakruk.com';

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    // Pretend to be a fresh visitor — disable HTTP cache so we
    // measure cold load.
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();

  // Collect network requests + console errors as the load happens.
  const requests = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      const status = res.status();
      const type = res.request().resourceType();
      const headers = res.headers();
      let size = 0;
      try {
        const body = await res.body();
        size = body.length;
      } catch {
        size = parseInt(headers['content-length'] || '0', 10) || 0;
      }
      requests.push({ url, status, type, size, headers });
    } catch {
      // resource served from cache / cancelled — ignore
    }
  });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const t0 = Date.now();
  await page.goto(TARGET, { waitUntil: 'load' });

  // Let LCP settle.
  await page.waitForTimeout(3000);

  // Capture Web Vitals via PerformanceObserver in-page.
  const vitals = await page.evaluate(async () => {
    const out = {
      navigation: null,
      lcp: null,
      cls: 0,
      fcp: null,
      paints: [],
      transferSize: 0,
      encodedSize: 0,
      decodedSize: 0,
      domContentLoaded: null,
      load: null,
    };

    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      out.navigation = {
        ttfb: nav.responseStart - nav.startTime,
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        load: nav.loadEventEnd - nav.startTime,
        transferSize: nav.transferSize,
        encodedBodySize: nav.encodedBodySize,
        decodedBodySize: nav.decodedBodySize,
      };
    }

    const paints = performance.getEntriesByType('paint');
    for (const p of paints) {
      out.paints.push({ name: p.name, startTime: p.startTime });
      if (p.name === 'first-contentful-paint') out.fcp = p.startTime;
    }

    // LCP — already collected by browser, retrieve via Observer.
    await new Promise((resolve) => {
      try {
        const po = new PerformanceObserver(() => {});
        po.observe({ type: 'largest-contentful-paint', buffered: true });
        const entries = po.takeRecords();
        if (entries.length > 0) out.lcp = entries[entries.length - 1].startTime;
        po.disconnect();
      } catch { /* not supported */ }
      // Layout shifts (CLS)
      try {
        const po2 = new PerformanceObserver(() => {});
        po2.observe({ type: 'layout-shift', buffered: true });
        const entries = po2.takeRecords();
        let cls = 0;
        for (const e of entries) {
          if (!e.hadRecentInput) cls += e.value;
        }
        out.cls = cls;
        po2.disconnect();
      } catch { /* not supported */ }
      resolve();
    });

    // Bundle size = sum of resource transferSize
    const resources = performance.getEntriesByType('resource');
    for (const r of resources) {
      out.transferSize += r.transferSize || 0;
      out.encodedSize += r.encodedBodySize || 0;
      out.decodedSize += r.decodedBodySize || 0;
    }
    return out;
  });

  const wallMs = Date.now() - t0;

  console.log('───────────────────────────────────────────────');
  console.log(`Perf audit — ${TARGET}`);
  console.log('───────────────────────────────────────────────');
  console.log(`Wall time to interactive: ${wallMs}ms`);
  if (vitals.navigation) {
    console.log(`TTFB:                     ${vitals.navigation.ttfb.toFixed(0)}ms`);
    console.log(`DOMContentLoaded:         ${vitals.navigation.domContentLoaded.toFixed(0)}ms`);
    console.log(`load event:               ${vitals.navigation.load.toFixed(0)}ms`);
  }
  console.log(`FCP:                      ${vitals.fcp ? vitals.fcp.toFixed(0) + 'ms' : 'n/a'}`);
  console.log(`LCP:                      ${vitals.lcp ? vitals.lcp.toFixed(0) + 'ms' : 'n/a'}`);
  console.log(`CLS:                      ${vitals.cls.toFixed(3)}`);
  console.log(`Transfer size total:      ${(vitals.transferSize / 1024).toFixed(1)} KB`);
  console.log(`Decoded size total:       ${(vitals.decodedSize / 1024).toFixed(1)} KB`);
  console.log();

  // Top 10 largest resources
  const sorted = [...requests].filter((r) => r.size > 0).sort((a, b) => b.size - a.size);
  console.log('Top 10 largest resources:');
  for (const r of sorted.slice(0, 10)) {
    const kb = (r.size / 1024).toFixed(1);
    const enc = r.headers['content-encoding'] || '-';
    const cache = r.headers['cache-control'] || '-';
    const path = r.url.replace(TARGET, '').replace(/^https?:\/\/[^/]+/, '');
    console.log(`  ${kb.padStart(8)} KB  [${r.type.padEnd(10)}]  enc=${enc.padEnd(8)}  ${path}`);
    console.log(`           cache: ${cache}`);
  }
  console.log();

  // Compression check
  const uncompressed = requests.filter((r) =>
    (r.type === 'script' || r.type === 'stylesheet' || r.type === 'document') &&
    r.size > 4096 &&
    !r.headers['content-encoding']
  );
  if (uncompressed.length > 0) {
    console.log('⚠ Uncompressed text resources > 4 KB:');
    for (const r of uncompressed) {
      console.log(`  ${(r.size / 1024).toFixed(1)} KB  ${r.url.replace(TARGET, '')}`);
    }
  } else {
    console.log('✓ All text resources > 4 KB are compressed');
  }
  console.log();

  if (consoleErrors.length > 0) {
    console.log(`⚠ Console messages (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e.slice(0, 200)}`);
  } else {
    console.log('✓ No console errors/warnings on cold load');
  }
  if (pageErrors.length > 0) {
    console.log(`⚠ Uncaught page errors (${pageErrors.length}):`);
    for (const e of pageErrors.slice(0, 5)) console.log(`  ${e.slice(0, 200)}`);
  } else {
    console.log('✓ No uncaught page errors');
  }

  await ctx.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
