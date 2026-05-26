// Smoke test for Phase 12-18 new features.
// Visit each new route, verify no crash + key elements render + capture screenshot.

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://www.openmakruk.com';
const OUT = '/tmp/qa-new-features';
await mkdir(OUT, { recursive: true });

const findings = [];
function flag(route, kind, message, severity = 'medium') {
  findings.push({ route, kind, message, severity });
  const icon = severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : 'ℹ️';
  console.log(`    ${icon} ${kind}: ${message}`);
}

const ROUTES = [
  { id: 'movetrainer', path: '/#/movetrainer', phase: '12C', name: 'Move Trainer' },
  { id: 'bossrush',    path: '/#/bossrush',    phase: '13',  name: 'Boss Rush' },
  { id: 'survive',     path: '/#/survive',     phase: '18',  name: 'Survive' },
  { id: 'pattern',     path: '/#/pattern',     phase: '17',  name: 'Pattern Recognition' },
  { id: 'counting',    path: '/#/counting',    phase: '?',   name: 'Counting Drill' },
  { id: 'rush',        path: '/#/rush',        phase: '?',   name: 'Puzzle Rush' },
  { id: 'exhibition',  path: '/#/exhibition',  phase: '15',  name: 'Master Games' },
  { id: 'bots',        path: '/#/bots',        phase: '9H-2', name: 'Bot Detail Index' },
  { id: 'profile',     path: '/#/profile',     phase: '12+14+16', name: 'Profile (multi-phase additions)' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push({ at: page.url(), msg: m.text() }); });
page.on('pageerror', (e) => errors.push({ at: page.url(), msg: `PAGE: ${e.message}` }));

// Dismiss onboarding once at root
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
const dismiss = page.locator('button:has-text("ข้าม"), button:has-text("ต่อไป")').first();
if (await dismiss.count() > 0) {
  await dismiss.click().catch(() => {});
  await page.waitForTimeout(500);
}

for (const r of ROUTES) {
  console.log(`\n── Phase ${r.phase}: ${r.name} (${r.path}) ──`);
  const errBefore = errors.length;

  try {
    await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(2500);

    const boundary = await page.locator('.error-boundary').count();
    if (boundary > 0) {
      flag(r.path, 'error-boundary', `${r.name} crashed → error boundary`, 'high');
    } else {
      const content = await page.evaluate(() => ({
        bodyText: document.body.innerText.slice(0, 200),
        hasMain: document.querySelector('main, [class*=page]')?.tagName,
        h1Count: document.querySelectorAll('h1').length,
        buttonCount: document.querySelectorAll('button').length,
      }));
      if (content.bodyText.length < 40) {
        flag(r.path, 'empty-content', `Body text very short (${content.bodyText.length} chars) — page may not have rendered content`, 'medium');
      } else {
        flag(r.path, 'rendered', `text="${content.bodyText.slice(0, 80).replace(/\n/g, ' ')}…" buttons=${content.buttonCount}`, 'low');
      }
    }

    // Capture screenshot
    const file = `${OUT}/${r.id}.png`;
    await page.screenshot({ path: file });

    // Errors during this route
    const routeErrors = errors.slice(errBefore);
    if (routeErrors.length > 0) {
      for (const e of routeErrors.slice(0, 2)) flag(r.path, 'console-error', e.msg.slice(0, 150), 'medium');
    }
  } catch (e) {
    flag(r.path, 'navigation-failed', e.message.slice(0, 200), 'high');
  }
}

await browser.close();

console.log(`\n=== Summary ===`);
const high = findings.filter((f) => f.severity === 'high').length;
const medium = findings.filter((f) => f.severity === 'medium').length;
const low = findings.filter((f) => f.severity === 'low').length;
console.log(`  🔴 HIGH: ${high}`);
console.log(`  🟡 MEDIUM: ${medium}`);
console.log(`  ℹ️ LOW (rendered): ${low}`);
console.log(`\nScreenshots: ${OUT}/`);

await writeFile(`${OUT}/report.json`, JSON.stringify(findings, null, 2));
