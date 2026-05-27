// Regenerate the README hero screenshots.
//
// Run with the dev server up:
//   npm run dev    # in one terminal — uses port 5174
//   node scripts/capture-readme-screens.mjs
//
// Captures each tab at 1280x800, hides the cursor / spinner / boot
// splash, and writes to docs/. Pre-seeds localStorage so the page
// looks like a returning user (not a fresh empty profile + no streak).
//
// Why a separate script (not part of the Playwright test suite):
// these screenshots ship in README.md and are reviewed by a human;
// they're not assertable as test outputs. Keeping them as a manual
// (but reproducible) artifact prevents flaky CI from blocking a
// design change.

import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.OPENMAKRUK_BASE || 'http://localhost:5174';

const SHOTS = [
  { route: 'play', file: 'docs/screenshot-play.png' },
  { route: 'profile', file: 'docs/screenshot-profile.png' },
  { route: 'exhibition', file: 'docs/screenshot-exhibition.png' },
  { route: 'counting', file: 'docs/screenshot-counting.png' },
];

async function main() {
  const browser = await chromium.launch();
  for (const { route, file } of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2, // retina screenshots for sharp README
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try {
        localStorage.setItem('openmakruk_onboarded', '1');
        // Seed a non-trivial profile so the widget shows real data.
        const stats = {
          v: 1,
          d: {
            version: 1,
            displayName: 'OpenMakruk',
            createdAt: Date.now() - 7 * 24 * 3600 * 1000,
            rating: 1240,
            totalGames: 18,
            byLevel: {
              easy:   { wins: 7, losses: 1, draws: 0 },
              medium: { wins: 5, losses: 3, draws: 1 },
              hard:   { wins: 1, losses: 0, draws: 0 },
              master: { wins: 0, losses: 0, draws: 0 },
            },
            history: [],
          },
        };
        localStorage.setItem('openmakruk_stats', JSON.stringify(stats));
      } catch { /* private mode */ }
    });
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    // Hide the boot splash if it's still around.
    await page.evaluate(() => {
      document.querySelectorAll('.openmakruk-boot').forEach((el) => el.remove());
    });
    await page.screenshot({ path: file, fullPage: false });
    console.log(`captured ${route} → ${file}`);
    await ctx.close();
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
