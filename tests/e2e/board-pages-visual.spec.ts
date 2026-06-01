// Issue #4 — board-page layout consistency contract test.
//
// Routes are split into two explicit lists so a missing board on a
// page that's SUPPOSED to render one fails CI loudly, instead of
// being silently skipped by a `count === 0 → continue` short-circuit
// (Codex review on PR #13):
//
//   RENDER_ONLY_ROUTES  — index / feed pages that DO NOT mount a
//                         board on the audited deep-link.
//                         Assertion: page renders without an
//                         ErrorBoundary + no uncaught throws.
//
//   BOARD_GEOMETRY_ROUTES — surfaces that MUST mount a chess /
//                         custom / pattern board. Assertions:
//                         page renders cleanly, board element
//                         exists + is visible, aspect ratio ≈
//                         square, width sits in a sensible band,
//                         and (cross-route) the center X-axis is
//                         within 12px of the median.
//
//   The Play tab is in BOARD_GEOMETRY_ROUTES so the visibility +
//   sanity gates apply to it, but it's INTENTIONALLY EXCLUDED from
//   the cross-route center-axis comparison because its
//   viewport-fit + EvalBar-flush-left layout is the documented
//   exception to BoardLayout. See src/components/BoardLayout.tsx.
//   When Play migrates onto BoardLayout (issue #4 follow-up), the
//   PLAY_EXCLUDED_FROM_AXIS flag goes away and full coverage kicks
//   in.

import { test, expect } from '@playwright/test';
import { clearAppState, pinTestApiBase, waitForContentReady } from './helpers';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
] as const;

/** Surfaces that mount a board on the audited deep-link. Each id
 *  must be a real entry in its content file:
 *    - movetrainer:    public/content/openings/all.json     → 'op-khun-pawn'
 *    - survive-drill:  public/content/puzzles/all.json#defense → 'defense-001'
 *    - counting-drill: src/lib/countingDrill.ts DRILL_LEVELS → 'l1-k-rr-vs-k'
 *    - puzzle:         public/content/puzzles/all.json       → 'mate-001'
 *  If any of these renames, the geometry test fails loudly (board
 *  doesn't mount) — that's the assertion shape we want. */
const BOARD_GEOMETRY_ROUTES = [
  { route: '/#/play',                       label: 'play' },
  { route: '/#/custom',                     label: 'custom' },
  { route: '/#/counting/l1-k-rr-vs-k',      label: 'counting-drill' },
  { route: '/#/movetrainer/op-khun-pawn',   label: 'movetrainer' },
  { route: '/#/survive/defense-001',        label: 'survive-drill' },
  { route: '/#/puzzles/mate-001',           label: 'puzzle' },
] as const;

/** Index / feed routes that legitimately do NOT show a board until
 *  the user interacts. Listed here so they still get the render-
 *  without-ErrorBoundary gate, but they're NOT in the geometry list
 *  — a board appearing here would be a regression in either
 *  direction. */
const RENDER_ONLY_ROUTES = [
  { route: '/#/pattern',     label: 'pattern-intro' },
  { route: '/#/exhibition',  label: 'exhibition-feed' },
  { route: '/#/rush',        label: 'puzzle-rush-intro' },
] as const;

/** Pixel tolerance for "boards sit on the same axis". Generous
 *  because each board reads its width from a different style
 *  source and sub-pixel rounding drifts a few px; the regression
 *  we're catching is the 20–100px shift caused by per-page max-
 *  width divergence, which is orders of magnitude over this band. */
const CENTER_AXIS_TOLERANCE_PX = 12;

/** Play is the documented exception to BoardLayout — its viewport-
 *  fit math intentionally diverges. We still measure its board for
 *  the per-route geometry gates but skip the cross-route axis
 *  comparison until Play migrates onto BoardLayout. */
const PLAY_EXCLUDED_FROM_AXIS = '/#/play';

for (const vp of VIEWPORTS) {
  test.describe(`board-page geometry · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await pinTestApiBase(page);
    });

    // Render-only routes: assert the page mounts without an
    // ErrorBoundary fallback or pageerror event. We do NOT look
    // for a board here — these surfaces don't render one on the
    // audited deep-link. (If you find yourself wanting to assert a
    // board, move the route into BOARD_GEOMETRY_ROUTES instead of
    // weakening this gate.)
    for (const { route, label } of RENDER_ONLY_ROUTES) {
      test(`${label} (no-board route) renders without ErrorBoundary`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));

        await page.goto('/');
        await clearAppState(page);
        await page.goto(route);
        await waitForContentReady(page);
        await page.waitForTimeout(1500);

        await expect(page.locator('.error-boundary')).toHaveCount(0);
        expect(pageErrors, `${label} should not throw`).toEqual([]);
      });
    }

    // Geometry routes: assert the page mounts AND mounts a board.
    // Per-route sanity (aspect ratio + width band) runs here so
    // 'board rendered as a strip' fails even when only one route
    // is broken.
    for (const { route, label } of BOARD_GEOMETRY_ROUTES) {
      test(`${label} mounts a visible board`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));

        await page.goto('/');
        await clearAppState(page);
        await page.goto(route);
        await waitForContentReady(page);
        await page.waitForTimeout(1500);

        await expect(page.locator('.error-boundary')).toHaveCount(0);
        expect(pageErrors, `${label} should not throw`).toEqual([]);

        const board = page.locator('.cg-wrap, .custom-board, .pattern-board').first();
        await expect(
          board,
          `${label}: must mount a board element`,
        ).toBeVisible({ timeout: 10_000 });

        const box = await board.boundingBox();
        expect(box, `${label}: board must have a bounding box`).not.toBeNull();
        if (box) {
          const ratio = box.width / box.height;
          expect(ratio, `${label}: aspect ratio`).toBeGreaterThan(0.85);
          expect(ratio, `${label}: aspect ratio`).toBeLessThan(1.15);
          expect(box.width, `${label}: width band`).toBeGreaterThan(250);
          expect(box.width, `${label}: width band`).toBeLessThan(720);
        }
      });
    }

    // Study detail surfaces (Endgames + Master Games) — these are
    // gated behind a click on the index, not a deep-link URL, so they
    // can't sit in BOARD_GEOMETRY_ROUTES verbatim. Drive them through
    // the interactive path instead so the audit catches drift (PR #13
    // review: Codex flagged that those views still used the legacy
    // `.study-view-board` wrapper).
    for (const subTab of ['endgames', 'master-games'] as const) {
      test(`study → ${subTab} detail mounts a BoardLayout board`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));

        await page.goto('/');
        await clearAppState(page);
        await page.goto('/#/study');
        await waitForContentReady(page);

        // Click the sub-tab. Labels carry emoji + Thai — matched by the
        // distinctive substring (see SUBTABS in StudyPage.tsx).
        const tabLabel = subTab === 'endgames' ? 'หมากปลายเกม' : 'เกมตัวอย่าง';
        await page.getByRole('tab', { name: new RegExp(tabLabel) }).click();
        // Wait for cards then click the first one to open the detail.
        await page.waitForSelector('.study-card', { timeout: 15_000 });
        await page.locator('.study-card').first().click();

        // Board mounts through BoardLayout — the wrapper carries the
        // `.board-layout` class regardless of which page it serves.
        await expect(page.locator('.study-view .board-layout')).toBeVisible({
          timeout: 15_000,
        });
        const board = page.locator('.study-view .cg-wrap').first();
        await expect(board).toBeVisible({ timeout: 15_000 });
        expect(pageErrors, 'study detail should not throw').toEqual([]);
      });
    }

    // Cross-route center-axis comparison: every BOARD_GEOMETRY route
    // EXCEPT Play must place its board on the same horizontal axis.
    test('every BoardLayout-driven board sits on the same center axis', async ({ page }) => {
      const centers: { label: string; centerX: number }[] = [];

      for (const { route, label } of BOARD_GEOMETRY_ROUTES) {
        if (route === PLAY_EXCLUDED_FROM_AXIS) continue;
        await page.goto('/');
        await clearAppState(page);
        await page.goto(route);
        await waitForContentReady(page);
        await page.waitForTimeout(1500);

        const board = page.locator('.cg-wrap, .custom-board, .pattern-board').first();
        await expect(board).toBeVisible({ timeout: 10_000 });
        const box = await board.boundingBox();
        expect(box, `${label}: bounding box`).not.toBeNull();
        if (!box) continue;
        centers.push({ label, centerX: box.x + box.width / 2 });
      }

      expect(centers.length, 'must measure ≥ 2 boards').toBeGreaterThanOrEqual(2);

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
