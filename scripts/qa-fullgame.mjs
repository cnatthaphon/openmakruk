// Full human-vs-bot game to completion — drives legal moves by reading
// chessground's own .move-dest markers (the board only highlights LEGAL
// destinations, so every move we play is guaranteed legal).
//
// This closes the gap the earlier harness couldn't: a complete
// interactive game from start to a natural terminal state, as a real
// user would experience it.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = 'https://www.openmakruk.com';
const OUT = '/tmp/qa-fullgame';
await mkdir(OUT, { recursive: true });
const difficulty = process.argv[2] ?? 'easy';

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

// Set difficulty
for (const sel of await page.locator('select').all()) {
  const opts = await sel.evaluate((el) => Array.from(el.options).map((o) => o.value));
  if (opts.includes(difficulty)) { await sel.selectOption(difficulty); break; }
}
console.log(`Difficulty: ${difficulty}`);

const boardBox = await page.locator('.cg-wrap').first().boundingBox();
const S = boardBox.width / 8;

// Read board state: my (white) pieces + (after selecting) legal dests.
// chessground white orientation: x=0→a, y=0→rank8.
function pxToSquare(x, y) {
  const file = Math.round(x / S);
  const rank = 8 - Math.round(y / S);
  return { file, rank, name: String.fromCharCode(97 + file) + rank };
}

async function getWhitePieces() {
  return page.evaluate((sz) => {
    const out = [];
    document.querySelectorAll('cg-board piece.white').forEach((p) => {
      const m = /translate\((\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)px\)/.exec(p.style.transform || '');
      if (m) out.push({ x: parseFloat(m[1]), y: parseFloat(m[2]), role: p.className });
    });
    return out;
  }, S);
}

async function getDests() {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('cg-board square.move-dest').forEach((sq) => {
      const m = /translate\((\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)px\)/.exec(sq.style.transform || '');
      if (m) out.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
    });
    return out;
  });
}

async function searchCount() {
  return page.evaluate(() => (window.__openmakrukLog?.events ?? []).filter((e) => e.step === 'engine.search.start').length);
}

async function isGameOver() {
  return (await page.locator('.game-over-overlay, [class*=game-over]').count()) > 0;
}

// Play one legal white move. Returns the move string or null if none found.
async function playLegalMove() {
  const pieces = await getWhitePieces();
  // Shuffle pieces so we don't always move the same one (avoids repetition draws fast)
  pieces.sort(() => Math.random() - 0.5);

  for (const piece of pieces) {
    const cx = boardBox.x + piece.x + S / 2;
    const cy = boardBox.y + piece.y + S / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(120);
    const dests = await getDests();
    if (dests.length === 0) {
      // deselect and try next piece
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(50);
      continue;
    }
    // Prefer a capturing/advancing dest: pick the one with lowest y (most advanced toward rank8)
    dests.sort((a, b) => a.y - b.y);
    const dest = dests[Math.floor(Math.random() * Math.min(3, dests.length))]; // random among top 3 advances
    const from = pxToSquare(piece.x, piece.y).name;
    const to = pxToSquare(dest.x, dest.y).name;
    await page.mouse.click(boardBox.x + dest.x + S / 2, boardBox.y + dest.y + S / 2);
    return `${from}${to}`;
  }
  return null;
}

console.log('\nStarting full game (white = automated legal moves, black = bot)...\n');
let myMoves = 0, botReplies = 0, noMoveFound = 0, maxBotMs = 0, gameResult = null;
const tStart = Date.now();

for (let turn = 0; turn < 120; turn++) {
  if (await isGameOver()) break;
  if (Date.now() - tStart > 240_000) { console.log('  (4min cap reached)'); break; }

  const before = await searchCount();
  const move = await playLegalMove();
  if (!move) {
    noMoveFound++;
    // Could be game over (no legal moves = checkmate/stalemate) — check
    await page.waitForTimeout(500);
    if (await isGameOver()) break;
    if (noMoveFound > 3) { console.log('  No legal move found 3x — stopping'); break; }
    continue;
  }
  myMoves++;

  // Wait for bot reply or game over
  const t0 = Date.now();
  let replied = false;
  while (Date.now() - t0 < 20_000) {
    await page.waitForTimeout(400);
    if (await searchCount() > before) { replied = true; break; }
    if (await isGameOver()) { replied = true; break; }
  }
  const ms = Date.now() - t0;
  if (replied) { botReplies++; maxBotMs = Math.max(maxBotMs, ms); }
  process.stdout.write(`\r  move ${myMoves}: ${move} · bot replied=${replied} (${ms}ms) · errors=${errors.length}    `);
}
console.log('');

// Read final result
if (await isGameOver()) {
  gameResult = (await page.locator('.game-over-overlay, [class*=game-over]').first().innerText().catch(() => '')).slice(0, 100).replace(/\n/g, ' ');
}

await page.screenshot({ path: `${OUT}/fullgame-${difficulty}.png` });

console.log(`\n=== Full game result (${difficulty}) ===`);
console.log(`  My moves played:  ${myMoves}`);
console.log(`  Bot replies:      ${botReplies}`);
console.log(`  Reply rate:       ${myMoves > 0 ? (100*botReplies/myMoves).toFixed(0) : 0}%`);
console.log(`  Max bot reply:    ${maxBotMs}ms`);
console.log(`  Console errors:   ${errors.length}`);
console.log(`  Game over:        ${await isGameOver()}`);
console.log(`  Result:           ${gameResult ?? '(not terminal within cap)'}`);
if (errors.length) errors.slice(0, 5).forEach((e) => console.log(`    · ${e.slice(0, 120)}`));

await browser.close();
