// Targeted re-test: verify what's actually in the DOM
import { chromium } from '@playwright/test';

const BASE = 'https://www.openmakruk.com';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/#/play`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cg-wrap');
const dismiss = page.locator('button:has-text("ข้าม"), button:has-text("ต่อไป")').first();
if (await dismiss.count() > 0) await dismiss.click().catch(() => {});
await page.waitForTimeout(1500);

// Direct class selector for resign
const resignByClass = await page.locator('.resign-button').count();
const resignByText = await page.locator('button:has-text("ยอมแพ้")').count();
const resignByEmoji = await page.locator('button:has-text("🏳")').count();
const resignByTitle = await page.locator('button[title*="ยอมแพ้"]').count();
const drawByClass = await page.locator('.draw-button, button[title*="เสมอ"]').count();

console.log('Resign discovery:');
console.log(`  .resign-button class      → ${resignByClass}`);
console.log(`  button:has-text("ยอมแพ้") → ${resignByText}`);
console.log(`  button:has-text("🏳")     → ${resignByEmoji}`);
console.log(`  button[title*="ยอมแพ้"]   → ${resignByTitle}`);
console.log(`  Draw button               → ${drawByClass}`);

if (resignByClass > 0) {
  const visible = await page.locator('.resign-button').first().isVisible();
  const text = await page.locator('.resign-button').first().textContent();
  const box = await page.locator('.resign-button').first().boundingBox();
  console.log(`\nResign button details:`);
  console.log(`  visible: ${visible}`);
  console.log(`  text: "${text}"`);
  console.log(`  position: ${JSON.stringify(box)}`);
}

// A11y audit via DOM evaluation (since page.accessibility not in this Playwright)
const a11y = await page.evaluate(() => {
  const lang = document.documentElement.lang;
  const landmarks = document.querySelectorAll('nav, main, header, footer, [role="navigation"], [role="main"]').length;
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
  const buttons = document.querySelectorAll('button').length;
  const buttonsNoText = Array.from(document.querySelectorAll('button')).filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label')).length;
  const ariaLabels = document.querySelectorAll('[aria-label]').length;
  const focusable = document.querySelectorAll('button:not([disabled]), a[href], select, input, textarea, [tabindex]:not([tabindex="-1"])').length;
  return { lang, landmarks, headings, buttons, buttonsNoText, ariaLabels, focusable };
});
console.log('\nA11y snapshot:', JSON.stringify(a11y, null, 2));

// Resource sizing via actual response bodies (since content-length is unreliable)
console.log('\nFetching key assets for accurate sizes:');
const assets = ['/ffish.wasm', '/engine/stockfish.wasm', '/engine/stockfish.js', '/og.png'];
for (const path of assets) {
  const r = await fetch(`${BASE}${path}`);
  const buf = await r.arrayBuffer();
  console.log(`  ${path} → ${(buf.byteLength / 1024).toFixed(0)} KB`);
}

await page.screenshot({ path: '/tmp/qa-play-state.png', fullPage: false });
await browser.close();
