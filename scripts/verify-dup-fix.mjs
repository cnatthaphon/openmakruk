import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('openmakruk_onboarded','1'); } catch { /* ignore */ } });
await page.goto('http://localhost:4178/#/play', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cg-wrap', { timeout: 30000 });
await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 30000 });
const box = await page.locator('.cg-wrap').first().boundingBox();
const S = box.width/8;
await page.mouse.click(box.x+S*4.5, box.y+S*5.5);
await page.waitForTimeout(150);
await page.mouse.click(box.x+S*4.5, box.y+S*4.5);
await page.waitForTimeout(2500);

// default tab
let r1 = await page.locator('button:visible:has-text("ยอมแพ้")').count();
let d1 = await page.locator('button:visible:has-text("ขอเสมอ")').count();
console.log(`Default tab — ยอมแพ้:${r1} ขอเสมอ:${d1}`);

// moves tab
const mt = page.locator('.sidebar-tab', { hasText: 'ตาเดิน' }).first();
if (await mt.count() > 0) {
  await mt.click();
  await page.waitForTimeout(600);
  let r2 = await page.locator('button:visible:has-text("ยอมแพ้")').count();
  let d2 = await page.locator('button:visible:has-text("ขอเสมอ")').count();
  console.log(`Moves tab   — ยอมแพ้:${r2} ขอเสมอ:${d2}  ${r2===1&&d2===1?'✅ NO DUPLICATE':'🔴 still dup'}`);
}
await browser.close();
