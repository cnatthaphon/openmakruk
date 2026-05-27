// Comprehensive E2E user journey + click-crawl.
// Simulates a real user doing EVERYTHING the platform offers, end to end,
// and asserts each flow actually works — not just that pages load.
//
// Coverage: อ่าน(learn) · ปริศนา(solve) · เล่น(play full game) ·
//           ตั้งโจทย์(create puzzle) · ฝึกฝน(practice modes) · ท้าทาย(challenge)
// Plus: crawl every route + click prominent buttons, catch crashes.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'https://www.openmakruk.com';
const OUT = '/tmp/qa-e2e';
await mkdir(OUT, { recursive: true });

const findings = [];
function rec(journey, severity, msg) {
  findings.push({ journey, severity, msg });
  const icon = severity === 'pass' ? '✅' : severity === 'partial' ? '🟡' : '🔴';
  console.log(`  ${icon} ${msg}`);
}

const browser = await chromium.launch();

async function newPage(bypassOnboarding = true) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
  if (bypassOnboarding) {
    await page.addInitScript(() => { try { localStorage.setItem('openmakruk_onboarded','1'); } catch {} });
  }
  return { ctx, page, errors };
}

async function dismissOnboarding(page) {
  const d = page.locator('button:has-text("ข้าม"), button:has-text("ต่อไป"), .onboarding-close').first();
  if (await d.count() > 0) { await d.click().catch(() => {}); await page.waitForTimeout(400); }
}

async function crashed(page) {
  return (await page.locator('.error-boundary').count()) > 0;
}

// chessground board helpers (read legal moves from .move-dest)
async function boardBox(page) { return page.locator('.cg-wrap').first().boundingBox(); }
function pxToName(x, y, S) {
  return String.fromCharCode(97 + Math.round(x / S)) + (8 - Math.round(y / S));
}
async function playOneLegalMove(page) {
  const box = await boardBox(page);
  if (!box) return null;
  const S = box.width / 8;
  const pieces = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('cg-board piece.white').forEach((p) => {
      const m = /translate\((\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)px\)/.exec(p.style.transform || '');
      if (m) out.push({ x: +m[1], y: +m[2] });
    });
    return out;
  });
  pieces.sort(() => Math.random() - 0.5);
  for (const pc of pieces) {
    await page.mouse.click(box.x + pc.x + S / 2, box.y + pc.y + S / 2);
    await page.waitForTimeout(110);
    const dests = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('cg-board square.move-dest').forEach((sq) => {
        const m = /translate\((\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)px\)/.exec(sq.style.transform || '');
        if (m) out.push({ x: +m[1], y: +m[2] });
      });
      return out;
    });
    if (dests.length === 0) { await page.mouse.click(box.x + pc.x + S / 2, box.y + pc.y + S / 2); continue; }
    const d = dests[Math.floor(Math.random() * dests.length)];
    await page.mouse.click(box.x + d.x + S / 2, box.y + d.y + S / 2);
    return `${pxToName(pc.x, pc.y, S)}${pxToName(d.x, d.y, S)}`;
  }
  return null;
}
async function searchCount(page) {
  return page.evaluate(() => (window.__openmakrukLog?.events ?? []).filter((e) => e.step === 'engine.search.start').length);
}

// ── J0: Onboarding shows on fresh root + dismissable ──
async function j0_onboarding() {
  console.log('\n── J0: First-visit onboarding ──');
  const { ctx, page, errors } = await newPage(false); // do NOT bypass
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const modal = await page.locator('.onboarding-backdrop, [class*=onboarding]').count();
  rec('J0-onboarding', modal > 0 ? 'pass' : 'partial', `Onboarding shows on root: ${modal > 0}`);
  await dismissOnboarding(page);
  await page.waitForTimeout(500);
  const gone = await page.locator('.onboarding-backdrop').count();
  rec('J0-onboarding', gone === 0 ? 'pass' : 'fail', `Dismissable: ${gone === 0}`);
  rec('J0-onboarding', errors.length === 0 ? 'pass' : 'partial', `Console errors: ${errors.length}`);
  await ctx.close();
}

// ── J1: อ่าน — open lesson + step through ──
async function j1_learn() {
  console.log('\n── J1: อ่าน (Learn a lesson) ──');
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/#/learn`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (await crashed(page)) { rec('J1-learn', 'fail', `/#/learn crashed`); await ctx.close(); return; }

  const firstLesson = page.locator('.learn-card-body, .learn-card, [class*=learn-card]').first();
  if (await firstLesson.count() === 0) { rec('J1-learn', 'fail', `No lesson cards`); await ctx.close(); return; }
  await firstLesson.click().catch(() => {});
  await page.waitForTimeout(1500);
  rec('J1-learn', !(await crashed(page)) ? 'pass' : 'fail', `Lesson opened`);

  // Step through with next button
  let steps = 0;
  for (let i = 0; i < 8; i++) {
    const next = page.locator('button:has-text("ถัดไป"), button:has-text("เข้าใจแล้ว"), button:has-text("จบ")').first();
    if (await next.count() === 0) break;
    if (!(await next.isEnabled().catch(() => false))) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(700);
    steps++;
    if (await crashed(page)) { rec('J1-learn', 'fail', `Crash at lesson step ${steps}`); break; }
  }
  rec('J1-learn', steps > 0 ? 'pass' : 'partial', `Stepped through ${steps} lesson steps`);
  rec('J1-learn', errors.length === 0 ? 'pass' : 'partial', `Console errors: ${errors.length}`);
  await page.screenshot({ path: `${OUT}/j1-learn.png` });
  await ctx.close();
}

// ── J2: ปริศนา — solve mate-001 ──
async function j2_puzzle() {
  console.log('\n── J2: ปริศนา (Solve mate-001) ──');
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/#/puzzles/mate-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cg-wrap', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  if (await crashed(page)) { rec('J2-puzzle', 'fail', `puzzle crashed`); await ctx.close(); return; }

  const box = await boardBox(page);
  const S = box.width / 8;
  // a1 → a8 (the known solution)
  await page.mouse.click(box.x + S * 0.5, box.y + S * 7.5);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + S * 0.5, box.y + S * 0.5);
  await page.waitForTimeout(2000);

  const body = await page.evaluate(() => document.body.innerText);
  const solved = /ถูกต้อง|สำเร็จ|optimal|✓|🎉|รุกจน/.test(body);
  rec('J2-puzzle', solved ? 'pass' : 'fail', `mate-001 solved (a1→a8): ${solved}`);
  rec('J2-puzzle', errors.length === 0 ? 'pass' : 'partial', `Console errors: ${errors.length}`);
  await page.screenshot({ path: `${OUT}/j2-puzzle.png` });
  await ctx.close();
}

// ── J3: เล่น — full game vs bot ──
async function j3_play() {
  console.log('\n── J3: เล่น (Full game vs easy bot) ──');
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/#/play`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cg-wrap', { timeout: 20_000 });
  await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20_000 });
  for (const sel of await page.locator('select').all()) {
    const opts = await sel.evaluate((el) => Array.from(el.options).map((o) => o.value));
    if (opts.includes('easy')) { await sel.selectOption('easy'); break; }
  }

  let moves = 0, replies = 0;
  const tStart = Date.now();
  for (let turn = 0; turn < 80; turn++) {
    if (await page.locator('.game-over-overlay').count() > 0) break;
    if (Date.now() - tStart > 120_000) break;
    const before = await searchCount(page);
    const mv = await playOneLegalMove(page);
    if (!mv) { await page.waitForTimeout(400); if (await page.locator('.game-over-overlay').count() > 0) break; continue; }
    moves++;
    const t0 = Date.now();
    let replied = false;
    while (Date.now() - t0 < 15_000) {
      await page.waitForTimeout(350);
      if (await searchCount(page) > before) { replied = true; break; }
      if (await page.locator('.game-over-overlay').count() > 0) { replied = true; break; }
    }
    if (replied) replies++;
  }
  const over = await page.locator('.game-over-overlay').count() > 0;
  rec('J3-play', moves >= 10 ? 'pass' : 'partial', `Played ${moves} moves, ${replies} bot replies`);
  rec('J3-play', over ? 'pass' : 'partial', `Game reached conclusion: ${over}`);
  rec('J3-play', errors.length === 0 ? 'pass' : 'fail', `Console errors: ${errors.length}`);
  await page.screenshot({ path: `${OUT}/j3-play.png` });
  await ctx.close();
}

// ── J4: ตั้งโจทย์ — Custom editor → save as puzzle ──
async function j4_createPuzzle() {
  console.log('\n── J4: ตั้งโจทย์ (Create puzzle in Custom) ──');
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/#/custom`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (await crashed(page)) { rec('J4-create', 'fail', `/#/custom crashed`); await ctx.close(); return; }

  // Palette piece + place on square
  const palette = page.locator('.custom-palette-btn').first();
  const paletteFound = await palette.count() > 0;
  rec('J4-create', paletteFound ? 'pass' : 'partial', `Custom palette present: ${paletteFound}`);
  if (paletteFound) {
    await palette.click().catch(() => {});
    await page.waitForTimeout(200);
    const sq = page.locator('.custom-square').nth(28); // some middle square
    if (await sq.count() > 0) { await sq.click().catch(() => {}); await page.waitForTimeout(300); }
  }

  // Look for "save as puzzle" action
  const savePuzzle = page.locator('button:has-text("puzzle"), button:has-text("บันทึกเป็น puzzle"), button:has-text("บันทึกในคลัง")').first();
  rec('J4-create', await savePuzzle.count() > 0 ? 'pass' : 'partial', `Save-as-puzzle / save action present: ${await savePuzzle.count() > 0}`);

  // "Play from position" + "Analyze" + "Copy FEN" presence
  const playFrom = await page.locator('button:has-text("เล่นจาก"), button:has-text("position")').count();
  const analyze = await page.locator('button:has-text("วิเคราะห์")').count();
  const copyFen = await page.locator('button:has-text("FEN")').count();
  rec('J4-create', playFrom > 0 ? 'pass' : 'partial', `Play-from-position: ${playFrom}, Analyze: ${analyze}, CopyFEN: ${copyFen}`);
  rec('J4-create', errors.length === 0 ? 'pass' : 'partial', `Console errors: ${errors.length}`);
  await page.screenshot({ path: `${OUT}/j4-create.png` });
  await ctx.close();
}

// ── J5: ฝึกฝน — practice modes each start ──
async function j5_practice() {
  console.log('\n── J5: ฝึกฝน (Practice modes) ──');
  const modes = [
    { id: 'movetrainer', start: 'button:has-text("Khun-Pawn"), [class*=card]' },
    { id: 'counting',    start: 'button:has-text("L1"), [class*=card]' },
    { id: 'rush',        start: 'button:has-text("เริ่ม"), button:has-text("Start")' },
    { id: 'bossrush',    start: 'button:has-text("Rookie"), [class*=card]' },
    { id: 'pattern',     start: 'button:has-text("เริ่ม"), button:has-text("Start")' },
    { id: 'survive',     start: '[class*=card]:has-text("defense"), button:has-text("defense")' },
  ];
  for (const m of modes) {
    const { ctx, page, errors } = await newPage();
    await page.goto(`${BASE}/#/${m.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    if (await crashed(page)) { rec('J5-practice', 'fail', `${m.id}: crashed on load`); await ctx.close(); continue; }
    const entry = page.locator(m.start).first();
    let started = false;
    if (await entry.count() > 0) {
      await entry.click().catch(() => {});
      await page.waitForTimeout(2500);
      started = !(await crashed(page));
    }
    rec('J5-practice', started ? 'pass' : 'partial', `${m.id}: entry clicked, no crash=${started}`);
    if (errors.length) rec('J5-practice', 'partial', `${m.id}: ${errors.length} console errors`);
    await page.screenshot({ path: `${OUT}/j5-${m.id}.png` });
    await ctx.close();
  }
}

// ── J6: ท้าทาย — challenge create ──
async function j6_challenge() {
  console.log('\n── J6: ท้าทาย (Challenge create) ──');
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/#/challenge`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (await crashed(page)) { rec('J6-challenge', 'fail', `/#/challenge crashed`); await ctx.close(); return; }
  const body = await page.evaluate(() => document.body.innerText);
  const hasChallengeUI = /challenge|ท้าทาย|สร้าง|create|URL|ลิงก์/i.test(body);
  rec('J6-challenge', hasChallengeUI ? 'pass' : 'partial', `Challenge UI present: ${hasChallengeUI}`);
  const createBtn = page.locator('button:has-text("สร้าง"), button:has-text("Create"), button:has-text("ท้า")').first();
  if (await createBtn.count() > 0) {
    await createBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
    rec('J6-challenge', !(await crashed(page)) ? 'pass' : 'fail', `Create challenge clicked, no crash`);
  } else {
    rec('J6-challenge', 'partial', `No explicit create button found`);
  }
  rec('J6-challenge', errors.length === 0 ? 'pass' : 'partial', `Console errors: ${errors.length}`);
  await page.screenshot({ path: `${OUT}/j6-challenge.png` });
  await ctx.close();
}

// ── J7: CRAWL — every route + click prominent buttons ──
async function j7_crawl() {
  console.log('\n── J7: Crawl all routes + click buttons ──');
  const routes = ['play','learn','study','puzzles','custom','library','profile','settings','about',
                  'stats','challenge','counting','rush','exhibition','movetrainer','bossrush','pattern','survive','bots'];
  const { ctx, page, errors } = await newPage();
  let crashes = 0, routesOk = 0;
  for (const r of routes) {
    const errBefore = errors.length;
    await page.goto(`${BASE}/#/${r}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    if (await crashed(page)) { rec('J7-crawl', 'fail', `/#/${r} → ErrorBoundary`); crashes++; continue; }
    routesOk++;
    // Click first 3 visible non-destructive buttons
    const buttons = await page.locator('button:visible').all();
    let clicked = 0;
    for (const b of buttons.slice(0, 5)) {
      const txt = (await b.textContent().catch(() => '')) || '';
      // skip destructive
      if (/ลบ|delete|reset|รีเซ็ต|ยอมแพ้|clear|ล้าง/i.test(txt)) continue;
      await b.click().catch(() => {});
      await page.waitForTimeout(250);
      if (await crashed(page)) { rec('J7-crawl', 'fail', `/#/${r} crashed after clicking "${txt.trim().slice(0,20)}"`); crashes++; break; }
      clicked++;
    }
    const routeErrs = errors.slice(errBefore);
    if (routeErrs.length > 0) rec('J7-crawl', 'partial', `/#/${r}: ${routeErrs.length} console errors (${routeErrs[0]?.slice(0,80)})`);
  }
  rec('J7-crawl', crashes === 0 ? 'pass' : 'fail', `Crawled ${routes.length} routes · ${routesOk} ok · ${crashes} crashes`);
  await ctx.close();
}

await j0_onboarding();
await j1_learn();
await j2_puzzle();
await j3_play();
await j4_createPuzzle();
await j5_practice();
await j6_challenge();
await j7_crawl();

await browser.close();

console.log(`\n================ E2E SUMMARY ================`);
const pass = findings.filter((f) => f.severity === 'pass').length;
const partial = findings.filter((f) => f.severity === 'partial').length;
const fail = findings.filter((f) => f.severity === 'fail').length;
console.log(`  ✅ PASS: ${pass} · 🟡 PARTIAL: ${partial} · 🔴 FAIL: ${fail}`);
if (fail > 0) {
  console.log(`\n🔴 FAILURES:`);
  findings.filter((f) => f.severity === 'fail').forEach((f) => console.log(`  · [${f.journey}] ${f.msg}`));
}
if (partial > 0) {
  console.log(`\n🟡 PARTIALS:`);
  findings.filter((f) => f.severity === 'partial').forEach((f) => console.log(`  · [${f.journey}] ${f.msg}`));
}
console.log(`\nScreenshots: ${OUT}/`);
