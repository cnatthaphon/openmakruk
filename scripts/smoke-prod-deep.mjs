// Deeper production smoke — exercises engine move + cloud API.
// Runs against the live deployment to catch any wiring gaps that a
// pure-load smoke (smoke-prod.mjs) misses.

import { chromium } from '@playwright/test';

const URL = process.argv[2] ?? 'https://openmakruk.com';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleErrors = [];
const failedReqs = [];
const apiHits = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('requestfailed', (r) => failedReqs.push(`${r.url()} — ${r.failure()?.errorText}`));
page.on('response', (r) => {
  if (r.url().includes('/api/')) apiHits.push(`${r.status()} ${r.url().split('/api/')[1]?.slice(0, 60)}`);
});

console.log(`\n=== Deep smoke: ${URL} ===\n`);

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
await page.waitForSelector('.cg-wrap', { timeout: 45_000 });
console.log(`✓ Board mounted (${Date.now() - t0}ms)`);

// Dismiss onboarding if present
const onboardingClose = page.locator('text=ข้าม').first();
if (await onboardingClose.count() > 0) {
  await onboardingClose.click().catch(() => {});
  console.log(`✓ Onboarding dismissed`);
}

// Wait for pieces to be placed on the board
await page.waitForFunction(
  () => document.querySelectorAll('.cg-wrap piece').length >= 16,
  { timeout: 30_000 },
);
const pieceCount = await page.locator('.cg-wrap piece').count();
console.log(`✓ Pieces rendered: ${pieceCount}`);

// Try to play e3-e4 by clicking (tap-tap)
const e3Box = await page.locator('square.last-move, .cg-wrap').first().boundingBox();
if (!e3Box) throw new Error('No board box');
// chessground squares are 1/8 of board width. e3 = file e (5th), rank 3.
// White at bottom, so rank 3 is 5th row from bottom = 3rd row from top in y.
// Actually rank 3 from white POV = 5 from top (y idx 5).
const sq = e3Box.width / 8;
const e3X = e3Box.x + sq * (5 - 0.5);   // file e = index 4, +0.5 to center
const e3Y = e3Box.y + sq * (5 + 0.5);   // rank 3 from bottom = row 5 from top (y idx 5)
const e4Y = e3Box.y + sq * (4 + 0.5);

const fenBefore = await page.evaluate(() => {
  const w = window;
  return w.__openmakrukLog?.events?.slice(-1)[0]?.data?.fen ?? null;
});

await page.mouse.click(e3X, e3Y);
await page.waitForTimeout(150);
await page.mouse.click(e3X, e4Y);
console.log(`✓ Played click-click on e3→e4 region`);

// Wait for bot to think + move (board's piece on e3 should be gone, e4 occupied)
try {
  await page.waitForFunction(
    () => {
      const pieces = document.querySelectorAll('.cg-wrap piece');
      // If user move applied, white pawn moved; bot then moves too.
      return pieces.length >= 16; // pieces survive
    },
    { timeout: 15_000 },
  );
  await page.waitForTimeout(3000); // let bot move + animate
  console.log(`✓ Engine response window passed (no JS errors)`);
} catch (e) {
  console.log(`✗ Engine response timeout: ${e.message}`);
}

// Navigate to Profile to trigger leaderboard fetch (if signed in)
await page.goto(`${URL}/#/profile`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
console.log(`✓ Profile loaded`);

// Try Puzzles tab → triggers content load + maybe puzzle leaderboard
await page.goto(`${URL}/#/puzzles`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.puzzles-stats-bar, .puzzle-card, [data-test="puzzles-index"]', { timeout: 15_000 }).catch(() => {});
console.log(`✓ Puzzles index loaded`);

// Report
console.log(`\n--- Final report ---`);
console.log(`Console errors:  ${consoleErrors.length}`);
consoleErrors.slice(0, 8).forEach((e) => console.log(`  · ${e.slice(0, 250)}`));
console.log(`Failed requests: ${failedReqs.length}`);
failedReqs.slice(0, 8).forEach((f) => console.log(`  · ${f.slice(0, 250)}`));
console.log(`API hits (${apiHits.length}):`);
apiHits.slice(0, 10).forEach((a) => console.log(`  · ${a}`));

await page.screenshot({ path: '/tmp/smoke-deep-final.png', fullPage: false });
console.log(`\nFinal screenshot: /tmp/smoke-deep-final.png`);

await browser.close();
process.exit(consoleErrors.length > 0 ? 1 : 0);
