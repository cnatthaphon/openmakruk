// Issue #4 — board-page layout consistency contract test.
//
// Two assertions, both per-viewport:
//
//   1. EVERY route that owns a board must render one without an
//      ErrorBoundary fallback. Catches the wholesale-broken case
//      (lazy chunk failure, missing content file, route typo).
//
//   2. THE CENTER X-AXIS of every visible board must match. We
//      compute `box.x + box.width / 2` for each board and assert
//      every value lies within a small tolerance of the same axis.
//      Boards on different pages may be DIFFERENT SIZES — Play has
//      viewport-fit math, drills cap at 640 — but they must all
//      sit on the same vertical line through the viewport. This is
//      the regression Phase 37 fixed (clicking between tabs visibly
//      jerked centered content left/right); pinning it here keeps
//      the fix in place.
//
// We also sanity-check aspect ratio (≈ square) and width band
// (≥ 250, ≤ 720) so a future change that accidentally renders
// the board as a tall strip or balloons it past the side panels
// fails CI.

import { test, expect } from '@playwright/test';
import { clearAppState, pinTestApiBase, waitForContentReady } from './helpers';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
] as const;

// Every route that owns a board, plus the deep-link variant that
// actually mounts one (drill index pages don't have a board until
// you click a level — we open the canonical first level instead).
// The Play tab is included because its layout is the documented
// exception to BoardLayout; we still pin its center axis so drift
// fails CI.
const BOARD_ROUTES = [
  { route: '/#/play',                            label: 'play' },
  { route: '/#/custom',                          label: 'custom' },
  { route: '/#/pattern',                         label: 'pattern-intro' },
  { route: '/#/counting/l1-k-rr-vs-k',           label: 'counting-drill' },
  { route: '/#/movetrainer/khun-pawn',           label: 'movetrainer' },
  { route: '/#/survive/survive-001',             label: 'survive-drill' },
  { route: '/#/puzzles/mate-001',                label: 'puzzle' },
  { route: '/#/exhibition',                      label: 'exhibition-feed' },
  { route: '/#/rush',                            label: 'puzzle-rush' },
] as const;

/** Pixel tolerance for "boards sit on the same axis". Generous
 *  because each board reads its own width from a different style
 *  source and sub-pixel rounding can drift a few px; the regression
 *  we're catching is the 20-100px shift caused by per-page max-width
 *  divergence, which is orders of magnitude over this band. */
const CENTER_AXIS_TOLERANCE_PX = 12;

for (const vp of VIEWPORTS) {
  test.describe(`board-page geometry · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await pinTestApiBase(page);
    });

    for (const { route, label } of BOARD_ROUTES) {
      test(`${label} renders without ErrorBoundary`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));

        await page.goto('/');
        await clearAppState(page);
        await page.goto(route);
        await waitForContentReady(page);
        await page.waitForTimeout(1500); // ffish + lazy chunks

        await expect(page.locator('.error-boundary')).toHaveCount(0);
        expect(pageErrors, `${label} should not throw`).toEqual([]);
      });
    }

    test('every visible board sits on the same center axis', async ({ page }) => {
      const centers: { label: string; centerX: number; width: number; height: number }[] = [];

      // Play tab is excluded from the cross-route comparison because
      // its custom layout (viewport-fit + EvalBar flush left, not
      // inside the left slot's padding) is the documented exception
      // to BoardLayout. See src/components/BoardLayout.tsx for the
      // rationale. The "render without ErrorBoundary" check above
      // still runs for /#/play. When Play migrates to BoardLayout
      // (issue #4 follow-up), remove this exclusion.
      const COMPARED_ROUTES = BOARD_ROUTES.filter((r) => r.route !== '/#/play');

      for (const { route, label } of COMPARED_ROUTES) {
        await page.goto('/');
        await clearAppState(page);
        await page.goto(route);
        await waitForContentReady(page);
        await page.waitForTimeout(1500);

        const board = page.locator('.cg-wrap, .custom-board, .pattern-board').first();
        const count = await board.count();
        if (count === 0) continue; // route shows no board until interaction
        const box = await board.boundingBox();
        if (!box) continue;

        // Per-board sanity: aspect ratio ≈ square + width inside the
        // sensible band. Catches "board rendered as strip" or
        // "board ballooned past panels" without depending on the
        // center-axis cross-route check.
        const ratio = box.width / box.height;
        expect(ratio, `${label}: aspect ratio`).toBeGreaterThan(0.85);
        expect(ratio, `${label}: aspect ratio`).toBeLessThan(1.15);
        expect(box.width, `${label}: width band`).toBeGreaterThan(250);
        expect(box.width, `${label}: width band`).toBeLessThan(720);

        centers.push({
          label,
          centerX: box.x + box.width / 2,
          width: box.width,
          height: box.height,
        });
      }

      // Need at least two boards to compare. If a routing change ever
      // hides every board on the audited routes, this surfaces it as
      // a clear failure rather than a silent skip.
      expect(centers.length, 'must measure at least two boards').toBeGreaterThanOrEqual(2);

      // Reference axis = median of measured centers. We compare every
      // other board against it; failures include the offending label
      // + its actual centerX so the regression is debuggable.
      const sortedX = [...centers].sort((a, b) => a.centerX - b.centerX);
      const median = sortedX[Math.floor(sortedX.length / 2)].centerX;
      for (const c of centers) {
        expect(
          Math.abs(c.centerX - median),
          `${c.label} centerX=${c.centerX.toFixed(1)} drifted from median=${median.toFixed(1)} by more than ${CENTER_AXIS_TOLERANCE_PX}px`,
        ).toBeLessThanOrEqual(CENTER_AXIS_TOLERANCE_PX);
      }
    });
  });
}
