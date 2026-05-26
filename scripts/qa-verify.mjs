import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

await page.goto('https://www.openmakruk.com/#/play', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cg-wrap');
const dismiss = page.locator('button:has-text("ข้าม"), button:has-text("ต่อไป")').first();
if (await dismiss.count() > 0) await dismiss.click().catch(() => {});
await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20_000 });

// Click e3-e4
const box = await page.locator('.cg-wrap').first().boundingBox();
const sq = box.width / 8;
await page.mouse.click(box.x + sq * 4.5, box.y + sq * 5.5);
await page.waitForTimeout(200);
await page.mouse.click(box.x + sq * 4.5, box.y + sq * 4.5);
await page.waitForTimeout(4000);

// Initial: 'game' tab — resign should NOT be visible
const r1 = await page.locator('.resign-button').count();
console.log(`Tab 'game' (default) — resign-button count: ${r1}`);

// Click 'moves' sub-tab (ตาเดิน)
const movesTab = page.locator('.sidebar-tab', { hasText: 'ตาเดิน' }).first();
if (await movesTab.count() > 0) {
  await movesTab.click();
  await page.waitForTimeout(500);
  const r2 = await page.locator('.resign-button').count();
  const visible = r2 > 0 ? await page.locator('.resign-button').first().isVisible() : false;
  console.log(`After switching to 'moves' tab — resign-button count: ${r2}, visible: ${visible}`);
  await page.screenshot({ path: '/tmp/verify-resign-in-moves-tab.png' });
} else {
  console.log(`Could not find 'ตาเดิน' sub-tab`);
}

await browser.close();
