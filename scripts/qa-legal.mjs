// Retest human-vs-bot using LEGAL moves read from game state (not hardcoded).
import { chromium } from '@playwright/test';

const BASE = 'https://www.openmakruk.com';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
await page.addInitScript(() => { try { localStorage.setItem('openmakruk_onboarded','1'); } catch {} });

await page.goto(`${BASE}/#/play`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cg-wrap', { timeout: 30_000 });
await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20_000 });

// Set easy
for (const sel of await page.locator('select').all()) {
  const opts = await sel.evaluate((el) => Array.from(el.options).map((o) => o.value));
  if (opts.includes('easy')) { await sel.selectOption('easy'); break; }
}

async function getLegalMoves(page) {
  // legalMoves are surfaced via the log or the board's dests. Try log first.
  return page.evaluate(() => {
    const log = window.__openmakrukLog?.events ?? [];
    for (let i = log.length - 1; i >= 0; i--) {
      if (Array.isArray(log[i].data?.legalMoves)) return log[i].data.legalMoves;
    }
    return null;
  });
}

async function readSearches(page) {
  return page.evaluate(() => (window.__openmakrukLog?.events ?? []).filter((e) => e.step === 'engine.search.start').length);
}

async function squareCoords(page, square) {
  const box = await page.locator('.cg-wrap').first().boundingBox();
  const f = square.charCodeAt(0) - 97, r = parseInt(square[1], 10), s = box.width / 8;
  return { x: box.x + s * (f + 0.5), y: box.y + s * (8 - r + 0.5) };
}

let userMovesMade = 0, botReplies = 0, illegalAttempts = 0, hangs = 0, maxMs = 0;

for (let turn = 0; turn < 15; turn++) {
  // Game over?
  if (await page.locator('.game-over-overlay').count() > 0) { console.log('  Game ended.'); break; }

  const legal = await getLegalMoves(page);
  if (!legal || legal.length === 0) {
    console.log(`  Turn ${turn}: no legal moves available in log (maybe not user turn)`);
    await page.waitForTimeout(1500);
    continue;
  }

  // Pick a bia push if available (always safe), else first legal
  const move = legal.find((m) => /^[a-h][23][a-h][34]$/.test(m)) || legal[0];
  const from = move.slice(0, 2), to = move.slice(2, 4);

  const before = await readSearches(page);
  const fc = await squareCoords(page, from);
  const tc = await squareCoords(page, to);
  await page.mouse.click(fc.x, fc.y);
  await page.waitForTimeout(150);
  await page.mouse.click(tc.x, tc.y);
  userMovesMade++;

  const t0 = Date.now();
  let replied = false;
  while (Date.now() - t0 < 15_000) {
    await page.waitForTimeout(400);
    if (await readSearches(page) > before) { replied = true; break; }
    if (await page.locator('.game-over-overlay').count() > 0) { replied = true; break; }
  }
  const ms = Date.now() - t0;
  if (replied) { botReplies++; maxMs = Math.max(maxMs, ms); }
  else { hangs++; console.log(`  Turn ${turn}: move ${move} → NO bot reply in 15s`); }

  process.stdout.write(`\r  Turn ${turn+1}: played ${move}, bot replied=${replied} (${ms}ms)        `);
}
console.log('');

console.log(`\nResults:`);
console.log(`  User moves made:  ${userMovesMade}`);
console.log(`  Bot replies:      ${botReplies}`);
console.log(`  Hangs:            ${hangs}`);
console.log(`  Max reply time:   ${maxMs}ms`);
console.log(`  Console errors:   ${errors.length}`);
console.log(`  Reply rate:       ${userMovesMade > 0 ? (100*botReplies/userMovesMade).toFixed(0) : 0}%`);

await page.screenshot({ path: '/tmp/qa-legal-end.png' });
await browser.close();
