// Mobile + touch verification.
//
// Thai-market users will mostly land on this app via mobile browsers.
// chessground's docs say touch is supported (lichess proves it), but
// we still need to verify:
//   1. A real touch drag moves a piece on the Play board.
//   2. Tap-tap (click-to-move) works on a 375 px viewport.
//   3. The Custom-Position palette (click-based, NOT drag) works on
//      touch — i.e. tap palette piece → tap board square places it.
//   4. Sub-tabs in the Play sidebar are tappable.
//   5. Toast confirms (resign / library delete) accept a tap on the
//      confirm button.
//
// All tests use `hasTouch: true` + a mobile viewport. We don't try to
// emulate a specific device — the iPhone 13 dimensions (390x844) are
// representative enough.

import { test, expect, devices } from '@playwright/test';
import {
  readBoardFen,
  squareCoords,
  touchDragMove,
  waitForContentReady,
} from './helpers';

const mobileViewport = { width: 390, height: 844 };

test.use({
  ...devices['iPhone 13'],
  // Override the userAgent stripping that some pages do — chessground
  // doesn't care, but our SW + ffish loaders shouldn't either.
});

test.describe('mobile + touch', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
    });
  });

  test('Play board: tap-tap moves a pawn (e3 → e4)', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    const before = await readBoardFen(page);
    // chessground accepts tap-source then tap-target as a click-to-move.
    const from = await squareCoords(page, 'e3');
    const to = await squareCoords(page, 'e4');
    await page.locator('.cg-wrap').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await page.touchscreen.tap(from.x, from.y);
    await page.waitForTimeout(120);
    await page.touchscreen.tap(to.x, to.y);

    // Wait for the FEN to update — the piece should have moved.
    let after = before;
    for (let i = 0; i < 40 && after === before; i++) {
      after = await readBoardFen(page);
      if (after === before) await page.waitForTimeout(150);
    }
    expect(after).not.toBe(before);
  });

  test('Play board: multi-square touch drag (rook a1 → a8 on cleared row)', async ({ page }) => {
    test.setTimeout(60_000);
    // Use mate-001 puzzle which has a clean board where a long rook
    // move is legal. Going through the puzzle flow exercises touch
    // drag for a real piece move that the engine validates.
    await page.goto('/#/puzzles/mate-001');
    await waitForContentReady(page);
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });
    await page.waitForTimeout(800);

    // mate-001's solution is a1 → a8. Use touch drag to play it.
    await touchDragMove(page, 'a1', 'a8');

    // The puzzle accepts the solution → feedback bar shows.
    await expect(page.locator('.puzzle-feedback-text.good')).toBeVisible({ timeout: 5_000 });
  });

  test('Custom palette: tap piece → tap board places it (no drag needed)', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/#/custom');
    await waitForContentReady(page);
    // First clear the board so we can place a single piece on a known
    // empty square. The "🧹 Clear" button wipes the grid.
    await page.locator('button', { hasText: 'Clear' }).first().tap();
    // Pick a white piece from the palette (first button in the white row)
    await page.waitForSelector('.custom-palette-btn', { timeout: 15_000 });
    const firstWhitePiece = page.locator('.custom-palette').first().locator('.custom-palette-btn').first();
    await firstWhitePiece.scrollIntoViewIfNeeded();
    await firstWhitePiece.tap();
    await expect(firstWhitePiece).toHaveClass(/is-selected/);
    // Tap a known empty square — d4 (any middle square is fine after clear).
    const square = page.locator('.custom-square[aria-label^="d4"]');
    await square.scrollIntoViewIfNeeded();
    await square.tap();
    // After placement, that square should now carry the .has-piece class.
    await expect(square).toHaveClass(/has-piece/, { timeout: 3_000 });
  });

  test('sidebar sub-tabs: tap switches active tab on mobile', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // Default sub-tab is "game". Tap "ตาเดิน" sub-tab and verify the
    // hint button (lives in that sub-tab) becomes visible.
    const movesTab = page.locator('.sidebar-tab', { hasText: 'ตาเดิน' });
    await movesTab.scrollIntoViewIfNeeded();
    await movesTab.tap();
    await expect(page.locator('.hint-button')).toBeVisible({ timeout: 5_000 });
  });

  test('toast confirm: tap confirms a destructive action', async ({ page }) => {
    test.setTimeout(45_000);
    // Seed one library entry then delete it via the toast confirm.
    await page.evaluate(() => {
      localStorage.setItem(
        'openmakruk_library',
        JSON.stringify([
          {
            id: 'pos_touch_test',
            fen: 'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1',
            title: 'Touch test position',
            note: '',
            tags: [],
            createdAt: Date.now(),
            source: 'custom',
          },
        ]),
      );
    });
    await page.goto('/#/library');
    await page.reload();
    await waitForContentReady(page);
    await expect(page.locator('.library-card')).toHaveCount(1);

    // Tap the delete button (🗑) → toast confirm appears
    const deleteBtn = page.locator('.library-card').first().locator('.library-delete-button');
    await deleteBtn.tap();
    await expect(page.locator('.toast-confirm')).toBeVisible({ timeout: 3_000 });
    // Tap the destructive confirm button
    await page.locator('.toast-confirm-ok').tap();
    await expect(page.locator('.library-card')).toHaveCount(0, { timeout: 3_000 });
  });

  test('mobile layout: board + sidebar both fit without horizontal scroll', async ({ page }) => {
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // No horizontal overflow — page width should equal viewport width.
    const overflow = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);

    // Board itself is not collapsed to a tiny size
    const board = await page.locator('.cg-wrap').first().boundingBox();
    expect(board?.width ?? 0).toBeGreaterThan(280); // mobile-min sane size
  });
});
