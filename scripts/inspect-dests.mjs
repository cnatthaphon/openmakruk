import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('openmakruk_onboarded','1'); } catch { /* ignore */ } });
await page.goto('https://www.openmakruk.com/#/play', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cg-wrap');
await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20000 });

// Click a white bia at e3 (should show legal dests)
const box = await page.locator('.cg-wrap').first().boundingBox();
const s = box.width / 8;
const e3x = box.x + s * 4.5, e3y = box.y + s * 5.5;
await page.mouse.click(e3x, e3y);
await page.waitForTimeout(400);

// Inspect what appeared
const info = await page.evaluate(() => {
  const cgWrap = document.querySelector('.cg-wrap');
  const cgBoard = document.querySelector('cg-board');
  // chessground renders dests as <square class="move-dest"> overlays
  const allSquareClasses = new Set();
  document.querySelectorAll('cg-board square').forEach(sq => allSquareClasses.add(sq.className));
  // selected piece marker
  const selected = document.querySelectorAll('.selected, square.selected').length;
  const moveDest = document.querySelectorAll('.move-dest, square.move-dest').length;
  return {
    squareClasses: Array.from(allSquareClasses),
    selected,
    moveDest,
    cgBoardHTML: cgBoard ? cgBoard.outerHTML.slice(0, 800) : 'no cg-board',
  };
});
console.log('Square classes seen:', JSON.stringify(info.squareClasses));
console.log('selected count:', info.selected);
console.log('move-dest count:', info.moveDest);
console.log('cg-board HTML sample:', info.cgBoardHTML);
await browser.close();
