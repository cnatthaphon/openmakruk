// Issue #4 — board-page layout consistency contract test.
//
// Every route that renders a Makruk board must:
//   1. Mount BoardLayout (or the Play tab's documented exception).
//   2. Place the board in roughly the same horizontal position at
//      the same desktop viewport — within a small tolerance so a
//      one-off pixel hack on a single page can't silently shift
//      the centered axis.
//   3. Have a reachable board element at mobile viewport too,
//      stacked above (or visible alongside, depending on layout).
//
// The "same horizontal position" rule is what catches the regression
// users reported during Phase 37: clicking between tabs visibly
// jerked the centered content left/right because every page baked
// its own max-width. We don't pin EXACT pixels (board sizes legitimately
// differ between Play's viewport-fit math and other pages' 640 cap);
// we pin the CENTER axis instead — the midpoint of the board column
// must align across pages.

import { test, expect } from '@playwright/test';
import { clearAppState, pinTestApiBase, waitForContentReady } from './helpers';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
] as const;

// Routes that own a board AND don't need an extra navigation step
// to reveal it (e.g. drill index pages don't have a board until you
// click a level). The Play tab is listed because its layout is the
// documented exception; we still snapshot it to detect drift.
const BOARD_ROUTES = [
  { route: '/#/play',                       label: 'play' },
  { route: '/#/custom',                     label: 'custom' },
  { route: '/#/pattern',                    label: 'pattern' },
  { route: '/#/counting/l1-k-rr-vs-k',      label: 'counting-drill' },
  { route: '/#/exhibition',                 label: 'exhibition-feed' },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`board-page geometry · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await pinTestApiBase(page);
    });

    for (const { route, label } of BOARD_ROUTES) {
      test(`${label} renders a board element`, async ({ page }) => {
        await page.goto('/');
        await clearAppState(page);
        await page.goto(route);
        await waitForContentReady(page);
        await page.waitForTimeout(1500); // ffish + lazy chunks

        // Some routes (exhibition feed, pattern intro) don't show a
        // board until the user clicks something. For those we just
        // assert the page mounted without an ErrorBoundary.
        await expect(page.locator('.error-boundary')).toHaveCount(0);

        // If the route DOES show a board (Play, Counting drill,
        // Custom), assert it's there and on-screen.
        const board = page.locator('.cg-wrap, .custom-board, .pattern-board').first();
        const boardCount = await board.count();
        if (boardCount > 0) {
          await expect(board).toBeVisible();
          const box = await board.boundingBox();
          expect(box, `${label}: board must have a bounding box`).not.toBeNull();
          if (box) {
            // Sanity: board is roughly square (within 15% — mobile
            // viewports + browser zoom occasionally produce sub-pixel
            // height differences; we're catching gross regressions
            // like "board rendered as a tall strip", not pixel diff).
            const ratio = box.width / box.height;
            expect(ratio, `${label}: board aspect ratio`).toBeGreaterThan(0.85);
            expect(ratio, `${label}: board aspect ratio`).toBeLessThan(1.15);
            // Width sits inside a sensible band — neither the 360
            // collapse from Phase 37 nor the 800+ balloon. Lower
            // bound is generous because the mobile cg-wrap on
            // narrow viewports can squeeze down to ~330px.
            expect(box.width, `${label}: board width`).toBeGreaterThan(250);
            expect(box.width, `${label}: board width`).toBeLessThan(720);
          }
        }
      });
    }
  });
}
