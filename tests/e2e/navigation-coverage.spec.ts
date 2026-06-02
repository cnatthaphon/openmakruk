// Issue #9 — navigation contract coverage.
//
// One spec that walks every primary nav target + drills into the
// first item of each "list → detail" surface, asserting:
//   • the page renders without ErrorBoundary
//   • each surface exposes ONE shared <BackButton> (never zero, never
//     more than one — duplicate back affordances were one of the
//     audit findings)
//   • the back button's destination resolves to a tab the router
//     recognizes (no dead links)
//
// Runs on both desktop and a mobile viewport so the mobile layout
// regression we hit in Phase 37 (board column collapsing into the
// side panels at <1024 viewport) can never silently come back.

import { test, expect } from '@playwright/test';
import { clearAppState, pinTestApiBase, waitForContentReady } from './helpers';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile',  width: 390,  height: 844 },
] as const;

// Primary tabs + the most-visited deep-link routes. We do NOT cover
// /#/cert/<slug> (needs a real cert) or /#/bots/<id> (needs a real
// bot id with seeded D1 data). Those are covered elsewhere.
const ROUTES = [
  '/#/play',
  '/#/puzzles',
  '/#/learn',
  '/#/study',
  '/#/custom',
  '/#/library',
  '/#/profile',
  '/#/settings',
  '/#/about',
  '/#/counting',
  '/#/movetrainer',
  '/#/bossrush',
  '/#/pattern',
  '/#/survive',
  '/#/rush',
  '/#/exhibition',
  '/#/stats',
  '/#/challenge',
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`navigation coverage · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await pinTestApiBase(page);
    });

    for (const route of ROUTES) {
      test(`${route} renders without errors`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));

        await page.goto('/');
        await clearAppState(page);
        await page.goto(route);
        await waitForContentReady(page);
        await page.waitForTimeout(800);

        // ErrorBoundary did NOT catch anything.
        await expect(page.locator('.error-boundary')).toHaveCount(0);

        // No console pageerror events (uncaught throws).
        expect(pageErrors, `${route} should not raise pageerror`).toEqual([]);
      });
    }

    test('every page with a back affordance has exactly one .back-button', async ({ page }) => {
      // Routes that are KNOWN to have a back affordance after the
      // Issue #9 cleanup. The home tabs (play/profile/settings/etc.)
      // intentionally do not — they're reached via the navbar.
      const ROUTES_WITH_BACK = [
        '/#/counting/l1-k-rr-vs-k',
        '/#/movetrainer',
        '/#/bossrush',
        '/#/pattern',
        '/#/survive',
        '/#/rush',
      ];
      for (const route of ROUTES_WITH_BACK) {
        await page.goto('/');
        await clearAppState(page);
        await page.goto(route);
        await waitForContentReady(page);
        await page.waitForTimeout(500);
        const count = await page.locator('.back-button').count();
        expect(count, `${route} should have exactly 1 .back-button`).toBe(1);
      }
    });

    // Codex review on PR #10: presence/uniqueness isn't enough —
    // a back button that goes nowhere or to the wrong tab is the
    // failure mode that introduced this whole nav cleanup. Drive
    // each click and assert the resulting hash so a future label-
    // shuffle / wrong-target regression fails CI.
    const BACK_TARGETS: Array<{ from: string; expectedHash: string }> = [
      { from: '/#/counting/l1-k-rr-vs-k', expectedHash: '#/counting' },
      { from: '/#/movetrainer',           expectedHash: '#/study' },
      { from: '/#/bossrush',              expectedHash: '#/profile' },
      { from: '/#/pattern',               expectedHash: '#/study' },
      { from: '/#/survive',               expectedHash: '#/puzzles' },
      { from: '/#/rush',                  expectedHash: '#/puzzles' },
    ];
    for (const { from, expectedHash } of BACK_TARGETS) {
      test(`back button on ${from} navigates to ${expectedHash}`, async ({ page }) => {
        await page.goto('/');
        await clearAppState(page);
        await page.goto(from);
        await waitForContentReady(page);
        await page.waitForTimeout(500);

        const back = page.locator('.back-button');
        await expect(back).toHaveCount(1);
        await back.click();

        // The router uses window.location.hash; poll until it settles
        // on the expected target so we don't race the hashchange
        // listener.
        await expect
          .poll(() => new URL(page.url()).hash, { timeout: 5_000 })
          .toBe(expectedHash);
      });
    }
  });
}

// Issue #9 audit: the mobile bottom-nav "เพิ่มเติม" sheet must expose
// every navigable surface the desktop NavBar does. stats / challenge /
// exhibition were missing — unreachable on mobile. Pin them so the two
// navs can't silently drift apart again.
test.describe('navigation coverage · mobile bottom-nav reachability', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await pinTestApiBase(page);
  });

  const SHEET_TARGETS: Array<{ label: string; hash: string }> = [
    { label: 'สถิติรวม', hash: '#/stats' },
    { label: 'ท้าดวล', hash: '#/challenge' },
    { label: 'โชว์บอท', hash: '#/exhibition' },
  ];

  for (const { label, hash } of SHEET_TARGETS) {
    test(`bottom-nav sheet reaches ${hash} (${label})`, async ({ page }) => {
      await page.goto('/');
      await clearAppState(page);
      await page.goto('/#/play');
      await waitForContentReady(page);

      // Bottom nav is mobile-only; the overflow trigger opens the sheet.
      const overflow = page.locator('.bottom-nav button', { hasText: 'เพิ่มเติม' });
      await expect(overflow).toBeVisible({ timeout: 10_000 });
      await overflow.click();

      const item = page.locator('.bottom-nav-sheet-item', { hasText: label });
      await expect(item).toBeVisible({ timeout: 5_000 });
      await item.click();

      await expect
        .poll(() => new URL(page.url()).hash, { timeout: 5_000 })
        .toBe(hash);
    });
  }
});
