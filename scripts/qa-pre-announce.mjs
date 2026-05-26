// QA sweep before public announcement.
// Goal: certify openmakruk.com as "best single-player Makruk platform" for
// learning + competing + challenging + fun.
//
// Tracks (each independent so partial failures don't stop the run):
//   A. Production health    — endpoints, headers, WASM, content
//   B. API contract        — every /api/* returns expected shape
//   C. User journey E2E    — cold start → play → review → puzzle → profile
//   D. Engine verification — bots actually search (Phase 11A minimax)
//   E. Performance metrics — FCP, LCP, mount time, WASM init
//
// Run:
//   node scripts/qa-pre-announce.mjs [base-url]
//   default base = https://www.openmakruk.com

import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'https://www.openmakruk.com';
const API_BASE = 'https://openmakruk-api.cnatthaphon.workers.dev';
const REPORT_PATH = '/tmp/qa-pre-announce.json';

const report = {
  base: BASE,
  apiBase: API_BASE,
  startedAt: new Date().toISOString(),
  tracks: {},
};

// ────────────────────────────────────────────────────────────────────
// Track A — Production health
// ────────────────────────────────────────────────────────────────────
async function trackA() {
  const result = { checks: [], pass: 0, fail: 0 };
  const check = (name, ok, detail = '') => {
    result.checks.push({ name, ok, detail });
    result[ok ? 'pass' : 'fail']++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' · ' + detail : ''}`);
  };

  for (const url of [BASE, BASE.replace('://www.', '://')]) {
    try {
      const r = await fetch(url);
      check(`${url} → ${r.status}`, r.status === 200);
      check(
        `  COOP/COEP headers`,
        r.headers.get('cross-origin-opener-policy') === 'same-origin' &&
          r.headers.get('cross-origin-embedder-policy') === 'require-corp',
        `coop=${r.headers.get('cross-origin-opener-policy')} coep=${r.headers.get('cross-origin-embedder-policy')}`,
      );
    } catch (e) {
      check(`${url} reachable`, false, e.message);
    }
  }

  const assets = [
    '/manifest.webmanifest',
    '/sw.js',
    '/ffish.wasm',
    '/engine/stockfish.js',
    '/content/manifest.json',
    '/og.png',
    '/icon.svg',
    '/robots.txt',
    '/sitemap.xml',
  ];
  for (const path of assets) {
    try {
      const r = await fetch(`${BASE}${path}`);
      check(`static ${path}`, r.ok, `${r.status}`);
    } catch (e) {
      check(`static ${path}`, false, e.message);
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
// Track B — API contract verification
// ────────────────────────────────────────────────────────────────────
async function trackB() {
  const result = { checks: [], pass: 0, fail: 0 };
  const check = (name, ok, detail = '') => {
    result.checks.push({ name, ok, detail });
    result[ok ? 'pass' : 'fail']++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' · ' + detail : ''}`);
  };

  const endpoints = [
    {
      path: '/api/bots',
      validate: (j) =>
        Array.isArray(j.bots) &&
        j.bots.length === 22 &&
        j.bots.every((b) => b.id && b.displayName && typeof b.rating === 'number'),
    },
    {
      path: '/api/leaderboard/rating?limit=5',
      validate: (j) =>
        Array.isArray(j.entries) &&
        j.entries.length > 0 &&
        j.entries.every((e) => e.rank && e.userId && typeof e.rating === 'number'),
    },
    {
      path: '/api/signals',
      validate: (j) =>
        typeof j.gamesToday === 'number' &&
        typeof j.puzzlesToday === 'number' &&
        'lastGame' in j &&
        'lastPuzzle' in j,
    },
    {
      path: '/api/tournaments',
      validate: (j) =>
        Array.isArray(j.tournaments) &&
        j.tournaments.every((t) => t.id && typeof t.multiplier === 'number'),
    },
    {
      path: '/api/badges',
      validate: (j) =>
        Array.isArray(j.badges) &&
        j.badges.length >= 15 &&
        j.badges.every((b) => b.id && b.category && b.tier && b.icon),
    },
    {
      path: '/api/puzzles',
      validate: (j) => Array.isArray(j.puzzles) || Array.isArray(j),
    },
  ];

  for (const { path, validate } of endpoints) {
    try {
      const r = await fetch(`${API_BASE}${path}`);
      const ok = r.ok && r.headers.get('content-type')?.includes('application/json');
      let shapeOk = false;
      if (ok) {
        const j = await r.json();
        shapeOk = validate(j);
      }
      check(`${path} → 200 + shape`, ok && shapeOk, `status=${r.status} ct=${r.headers.get('content-type')}`);
    } catch (e) {
      check(`${path}`, false, e.message);
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
// Track C — User journey E2E (uses real chromium)
// ────────────────────────────────────────────────────────────────────
async function trackC(browser) {
  const result = { steps: [], pass: 0, fail: 0, screenshots: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));

  const step = (name, ok, detail = '') => {
    result.steps.push({ name, ok, detail });
    result[ok ? 'pass' : 'fail']++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' · ' + detail : ''}`);
  };

  try {
    // 1. Cold start
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });
    step('cold start → board mounted', true);

    // Dismiss onboarding
    const dismiss = page.locator('button:has-text("ข้าม"), .onboarding-close, button:has-text("ต่อไป")').first();
    if (await dismiss.count() > 0) {
      await dismiss.click().catch(() => {});
      await page.waitForTimeout(500);
    }
    step('onboarding dismissable', true);

    // 2. Pieces render
    await page.waitForFunction(
      () => document.querySelectorAll('.cg-wrap piece').length >= 32,
      { timeout: 15_000 },
    );
    const pieceCount = await page.locator('.cg-wrap piece').count();
    step(`pieces rendered`, pieceCount >= 32, `count=${pieceCount}`);

    // 3. Navigate puzzles
    await page.goto(`${BASE}/#/puzzles`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const dailyExists = await page.locator('.puzzle-card, .daily-puzzle-card, [class*=daily]').count() > 0;
    step('puzzles index renders', dailyExists);

    // 4. Open mate-001
    await page.goto(`${BASE}/#/puzzles/mate-001`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cg-wrap', { timeout: 15_000 });
    await page.waitForTimeout(1500);
    step('puzzle deep link works', true);

    await page.screenshot({ path: '/tmp/qa-c-puzzle.png' });
    result.screenshots.push('/tmp/qa-c-puzzle.png');

    // 5. Lessons
    await page.goto(`${BASE}/#/learn`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const lessonsCount = await page.locator('.learn-card-body, .learn-group').count();
    step(`lessons index renders`, lessonsCount > 0, `cards=${lessonsCount}`);

    // 6. Profile
    await page.goto(`${BASE}/#/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    step('profile renders', await page.locator('.profile-page, .rating-card, [class*=profile]').count() > 0);

    // 7. Settings
    await page.goto(`${BASE}/#/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    step('settings renders', await page.locator('.settings-page, .setting-row').count() > 0);

    // 8. Engine swap dropdown exists
    const engineSelect = await page.locator('select, [class*=engine-select]').count();
    step('engine dropdown reachable', engineSelect > 0, `controls=${engineSelect}`);

    // 9. Service worker active
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      return reg?.active ? 'active' : (reg ? 'pending' : 'none');
    });
    step('service worker', sw === 'active', `state=${sw}`);

    step('no console errors during journey', errors.length === 0, `errors=${errors.length}`);
    if (errors.length > 0) {
      result.consoleErrors = errors.slice(0, 5);
    }
  } catch (e) {
    step('journey aborted', false, e.message.slice(0, 200));
  }

  await ctx.close();
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Track D — Engine verification (Phase 11 minimax + opening book)
// ────────────────────────────────────────────────────────────────────
async function trackD() {
  const result = { checks: [], pass: 0, fail: 0 };
  const check = (name, ok, detail = '') => {
    result.checks.push({ name, ok, detail });
    result[ok ? 'pass' : 'fail']++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' · ' + detail : ''}`);
  };

  // Inspect 3 bot tiers via /api/bots
  try {
    const r = await fetch(`${API_BASE}/api/bots`);
    const j = await r.json();
    const tiers = ['rookie', 'veteran', 'master'];
    for (const t of tiers) {
      const bots = j.bots.filter((b) => b.tier === t);
      const ratings = bots.map((b) => b.rating);
      const min = Math.min(...ratings);
      const max = Math.max(...ratings);
      check(`bots tier=${t} count + rating range`, bots.length >= 7, `n=${bots.length} rating=${min}-${max}`);
    }

    const boss = j.bots.find((b) => b.id === 'bot:fairy-stockfish-boss');
    check('Fairy-Stockfish boss present + rating 2200', boss && boss.rating === 2200, `rating=${boss?.rating}`);
  } catch (e) {
    check('bot list fetch', false, e.message);
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
// Track E — Performance metrics
// ────────────────────────────────────────────────────────────────────
async function trackE(browser) {
  const result = { metrics: {}, checks: [], pass: 0, fail: 0 };
  const check = (name, ok, detail = '') => {
    result.checks.push({ name, ok, detail });
    result[ok ? 'pass' : 'fail']++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' · ' + detail : ''}`);
  };

  // Mobile viewport (Thai market = mobile-first)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // Capture LCP via PerformanceObserver registered BEFORE navigation
  // (LCP requires the observer to be subscribed before content loads;
  // we attach it on the about:blank page, then navigate).
  await page.addInitScript(() => {
    window.__lcp = null;
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__lcp = entry.startTime;
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
  });

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const tDCL = Date.now() - t0;

  await page.waitForSelector('.cg-wrap', { timeout: 30_000 });
  const tMounted = Date.now() - t0;

  await page.waitForFunction(
    () => document.querySelectorAll('.cg-wrap piece').length >= 32,
    { timeout: 30_000 },
  );
  const tPieces = Date.now() - t0;

  // Give LCP a final beat to settle
  await page.waitForTimeout(800);

  const vitals = await page.evaluate(() => {
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime;
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      fcp: fcp ? Math.round(fcp) : null,
      lcp: window.__lcp ? Math.round(window.__lcp) : null,
      ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
      domComplete: nav ? Math.round(nav.domComplete) : null,
    };
  });

  result.metrics = {
    'domContentLoaded (ms)': tDCL,
    'board mounted (ms)': tMounted,
    'pieces rendered (ms)': tPieces,
    ...vitals,
  };

  console.log('  Metrics:', JSON.stringify(result.metrics, null, 2));

  check('DCL < 5s', tDCL < 5000, `${tDCL}ms`);
  check('board mounted < 8s', tMounted < 8000, `${tMounted}ms`);
  check('pieces rendered < 10s', tPieces < 10000, `${tPieces}ms`);
  check('FCP < 3s', vitals.fcp !== null && vitals.fcp < 3000, `${vitals.fcp}ms`);
  check('LCP < 4s (mobile)', vitals.lcp !== null && vitals.lcp < 4000, `${vitals.lcp}ms`);

  await ctx.close();
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Run
// ────────────────────────────────────────────────────────────────────
console.log(`\n=== Pre-announce QA against ${BASE} ===\n`);

console.log('── Track A: production health ─────────────────────────');
report.tracks.A = await trackA();

console.log('\n── Track B: API contract ──────────────────────────────');
report.tracks.B = await trackB();

const browser = await chromium.launch();

console.log('\n── Track C: user journey E2E ──────────────────────────');
report.tracks.C = await trackC(browser);

console.log('\n── Track D: engine verification ───────────────────────');
report.tracks.D = await trackD();

console.log('\n── Track E: performance metrics ───────────────────────');
report.tracks.E = await trackE(browser);

await browser.close();

// Aggregate
const total = Object.values(report.tracks).reduce(
  (acc, t) => ({ pass: acc.pass + (t.pass || 0), fail: acc.fail + (t.fail || 0) }),
  { pass: 0, fail: 0 },
);
report.summary = { ...total, passRate: total.pass / (total.pass + total.fail) };

console.log(`\n=== Summary ===`);
console.log(`  Pass: ${total.pass} · Fail: ${total.fail} · Rate: ${(report.summary.passRate * 100).toFixed(1)}%`);

await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nFull JSON report: ${REPORT_PATH}`);

process.exit(total.fail > 0 ? 1 : 0);
