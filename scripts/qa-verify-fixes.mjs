import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

await page.goto('https://www.openmakruk.com/#/play', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cg-wrap');
const dismiss = page.locator('button:has-text("ข้าม"), button:has-text("ต่อไป")').first();
if (await dismiss.count() > 0) await dismiss.click().catch(() => {});
await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20_000 });

const box = await page.locator('.cg-wrap').first().boundingBox();
const sq = box.width / 8;
await page.mouse.click(box.x + sq * 4.5, box.y + sq * 5.5);
await page.waitForTimeout(200);
await page.mouse.click(box.x + sq * 4.5, box.y + sq * 4.5);
await page.waitForTimeout(4000);

// NEW selectors per commit 30069a8
console.log('=== Resign/Draw fix verification ===');
const quickResign = await page.locator('.play-quick-resign').count();
const quickDraw = await page.locator('.play-quick-button').count();
const oldResign = await page.locator('.resign-button').count();
console.log(`  .play-quick-resign: ${quickResign}`);
console.log(`  .play-quick-button (all): ${quickDraw}`);
console.log(`  .resign-button (old sidebar): ${oldResign}`);

if (quickResign > 0) {
  const visible = await page.locator('.play-quick-resign').first().isVisible();
  const box = await page.locator('.play-quick-resign').first().boundingBox();
  console.log(`  visible: ${visible}, box: ${JSON.stringify(box)}`);
}

await page.screenshot({ path: '/tmp/verify-quick-actions.png' });

// Deep link onboarding skip verification
console.log('\n=== Deep link onboarding skip ===');
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page2 = await ctx2.newPage();
await page2.evaluate(() => { try { localStorage.clear(); } catch {} }).catch(() => {});

await page2.goto('https://www.openmakruk.com/#/puzzles/mate-001', { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(3000);
const onboardingShown = await page2.locator('.onboarding-modal, [class*=onboarding]').count();
const boardCount = await page2.locator('.cg-wrap').count();
const pieceCount = await page2.locator('.cg-wrap piece').count();
console.log(`  Onboarding modal on deep link: ${onboardingShown} (expect 0)`);
console.log(`  Board: ${boardCount}, Pieces: ${pieceCount}`);
await page2.screenshot({ path: '/tmp/verify-deeplink.png' });

// Mobile tap targets
console.log('\n=== Mobile tap targets check ===');
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page3 = await ctx3.newPage();
await page3.goto('https://www.openmakruk.com/#/play', { waitUntil: 'domcontentloaded' });
await page3.waitForTimeout(2000);

const elements = await page3.evaluate(() => {
  const interactiveSelectors = '.bottom-nav-tab, .resign-button, .play-quick-resign, .play-quick-button, .draw-button, .play-quick-draw, .onboarding-close, .profile-edit, .tab';
  const els = document.querySelectorAll(interactiveSelectors);
  return Array.from(els).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      cls: el.className,
      text: el.textContent?.trim().slice(0, 25),
      w: Math.round(r.width),
      h: Math.round(r.height),
      meetsAA: r.width >= 44 && r.height >= 44,
    };
  }).filter((e) => e.w > 0);
});
const tinyTouchTargets = elements.filter((e) => !e.meetsAA);
console.log(`  Total interactive elements checked: ${elements.length}`);
console.log(`  Meeting WCAG AA 44x44: ${elements.filter((e) => e.meetsAA).length}`);
console.log(`  Failing AA (<44 in either dim):`, JSON.stringify(tinyTouchTargets, null, 2));

await browser.close();
