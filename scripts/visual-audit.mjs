// Visual polish audit — capture every page × 3 viewports from production.
// Output to /tmp/visual-audit/*.png for review.
//
// Usage:
//   node scripts/visual-audit.mjs [base-url]
//   default base = https://www.openmakruk.com

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'https://www.openmakruk.com';
const OUT = '/tmp/visual-audit';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'mobile',  width: 390,  height: 844 },
];

const ROUTES = [
  { id: 'play',         path: '/#/play',                   wait: '.cg-wrap' },
  { id: 'learn-index',  path: '/#/learn',                  wait: '.lesson-card, .lesson-list, .learn-page' },
  { id: 'lesson-view',  path: '/#/learn/basics-init',      wait: '.lesson-step, .cg-wrap' },
  { id: 'puzzles',      path: '/#/puzzles',                wait: '.puzzle-card, .puzzles-stats-bar' },
  { id: 'puzzle-view',  path: '/#/puzzles/mate-001',       wait: '.puzzle-header, .cg-wrap' },
  { id: 'custom',       path: '/#/custom',                 wait: '.custom-palette, .custom-square' },
  { id: 'library',      path: '/#/library',                wait: '.library-empty, .library-card, .library-page' },
  { id: 'profile',      path: '/#/profile',                wait: '.profile-page, .rating-card' },
  { id: 'settings',     path: '/#/settings',               wait: '.settings-page, .setting-row' },
  { id: 'about',        path: '/#/about',                  wait: '.about-page' },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

const issues = [];

for (const vp of VIEWPORTS) {
  console.log(`\n=== Viewport: ${vp.name} (${vp.width}×${vp.height}) ===`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();

  // Visit root once to seed Service Worker + cache, then clear local state
  // so each route is captured in a "cold" (no progress, no rating, no badges)
  // state — what a brand-new visitor sees.
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.evaluate(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
    });
  } catch (e) {
    console.log(`  ! warmup failed: ${e.message}`);
  }

  for (const r of ROUTES) {
    const slug = `${vp.name}-${r.id}`;
    const file = `${OUT}/${slug}.png`;
    page.on('pageerror', (err) => issues.push(`[${slug}] pageerror: ${err.message}`));

    try {
      await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Dismiss onboarding modal if present (first visit only)
      const dismissBtn = page.locator('.onboarding-dismiss, .onboarding-close, button:has-text("ข้าม"), button:has-text("ต่อไป")').first();
      const seen = await dismissBtn.count();
      if (seen > 0) {
        await dismissBtn.click().catch(() => {});
        await page.waitForTimeout(300);
      }

      // Wait for the route's signature element (best-effort, don't fail
      // if it doesn't appear — we want SOMETHING captured)
      await page.waitForSelector(r.wait, { timeout: 10_000 }).catch(() => {});

      // Give animations / piece placement / async data 1.5s to settle
      await page.waitForTimeout(1500);

      await page.screenshot({ path: file, fullPage: false });
      console.log(`  ✓ ${slug}.png`);
    } catch (e) {
      console.log(`  ✗ ${slug}: ${e.message.slice(0, 100)}`);
      issues.push(`[${slug}] capture failed: ${e.message.slice(0, 200)}`);
    }
  }

  await ctx.close();
}

await browser.close();

console.log(`\n=== Done ===`);
console.log(`Output: ${OUT}/`);
console.log(`Issues during capture: ${issues.length}`);
issues.forEach((i) => console.log(`  · ${i}`));
