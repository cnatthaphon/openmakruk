// Deep smoke on Phase 12-18 features — actually interact, not just load.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = 'https://www.openmakruk.com';
const OUT = '/tmp/qa-deep-features';
await mkdir(OUT, { recursive: true });

const findings = [];
function flag(feature, severity, message) {
  findings.push({ feature, severity, message });
  const icon = severity === 'pass' ? '✅' : severity === 'partial' ? '🟡' : '🔴';
  console.log(`  ${icon} ${message}`);
}

const browser = await chromium.launch();

async function setupClean(viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));

  // Cold start: clear state, then deep-link directly so onboarding skips
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  return { ctx, page, errors };
}

// ── Feature 1: Boss Rush ──
async function testBossRush() {
  console.log('\n── Phase 13: Boss Rush ──');
  const { ctx, page, errors } = await setupClean();
  await page.goto(`${BASE}/#/bossrush`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `${OUT}/bossrush-01-index.png` });

  // Find Rookie Rush card (lowest tier first)
  const rookieCard = page.locator('button:has-text("Rookie"), .boss-rush-card:has-text("Rookie")').first();
  if (await rookieCard.count() === 0) {
    flag('Boss Rush', 'fail', `No Rookie Rush card found — try other tier`);
    const startBtn = page.locator('button:has-text("เริ่ม"), button:has-text("Start")').first();
    if (await startBtn.count() > 0) await startBtn.click().catch(() => {});
  } else {
    flag('Boss Rush', 'pass', `Rookie Rush card present`);
    await rookieCard.click().catch(() => {});
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/bossrush-02-active.png` });

  const board = await page.locator('.cg-wrap').count();
  const pieceCount = await page.locator('.cg-wrap piece').count();
  flag('Boss Rush', board > 0 && pieceCount >= 16 ? 'pass' : 'partial',
    `Active run: board=${board}, pieces=${pieceCount}`);

  if (errors.length > 0) flag('Boss Rush', 'partial', `${errors.length} console errors: ${errors[0]?.slice(0, 100)}`);
  await ctx.close();
}

// ── Feature 2: Survive ──
async function testSurvive() {
  console.log('\n── Phase 18: Survive ──');
  const { ctx, page, errors } = await setupClean();
  await page.goto(`${BASE}/#/survive`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `${OUT}/survive-01-index.png` });

  const defenseCard = page.locator('button:has-text("defense-"), .survive-card, [class*=defense]').first();
  if (await defenseCard.count() === 0) {
    flag('Survive', 'fail', `No defense card found`);
  } else {
    flag('Survive', 'pass', `Defense card present`);
    await defenseCard.click().catch(() => {});
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/survive-02-active.png` });

  const board = await page.locator('.cg-wrap').count();
  const pieceCount = await page.locator('.cg-wrap piece').count();
  flag('Survive', board > 0 && pieceCount >= 3 ? 'pass' : 'partial',
    `Active run: board=${board}, pieces=${pieceCount}`);

  if (errors.length > 0) flag('Survive', 'partial', `${errors.length} console errors: ${errors[0]?.slice(0, 100)}`);
  await ctx.close();
}

// ── Feature 3: Move Trainer ──
async function testMoveTrainer() {
  console.log('\n── Phase 12C: Move Trainer ──');
  const { ctx, page, errors } = await setupClean();
  await page.goto(`${BASE}/#/movetrainer`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `${OUT}/movetrainer-01-index.png` });

  const openingCard = page.locator('button:has-text("Khun-Pawn"), button:has-text("เบี้ยขุน"), .move-trainer-card, [class*=opening]').first();
  if (await openingCard.count() === 0) {
    flag('Move Trainer', 'fail', `No opening card found`);
  } else {
    flag('Move Trainer', 'pass', `Opening cards present`);
    await openingCard.click().catch(() => {});
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/movetrainer-02-active.png` });

  const board = await page.locator('.cg-wrap').count();
  flag('Move Trainer', board > 0 ? 'pass' : 'partial', `Board after click: ${board}`);

  if (errors.length > 0) flag('Move Trainer', 'partial', `${errors.length} console errors: ${errors[0]?.slice(0, 100)}`);
  await ctx.close();
}

// ── Feature 4: Pattern Recognition ──
async function testPattern() {
  console.log('\n── Phase 17: Pattern Recognition ──');
  const { ctx, page, errors } = await setupClean();
  await page.goto(`${BASE}/#/pattern`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: `${OUT}/pattern-01-initial.png` });

  // Trigger start
  const startBtn = page.locator('button:has-text("เริ่ม"), button:has-text("Start"), button:has-text("เล่น")').first();
  if (await startBtn.count() > 0) {
    flag('Pattern Recognition', 'pass', `Start button found`);
    await startBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/pattern-02-showing.png` });

    // The board flashes for 3 seconds — wait for it to hide
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/pattern-03-hidden.png` });

    // Look for multiple-choice answers
    const choices = await page.locator('button:has-text("ตัวขาว"), button:has-text("ตัวดำ"), [class*=answer], [class*=choice]').count();
    flag('Pattern Recognition', choices > 0 ? 'pass' : 'partial', `MC answers visible: ${choices}`);
  } else {
    flag('Pattern Recognition', 'fail', `No start button found`);
  }

  if (errors.length > 0) flag('Pattern Recognition', 'partial', `${errors.length} console errors: ${errors[0]?.slice(0, 100)}`);
  await ctx.close();
}

// ── Feature 5: Counting Drill ──
async function testCounting() {
  console.log('\n── Counting Drill ──');
  const { ctx, page, errors } = await setupClean();
  await page.goto(`${BASE}/#/counting`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `${OUT}/counting-01-index.png` });

  const levelCard = page.locator('button:has-text("ระดับ"), .counting-card, button:has-text("เริ่ม")').first();
  if (await levelCard.count() === 0) {
    flag('Counting Drill', 'fail', `No level card found`);
  } else {
    flag('Counting Drill', 'pass', `Level card present`);
    await levelCard.click().catch(() => {});
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/counting-02-active.png` });

  const board = await page.locator('.cg-wrap').count();
  flag('Counting Drill', board > 0 ? 'pass' : 'partial', `Board after click: ${board}`);

  if (errors.length > 0) flag('Counting Drill', 'partial', `${errors.length} console errors: ${errors[0]?.slice(0, 100)}`);
  await ctx.close();
}

// ── Feature 6: Profile (multi-phase additions) ──
async function testProfile() {
  console.log('\n── Profile (Phase 12A title, 14 mastery, 16 cosmetics) ──');
  const { ctx, page, errors } = await setupClean();
  await page.goto(`${BASE}/#/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `${OUT}/profile-01-top.png`, fullPage: false });

  const content = await page.evaluate(() => ({
    titleSystem: !!document.body.textContent.match(/ขุนทอง|ผู้เล่น|มาสเตอร์|เด็กฝึก/),
    streak: !!document.body.textContent.match(/streak|วันติดต่อกัน|longest/i),
    achievements: !!document.body.textContent.match(/ความสำเร็จ|เริ่มต้น|นักแก้/),
    journey: !!document.body.textContent.match(/journey|🛤|ระดับ|checkpoint/i),
    tournaments: !!document.body.textContent.match(/tournament|🏆|Sunday Showdown|multiplier/i),
    signals: !!document.body.textContent.match(/activity|📊|วันนี้|เกมล่าสุด/i),
    rivalryBanner: !!document.body.textContent.match(/rival|TodayStrip/i),
    mastery: !!document.body.textContent.match(/mastery|ทักษะ|opening|tactic|endgame/i),
  }));

  flag('Profile', content.titleSystem ? 'pass' : 'partial', `Title system text: ${content.titleSystem}`);
  flag('Profile', content.streak ? 'pass' : 'partial', `Streak block: ${content.streak}`);
  flag('Profile', content.achievements ? 'pass' : 'partial', `Achievements/badges: ${content.achievements}`);
  flag('Profile', content.journey ? 'pass' : 'partial', `Journey ladder: ${content.journey}`);
  flag('Profile', content.tournaments ? 'pass' : 'partial', `Tournaments section: ${content.tournaments}`);
  flag('Profile', content.signals ? 'pass' : 'partial', `Activity signals: ${content.signals}`);

  // Full-page screenshot to capture below-fold sections
  await page.screenshot({ path: `${OUT}/profile-02-full.png`, fullPage: true });

  if (errors.length > 0) flag('Profile', 'partial', `${errors.length} console errors`);
  await ctx.close();
}

await testBossRush();
await testSurvive();
await testMoveTrainer();
await testPattern();
await testCounting();
await testProfile();

await browser.close();

console.log(`\n=== Summary ===`);
const pass = findings.filter((f) => f.severity === 'pass').length;
const partial = findings.filter((f) => f.severity === 'partial').length;
const fail = findings.filter((f) => f.severity === 'fail').length;
console.log(`  ✅ PASS:    ${pass}`);
console.log(`  🟡 PARTIAL: ${partial}`);
console.log(`  🔴 FAIL:    ${fail}`);
console.log(`\nScreenshots: ${OUT}/`);
