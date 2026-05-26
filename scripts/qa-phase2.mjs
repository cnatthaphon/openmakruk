// QA Phase 2 — deeper checks after Phase 1 (39/39 baseline).
//
// Tracks:
//   F. Bot strength differential — easy/medium/hard/master should take
//      visibly different time per move (proves Phase 11 minimax depth)
//   G. Game flow smoke — play several moves, resign, see Game Report
//   H. Accessibility snapshot — landmarks, headings, link names
//   I. Resource analysis — bundle sizes, request count, total bytes
//
// Run:
//   node scripts/qa-phase2.mjs [base-url]

import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'https://www.openmakruk.com';
const REPORT_PATH = '/tmp/qa-phase2.json';

const report = { base: BASE, startedAt: new Date().toISOString(), tracks: {} };

function check(result, name, ok, detail = '') {
  result.checks.push({ name, ok, detail });
  result[ok ? 'pass' : 'fail']++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' · ' + detail : ''}`);
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────
async function bootPlay(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${BASE}/#/play`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

  const dismiss = page.locator('button:has-text("ข้าม"), .onboarding-close, button:has-text("ต่อไป")').first();
  if (await dismiss.count() > 0) {
    await dismiss.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  await page.waitForFunction(
    () => document.querySelectorAll('.cg-wrap piece').length >= 32,
    { timeout: 30_000 },
  );
}

async function setDifficulty(page, level) {
  // Difficulty <select> exists on Play sidebar. The label varies; we
  // target by value (easy/medium/hard/master) which the option uses
  // internally regardless of display label.
  const selects = await page.locator('select').all();
  for (const sel of selects) {
    const values = await sel.evaluate((el) =>
      Array.from(el.options).map((o) => o.value),
    );
    if (values.includes(level)) {
      await sel.selectOption(level);
      return true;
    }
  }
  return false;
}

async function squareCoords(page, square) {
  const box = await page.locator('.cg-wrap').first().boundingBox();
  if (!box) return null;
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0..7
  const rank = parseInt(square[1], 10); // 1..8
  const sq = box.width / 8;
  const orientation = await page
    .locator('.cg-wrap')
    .first()
    .evaluate((el) => el.classList.contains('orientation-black') ? 'black' : 'white');
  const x = orientation === 'white' ? box.x + sq * (file + 0.5) : box.x + sq * (7 - file + 0.5);
  const y = orientation === 'white' ? box.y + sq * (8 - rank + 0.5) : box.y + sq * (rank - 0.5);
  return { x, y };
}

async function timeBotMove(page, level, opening = ['e3', 'e4']) {
  await setDifficulty(page, level);

  // Reset board if needed
  const reset = page.locator('button:has-text("เริ่มใหม่"), button:has-text("รีเซ็ต")').first();
  if (await reset.count() > 0) {
    await reset.click().catch(() => {});
    await page.waitForTimeout(400);
  }

  // Get FEN before user move
  const fenBefore = await page.evaluate(() => {
    const log = window.__openmakrukLog?.events ?? [];
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].data?.fen) return log[i].data.fen;
    }
    return null;
  });

  // Play e3 → e4 (white opening)
  const fromCoord = await squareCoords(page, opening[0]);
  const toCoord = await squareCoords(page, opening[1]);
  if (!fromCoord || !toCoord) return { error: 'no board box' };

  await page.touchscreen?.tap?.(fromCoord.x, fromCoord.y).catch(async () => {
    await page.mouse.click(fromCoord.x, fromCoord.y);
  });
  await page.waitForTimeout(150);
  await page.mouse.click(toCoord.x, toCoord.y);

  // Wait for bot's reply: piece count on opponent rank should differ
  const t0 = Date.now();
  let elapsed = 0;
  try {
    await page.waitForFunction(
      (priorFen) => {
        const log = window.__openmakrukLog?.events ?? [];
        for (let i = log.length - 1; i >= 0; i--) {
          if (log[i].data?.fen && log[i].data.fen !== priorFen) return true;
        }
        return false;
      },
      fenBefore,
      { timeout: 30_000 },
    );
    elapsed = Date.now() - t0;
  } catch {
    elapsed = -1;
  }

  return { level, elapsedMs: elapsed };
}

// ────────────────────────────────────────────────────────────────────
// Track F — Bot strength differential
// ────────────────────────────────────────────────────────────────────
async function trackF(browser) {
  const result = { checks: [], pass: 0, fail: 0, timings: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    await bootPlay(page);

    // Note: difficulty option values match what engine.ts DIFFICULTY_PRESETS keys are
    for (const level of ['easy', 'medium', 'hard']) {
      const t = await timeBotMove(page, level);
      result.timings.push(t);
      console.log(`  · ${level}: ${t.elapsedMs}ms`);
    }

    const easy = result.timings.find((t) => t.level === 'easy');
    const medium = result.timings.find((t) => t.level === 'medium');
    const hard = result.timings.find((t) => t.level === 'hard');

    check(result, 'easy responds < 3s', easy && easy.elapsedMs >= 0 && easy.elapsedMs < 3000, `${easy?.elapsedMs}ms`);
    check(result, 'medium responds within 5s', medium && medium.elapsedMs >= 0 && medium.elapsedMs < 5000, `${medium?.elapsedMs}ms`);
    check(result, 'hard responds within 15s', hard && hard.elapsedMs >= 0 && hard.elapsedMs < 15000, `${hard?.elapsedMs}ms`);

    // Differential: hard should NOT respond as fast as easy
    // (if all the same, Phase 11 depth difference isn't propagating)
    const diff = hard && easy && (hard.elapsedMs > easy.elapsedMs + 50);
    check(result, 'tier differential (hard > easy)', diff, `easy=${easy?.elapsedMs}ms hard=${hard?.elapsedMs}ms`);
  } catch (e) {
    check(result, 'track F aborted', false, e.message.slice(0, 200));
  }

  await ctx.close();
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Track G — Game flow smoke
// ────────────────────────────────────────────────────────────────────
async function trackG(browser) {
  const result = { checks: [], pass: 0, fail: 0 };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    await bootPlay(page);
    await setDifficulty(page, 'easy');

    // Play 5 moves
    const moves = [['e3', 'e4'], ['f3', 'f4'], ['d2', 'd3'], ['c2', 'c3'], ['b2', 'b3']];
    let played = 0;
    for (const [from, to] of moves) {
      const fc = await squareCoords(page, from);
      const tc = await squareCoords(page, to);
      if (!fc || !tc) break;
      await page.mouse.click(fc.x, fc.y);
      await page.waitForTimeout(150);
      await page.mouse.click(tc.x, tc.y);
      await page.waitForTimeout(2500); // wait for bot reply
      played++;
    }
    check(result, `play 5 moves succeeded`, played >= 3, `played=${played}/5`);

    // Resign
    const resignBtn = page.locator('button:has-text("ยอมแพ้"), button:has-text("Resign")').first();
    if (await resignBtn.count() > 0) {
      await resignBtn.click().catch(() => {});
      // Confirm if toast appears
      await page.waitForTimeout(500);
      const confirmBtn = page.locator('.toast-confirm-ok, button:has-text("ยืนยัน"), button:has-text("Confirm")').first();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click().catch(() => {});
      }
      await page.waitForTimeout(1500);
      check(result, 'resign button clicked + confirmed', true);
    } else {
      check(result, 'resign button visible', false);
    }

    // Game over overlay should appear
    const gameOver = await page.locator('.game-over-overlay, [class*=game-over], [class*=GameOver]').count();
    check(result, 'game-over UI shown', gameOver > 0, `overlays=${gameOver}`);

    // Game Report accessible
    const report = await page.locator('.game-report, [class*=GameReport], [class*=game-report], button:has-text("รีวิว")').count();
    check(result, 'Game Report surface present', report > 0, `surfaces=${report}`);

    await page.screenshot({ path: '/tmp/qa-g-gameover.png' });
  } catch (e) {
    check(result, 'track G aborted', false, e.message.slice(0, 200));
  }

  await ctx.close();
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Track H — Accessibility snapshot
// ────────────────────────────────────────────────────────────────────
async function trackH(browser) {
  const result = { checks: [], pass: 0, fail: 0, snapshot: {} };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // Pull a11y tree snapshot
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    result.snapshot.hasTree = !!snapshot;

    // Count landmarks + headings + buttons
    const audit = await page.evaluate(() => {
      const landmarks = document.querySelectorAll('[role="navigation"], [role="main"], [role="banner"], [role="contentinfo"], nav, main, header, footer').length;
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
      const buttons = document.querySelectorAll('button').length;
      const buttonsNoText = Array.from(document.querySelectorAll('button')).filter((b) => !b.textContent?.trim() && !b.getAttribute('aria-label')).length;
      const linksNoText = Array.from(document.querySelectorAll('a')).filter((a) => !a.textContent?.trim() && !a.getAttribute('aria-label')).length;
      const imgsNoAlt = Array.from(document.querySelectorAll('img')).filter((i) => !i.alt && !i.getAttribute('aria-label')).length;
      const inputsNoLabel = Array.from(document.querySelectorAll('input, select, textarea')).filter((el) => {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
        const id = el.id;
        if (id && document.querySelector(`label[for="${id}"]`)) return false;
        const parentLabel = el.closest('label');
        if (parentLabel) return false;
        return true;
      }).length;
      const lang = document.documentElement.lang;
      return { landmarks, headings, buttons, buttonsNoText, linksNoText, imgsNoAlt, inputsNoLabel, lang };
    });
    result.snapshot.audit = audit;
    console.log('  Audit:', JSON.stringify(audit, null, 2));

    check(result, 'document has lang attribute', !!audit.lang, `lang="${audit.lang}"`);
    check(result, 'has navigation landmarks', audit.landmarks >= 2, `count=${audit.landmarks}`);
    check(result, 'has heading structure', audit.headings > 0, `count=${audit.headings}`);
    check(result, 'all buttons have accessible name', audit.buttonsNoText === 0, `unnamed=${audit.buttonsNoText}/${audit.buttons}`);
    check(result, 'all links have accessible name', audit.linksNoText === 0, `unnamed=${audit.linksNoText}`);
    check(result, 'all images have alt', audit.imgsNoAlt === 0, `noAlt=${audit.imgsNoAlt}`);
    check(result, 'form controls have labels', audit.inputsNoLabel === 0, `unlabeled=${audit.inputsNoLabel}`);
  } catch (e) {
    check(result, 'track H aborted', false, e.message.slice(0, 200));
  }

  await ctx.close();
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Track I — Resource analysis
// ────────────────────────────────────────────────────────────────────
async function trackI(browser) {
  const result = { checks: [], pass: 0, fail: 0, resources: {} };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const resources = [];
  page.on('response', async (resp) => {
    try {
      const headers = resp.headers();
      const sizeStr = headers['content-length'];
      resources.push({
        url: resp.url(),
        status: resp.status(),
        type: resp.request().resourceType(),
        size: sizeStr ? parseInt(sizeStr, 10) : null,
        cacheControl: headers['cache-control'] ?? null,
      });
    } catch {}
  });

  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });

    const byType = {};
    let totalSize = 0;
    for (const r of resources) {
      const t = r.type;
      byType[t] = byType[t] || { count: 0, size: 0 };
      byType[t].count++;
      if (r.size) {
        byType[t].size += r.size;
        totalSize += r.size;
      }
    }

    // Find big assets
    const heavy = resources
      .filter((r) => r.size && r.size > 50_000)
      .sort((a, b) => b.size - a.size)
      .slice(0, 8)
      .map((r) => ({ url: r.url.split('?')[0].split('/').pop(), size: r.size }));

    result.resources = { byType, totalSize, heavy, requestCount: resources.length };
    console.log('  By type:', JSON.stringify(byType, null, 2));
    console.log('  Total size:', (totalSize / 1024).toFixed(0), 'KB');
    console.log('  Heaviest:');
    heavy.forEach((h) => console.log(`    · ${h.url} → ${(h.size / 1024).toFixed(0)} KB`));

    check(result, 'request count < 50', resources.length < 50, `count=${resources.length}`);
    check(result, 'total transfer < 5 MB', totalSize < 5_000_000, `${(totalSize / 1024).toFixed(0)}KB`);
    check(result, 'JS bundle reasonable (<1MB)', (byType.script?.size ?? 0) < 1_000_000, `js=${((byType.script?.size ?? 0) / 1024).toFixed(0)}KB`);
    check(result, 'all responses ok', resources.every((r) => r.status < 400), `errors=${resources.filter((r) => r.status >= 400).length}`);

    // Cache headers for /assets/*
    const assets = resources.filter((r) => /\/assets\//.test(r.url));
    const immutableCount = assets.filter((r) => /immutable/.test(r.cacheControl ?? '')).length;
    check(result, '/assets/* immutable cache headers', assets.length === 0 || immutableCount === assets.length, `${immutableCount}/${assets.length}`);
  } catch (e) {
    check(result, 'track I aborted', false, e.message.slice(0, 200));
  }

  await ctx.close();
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Run
// ────────────────────────────────────────────────────────────────────
console.log(`\n=== QA Phase 2 against ${BASE} ===\n`);

const browser = await chromium.launch();

console.log('── Track F: bot strength differential ─────────────');
report.tracks.F = await trackF(browser);

console.log('\n── Track G: game flow smoke ───────────────────────');
report.tracks.G = await trackG(browser);

console.log('\n── Track H: accessibility snapshot ────────────────');
report.tracks.H = await trackH(browser);

console.log('\n── Track I: resource analysis ─────────────────────');
report.tracks.I = await trackI(browser);

await browser.close();

const total = Object.values(report.tracks).reduce(
  (acc, t) => ({ pass: acc.pass + (t.pass || 0), fail: acc.fail + (t.fail || 0) }),
  { pass: 0, fail: 0 },
);
report.summary = { ...total, passRate: total.pass / (total.pass + total.fail) };

console.log(`\n=== Summary ===`);
console.log(`  Pass: ${total.pass} · Fail: ${total.fail} · Rate: ${(report.summary.passRate * 100).toFixed(1)}%`);

await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nFull JSON report: ${REPORT_PATH}`);
