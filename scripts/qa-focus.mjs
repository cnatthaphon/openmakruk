import { chromium } from '@playwright/test';

const BASE = 'https://www.openmakruk.com';
const browser = await chromium.launch();

// ─── FOCUS 1: mate-001 board rendering ─────────────────────
console.log('=== FOCUS 1: mate-001 puzzle ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`PE: ${e.message}`));

  await page.goto(`${BASE}/#/puzzles/mate-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // generous wait

  const boardCount = await page.locator('.cg-wrap').count();
  const pieceCount = await page.locator('.cg-wrap piece').count();
  const puzzleHeader = await page.locator('.puzzle-header').count();
  const errorBoundary = await page.locator('.error-boundary').count();

  console.log(`  Board: ${boardCount}, Pieces: ${pieceCount}, Header: ${puzzleHeader}, Boundary: ${errorBoundary}`);
  console.log(`  Console errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log(`    · ${e.slice(0, 200)}`));

  await page.screenshot({ path: '/tmp/focus-mate001.png', fullPage: false });
  console.log(`  Screenshot: /tmp/focus-mate001.png`);

  // Also try mate-002 for comparison
  await page.goto(`${BASE}/#/puzzles/mate-002`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const board2 = await page.locator('.cg-wrap').count();
  const pieces2 = await page.locator('.cg-wrap piece').count();
  console.log(`  mate-002 — Board: ${board2}, Pieces: ${pieces2}`);

  await ctx.close();
}

// ─── FOCUS 2: Resign button after 1 move ─────────────────
console.log('\n=== FOCUS 2: Resign button visibility ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/play`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cg-wrap');
  const dismiss = page.locator('button:has-text("ข้าม"), button:has-text("ต่อไป")').first();
  if (await dismiss.count() > 0) await dismiss.click().catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20_000 });

  // Print initial state
  const initState = await page.evaluate(() => {
    return {
      buttonCount: document.querySelectorAll('button').length,
      resignClass: document.querySelectorAll('.resign-button').length,
      drawClass: document.querySelectorAll('.draw-button').length,
      allButtons: Array.from(document.querySelectorAll('button')).map((b) => ({
        cls: b.className,
        text: b.textContent?.trim().slice(0, 30),
        title: b.title?.slice(0, 30),
      })).filter((b) => b.title?.includes('ยอม') || b.title?.includes('เสมอ') || b.cls.includes('resign') || b.cls.includes('draw') || b.text?.includes('ยอม') || b.text?.includes('เสมอ')),
    };
  });
  console.log(`  Before move — buttons: ${initState.buttonCount}, resign-class: ${initState.resignClass}, draw-class: ${initState.drawClass}`);
  console.log(`  Resign/draw matches before move:`, JSON.stringify(initState.allButtons, null, 2));

  // Play e3-e4
  const box = await page.locator('.cg-wrap').first().boundingBox();
  const sq = box.width / 8;
  await page.mouse.click(box.x + sq * 4.5, box.y + sq * 5.5); // e3
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + sq * 4.5, box.y + sq * 4.5); // e4
  await page.waitForTimeout(4000); // wait for bot reply

  const afterState = await page.evaluate(() => {
    return {
      historyLength: (window.__openmakrukLog?.events || []).filter((e) => e.step === 'engine.search.start').length,
      resignClass: document.querySelectorAll('.resign-button').length,
      drawClass: document.querySelectorAll('.draw-button').length,
      resignVisible: Array.from(document.querySelectorAll('.resign-button')).map((b) => {
        const r = b.getBoundingClientRect();
        return { width: r.width, height: r.height, visible: r.width > 0 && r.height > 0 };
      }),
      allButtons: Array.from(document.querySelectorAll('button')).filter((b) =>
        b.className.includes('resign') || b.className.includes('draw') ||
        b.textContent?.includes('ยอม') || b.textContent?.includes('เสมอ')
      ).map((b) => ({ cls: b.className, text: b.textContent?.trim().slice(0, 40), visible: b.getBoundingClientRect().width > 0 })),
    };
  });
  console.log(`\n  After move — resign-class: ${afterState.resignClass}, draw-class: ${afterState.drawClass}`);
  console.log(`  Engine search starts logged: ${afterState.historyLength}`);
  console.log(`  Resign/draw matches after move:`, JSON.stringify(afterState.allButtons, null, 2));
  if (afterState.resignVisible.length > 0) {
    console.log(`  Resign element rects:`, JSON.stringify(afterState.resignVisible, null, 2));
  }

  await page.screenshot({ path: '/tmp/focus-resign.png' });
  console.log(`  Screenshot: /tmp/focus-resign.png`);

  await ctx.close();
}

await browser.close();
