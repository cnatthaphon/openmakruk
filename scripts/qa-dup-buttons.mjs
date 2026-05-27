// Hunt duplicate + dead + non-functional buttons across all routes.
// Duplicate = same visible label rendered 2+ times simultaneously.
// Dead = button with no onClick / no observable effect.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = 'https://www.openmakruk.com';
const OUT = '/tmp/qa-dup';
await mkdir(OUT, { recursive: true });

const findings = [];
function rec(where, severity, msg) {
  findings.push({ where, severity, msg });
  const icon = severity === 'dup' ? '🔁' : severity === 'dead' ? '💀' : severity === 'info' ? 'ℹ️' : '🟡';
  console.log(`  ${icon} [${where}] ${msg}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('openmakruk_onboarded','1'); } catch {} });

// Collect visible buttons + their text + whether they have a click handler
async function scanButtons(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };
    const btns = Array.from(document.querySelectorAll('button')).filter(vis);
    return btns.map((b) => {
      // normalize label: text content + aria-label + title
      const label = (b.textContent || '').replace(/\s+/g, ' ').trim()
        || b.getAttribute('aria-label') || b.title || '(no label)';
      // React attaches onClick via synthetic events — can't read directly.
      // Heuristic for "dead": disabled, OR no onclick attr AND no
      // React fiber handler. We detect React handlers via the presence
      // of __reactProps$ keys with onClick.
      let hasReactClick = false;
      for (const key of Object.keys(b)) {
        if (key.startsWith('__reactProps$')) {
          const props = b[key];
          if (props && typeof props.onClick === 'function') hasReactClick = true;
        }
      }
      return {
        label: label.slice(0, 40),
        disabled: b.disabled,
        hasOnClick: hasReactClick || !!b.onclick,
        cls: b.className.slice(0, 40),
      };
    });
  });
}

async function dismissOverlay(page) {
  const d = page.locator('button:has-text("ข้าม"), button:has-text("ต่อไป")').first();
  if (await d.count() > 0) { await d.click().catch(() => {}); await page.waitForTimeout(300); }
}

const routes = ['play','learn','study','puzzles','custom','library','profile','settings','about',
                'stats','challenge','counting','rush','exhibition','movetrainer','bossrush','pattern','survive','bots'];

for (const r of routes) {
  await page.goto(`${BASE}/#/${r}`, { waitUntil: 'domcontentloaded' });
  await dismissOverlay(page);
  await page.waitForTimeout(1800);

  const btns = await scanButtons(page);

  // Duplicates: same label visible 2+ times
  const byLabel = {};
  for (const b of btns) {
    if (b.label === '(no label)' || b.label.length < 2) continue;
    byLabel[b.label] = byLabel[b.label] || [];
    byLabel[b.label].push(b);
  }
  for (const [label, group] of Object.entries(byLabel)) {
    if (group.length >= 2) {
      // ignore known-legit repeats (list items, move log entries, board squares)
      if (/^\d+$|^[a-h][1-8]$|^[♔-♟]$/.test(label)) continue;
      rec(r, 'dup', `"${label}" ×${group.length} (classes: ${group.map((g) => g.cls.split(' ')[0]).join(', ')})`);
    }
  }

  // Dead buttons: not disabled but no onClick handler
  const dead = btns.filter((b) => !b.disabled && !b.hasOnClick && b.label !== '(no label)');
  for (const d of dead.slice(0, 5)) {
    rec(r, 'dead', `"${d.label}" no onClick (class: ${d.cls.split(' ')[0]})`);
  }
}

// SPECIAL: Play page after a move + switching to moves sub-tab
console.log('\n── Special: Play page resign/draw after move + moves tab ──');
await page.goto(`${BASE}/#/play`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cg-wrap', { timeout: 20_000 });
await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20_000 });
// play e3-e4
const box = await page.locator('.cg-wrap').first().boundingBox();
const S = box.width / 8;
await page.mouse.click(box.x + S*4.5, box.y + S*5.5);
await page.waitForTimeout(150);
await page.mouse.click(box.x + S*4.5, box.y + S*4.5);
await page.waitForTimeout(3500);

// default tab
let resignVisible = await page.locator('.play-quick-resign:visible, .resign-button:visible').count();
let drawVisible = await page.locator('.play-quick-draw:visible, .draw-button:visible, button:visible:has-text("ขอเสมอ")').count();
rec('play[default-tab]', resignVisible >= 2 ? 'dup' : 'info', `resign buttons visible: ${resignVisible}`);
rec('play[default-tab]', 'info', `draw buttons visible: ${drawVisible}`);

// switch to moves sub-tab
const movesTab = page.locator('.sidebar-tab', { hasText: 'ตาเดิน' }).first();
if (await movesTab.count() > 0) {
  await movesTab.click();
  await page.waitForTimeout(600);
  resignVisible = await page.locator('button:visible:has-text("ยอมแพ้")').count();
  drawVisible = await page.locator('button:visible:has-text("ขอเสมอ")').count();
  rec('play[moves-tab]', resignVisible >= 2 ? 'dup' : 'info', `"ยอมแพ้" buttons visible: ${resignVisible}`);
  rec('play[moves-tab]', drawVisible >= 2 ? 'dup' : 'info', `"ขอเสมอ" buttons visible: ${drawVisible}`);
  await page.screenshot({ path: `${OUT}/play-moves-tab.png` });
}

await browser.close();

console.log(`\n=== Summary ===`);
const dups = findings.filter((f) => f.severity === 'dup').length;
const dead = findings.filter((f) => f.severity === 'dead').length;
console.log(`  🔁 Duplicate-button findings: ${dups}`);
console.log(`  💀 Dead-button findings: ${dead}`);
console.log(`\nScreenshots: ${OUT}/`);
