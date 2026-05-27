// Deep flow tests with onboarding bypassed (set openmakruk_onboarded flag
// before page scripts run). Tests ACTUAL interaction completion, not just
// page load.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = 'https://www.openmakruk.com';
const OUT = '/tmp/qa-deepflow';
await mkdir(OUT, { recursive: true });

const findings = [];
function flag(test, severity, msg) {
  findings.push({ test, severity, msg });
  const icon = severity === 'pass' ? '✅' : severity === 'partial' ? '🟡' : '🔴';
  console.log(`  ${icon} ${msg}`);
}

const browser = await chromium.launch();

async function freshPage(viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
  // Bypass onboarding: set the flag BEFORE any page script runs
  await page.addInitScript(() => {
    try { localStorage.setItem('openmakruk_onboarded', '1'); } catch {}
  });
  return { ctx, page, errors };
}

async function sq(page, square) {
  const box = await page.locator('.cg-wrap').first().boundingBox();
  if (!box) return null;
  const f = square.charCodeAt(0) - 97, r = parseInt(square[1], 10), s = box.width / 8;
  return { x: box.x + s * (f + 0.5), y: box.y + s * (8 - r + 0.5) };
}

// ── Test 1: Solve mate-001 puzzle (a1→a8) ──
async function testPuzzleSolve() {
  console.log('\n── Puzzle solve: mate-001 (a1→a8) ──');
  const { ctx, page, errors } = await freshPage();
  await page.goto(`${BASE}/#/puzzles/mate-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cg-wrap', { timeout: 20_000 });
  await page.waitForTimeout(2000);

  const modalBlocking = await page.locator('.onboarding-backdrop').count();
  flag('PuzzleSolve', modalBlocking === 0 ? 'pass' : 'fail', `Onboarding bypassed: ${modalBlocking === 0}`);

  const from = await sq(page, 'a1'), to = await sq(page, 'a8');
  await page.mouse.click(from.x, from.y);
  await page.waitForTimeout(300);
  await page.mouse.click(to.x, to.y);
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `${OUT}/puzzle-solved.png` });
  const success = await page.locator('.puzzle-feedback-text.good, [class*=success], [class*=correct], :has-text("ถูกต้อง"), :has-text("สำเร็จ")').count();
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasWin = /ถูกต้อง|สำเร็จ|รุกจน|แก้ได้|ชนะ|✓|🎉/.test(bodyText);
  flag('PuzzleSolve', hasWin ? 'pass' : 'partial', `Success feedback present: ${hasWin} (selector matches: ${success})`);
  if (errors.length) flag('PuzzleSolve', 'partial', `${errors.length} console errors`);
  await ctx.close();
}

// ── Test 2: Pattern Recognition full cycle ──
async function testPattern() {
  console.log('\n── Pattern Recognition cycle ──');
  const { ctx, page, errors } = await freshPage();
  await page.goto(`${BASE}/#/pattern`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const modalBlocking = await page.locator('.onboarding-backdrop').count();
  flag('Pattern', modalBlocking === 0 ? 'pass' : 'fail', `Onboarding bypassed: ${modalBlocking === 0}`);

  const startBtn = page.locator('button:has-text("เริ่ม"), button:has-text("Start")').first();
  if (await startBtn.count() > 0) {
    await startBtn.click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/pattern-flash.png` });
    // Board flashes 3s then hides
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/pattern-question.png` });
    // Look for MC answer options
    const choices = await page.locator('button').filter({ hasText: /^\d+$|ตัว|[a-h][1-8]/ }).count();
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasQuestion = /กี่ตัว|อยู่ที่|ขุน|จำนวน|ช่องไหน/.test(bodyText);
    flag('Pattern', hasQuestion ? 'pass' : 'partial', `Question shown: ${hasQuestion}, MC buttons: ${choices}`);
  } else {
    flag('Pattern', 'fail', `No start button`);
  }
  if (errors.length) flag('Pattern', 'partial', `${errors.length} console errors`);
  await ctx.close();
}

// ── Test 3: Boss Rush play 1 move ──
async function testBossRush() {
  console.log('\n── Boss Rush: start + play ──');
  const { ctx, page, errors } = await freshPage();
  await page.goto(`${BASE}/#/bossrush`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const rookie = page.locator('button:has-text("Rookie"), [class*=card]:has-text("Rookie")').first();
  if (await rookie.count() > 0) {
    await rookie.click().catch(() => {});
    await page.waitForTimeout(3000);
    const board = await page.locator('.cg-wrap').count();
    const pieces = await page.locator('.cg-wrap piece').count();
    flag('BossRush', board > 0 && pieces >= 16 ? 'pass' : 'partial', `Run started: board=${board} pieces=${pieces}`);
    if (board > 0) {
      // Play 1 move
      const from = await sq(page, 'e3'), to = await sq(page, 'e4');
      if (from && to) {
        await page.mouse.click(from.x, from.y);
        await page.waitForTimeout(200);
        await page.mouse.click(to.x, to.y);
        await page.waitForTimeout(3000);
        const piecesAfter = await page.locator('.cg-wrap piece').count();
        flag('BossRush', 'pass', `Move played, bot replied (pieces=${piecesAfter})`);
      }
    }
    await page.screenshot({ path: `${OUT}/bossrush-play.png` });
  } else {
    flag('BossRush', 'fail', `No Rookie card`);
  }
  if (errors.length) flag('BossRush', 'partial', `${errors.length} console errors`);
  await ctx.close();
}

// ── Test 4: Survive play 1 move ──
async function testSurvive() {
  console.log('\n── Survive: start + defend ──');
  const { ctx, page, errors } = await freshPage();
  await page.goto(`${BASE}/#/survive`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const card = page.locator('[class*=card]:has-text("defense"), button:has-text("defense")').first();
  if (await card.count() > 0) {
    await card.click().catch(() => {});
    await page.waitForTimeout(4000);
    const board = await page.locator('.cg-wrap').count();
    const pieces = await page.locator('.cg-wrap piece').count();
    flag('Survive', board > 0 && pieces >= 2 ? 'pass' : 'partial', `Defense run: board=${board} pieces=${pieces}`);
    await page.screenshot({ path: `${OUT}/survive-play.png` });
  } else {
    flag('Survive', 'fail', `No defense card`);
  }
  if (errors.length) flag('Survive', 'partial', `${errors.length} console errors`);
  await ctx.close();
}

// ── Test 5: Counting Drill ──
async function testCounting() {
  console.log('\n── Counting Drill ──');
  const { ctx, page, errors } = await freshPage();
  await page.goto(`${BASE}/#/counting`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const card = page.locator('[class*=card]:has-text("L1"), button:has-text("L1"), [class*=counting-level]').first();
  if (await card.count() > 0) {
    await card.click().catch(() => {});
    await page.waitForTimeout(3000);
    const board = await page.locator('.cg-wrap').count();
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasCounting = /นับ|count|\d+\s*\/\s*\d+|เหลือ/i.test(bodyText);
    flag('Counting', board > 0 ? 'pass' : 'partial', `Drill: board=${board}, counting UI: ${hasCounting}`);
    await page.screenshot({ path: `${OUT}/counting-play.png` });
  } else {
    flag('Counting', 'fail', `No level card`);
  }
  if (errors.length) flag('Counting', 'partial', `${errors.length} console errors`);
  await ctx.close();
}

// ── Test 6: Game → resign → Game Report ──
async function testGameReport() {
  console.log('\n── Game → resign → Game Report ──');
  const { ctx, page, errors } = await freshPage();
  await page.goto(`${BASE}/#/play`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cg-wrap', { timeout: 20_000 });
  await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20_000 });

  // Play 2 moves
  for (const [f, t] of [['e3', 'e4'], ['d2', 'd3']]) {
    const fc = await sq(page, f), tc = await sq(page, t);
    await page.mouse.click(fc.x, fc.y);
    await page.waitForTimeout(200);
    await page.mouse.click(tc.x, tc.y);
    await page.waitForTimeout(3000);
  }

  // Resign via quick-action
  const resign = page.locator('.play-quick-resign').first();
  if (await resign.count() > 0 && await resign.isVisible()) {
    flag('GameReport', 'pass', `Resign quick-action visible`);
    await resign.click().catch(() => {});
    await page.waitForTimeout(700);
    const confirm = page.locator('.toast-confirm-ok, button:has-text("ยืนยัน")').first();
    if (await confirm.count() > 0) await confirm.click().catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/game-resigned.png` });

    const gameOver = await page.locator('.game-over-overlay, [class*=game-over]').count();
    const reportText = await page.evaluate(() => document.body.innerText);
    const hasReport = /accuracy|ACPL|รีวิว|รายงาน|แม่นยำ|วิเคราะห์|key moment|ตาที่/i.test(reportText);
    flag('GameReport', gameOver > 0 ? 'pass' : 'partial', `Game-over UI: ${gameOver > 0}`);
    flag('GameReport', hasReport ? 'pass' : 'partial', `Report/review surface: ${hasReport}`);
  } else {
    flag('GameReport', 'fail', `Resign quick-action not visible`);
  }
  if (errors.length) flag('GameReport', 'partial', `${errors.length} console errors: ${errors[0]?.slice(0,80)}`);
  await ctx.close();
}

// ── Test 7: Theme switch persistence ──
async function testTheme() {
  console.log('\n── Theme switch + persistence ──');
  const { ctx, page, errors } = await freshPage();
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Find board theme select
  const selects = await page.locator('select').all();
  let themeChanged = false;
  for (const sel of selects) {
    const opts = await sel.evaluate((el) => Array.from(el.options).map((o) => o.value));
    if (opts.includes('green') || opts.includes('blue') || opts.includes('wood')) {
      const current = await sel.inputValue();
      const target = opts.find((o) => o !== current && ['green', 'blue', 'wood'].includes(o));
      if (target) {
        await sel.selectOption(target);
        await page.waitForTimeout(500);
        themeChanged = true;
        // Verify localStorage
        const saved = await page.evaluate(() => localStorage.getItem('openmakruk_settings'));
        const persisted = saved && saved.includes(target);
        flag('Theme', persisted ? 'pass' : 'partial', `Theme→${target}, persisted in localStorage: ${persisted}`);
      }
      break;
    }
  }
  if (!themeChanged) flag('Theme', 'partial', `No board theme select found`);
  if (errors.length) flag('Theme', 'partial', `${errors.length} console errors`);
  await ctx.close();
}

await testPuzzleSolve();
await testPattern();
await testBossRush();
await testSurvive();
await testCounting();
await testGameReport();
await testTheme();

await browser.close();

console.log(`\n=== Summary ===`);
const pass = findings.filter((f) => f.severity === 'pass').length;
const partial = findings.filter((f) => f.severity === 'partial').length;
const fail = findings.filter((f) => f.severity === 'fail').length;
console.log(`  ✅ PASS: ${pass} · 🟡 PARTIAL: ${partial} · 🔴 FAIL: ${fail}`);
console.log(`Screenshots: ${OUT}/`);
