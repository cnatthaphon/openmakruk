// Shared helpers for the Playwright E2E suite.

import type { Page, Locator } from '@playwright/test';

/** Port the playwright webServer runs wrangler dev on. Pinned via
 *  playwright.config.ts — keep this in sync with that file. */
export const TEST_API_BASE = 'http://localhost:8789';

/** Apply BEFORE the bundle loads so the singleton adapter doesn't
 *  cache the default 8788 dev port. Drop into any spec that touches
 *  the network via `test.beforeEach(({ page }) => pinTestApiBase(page))`. */
export async function pinTestApiBase(page: Page): Promise<void> {
  await page.addInitScript((apiBase) => {
    try {
      localStorage.setItem('openmakruk_api_base', apiBase);
      // Skip the welcome modal so deep-link tests don't fight it.
      localStorage.setItem('openmakruk_onboarded', '1');
    } catch {
      // private mode / quota exceeded — fall through; the test will
      // surface the real error
    }
  }, TEST_API_BASE);
}

/** Clear all localStorage but preserve the onboarding flag so the
 *  first-time welcome modal doesn't block tests. Use this from a
 *  beforeEach hook instead of `localStorage.clear()`. */
export async function clearAppState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('openmakruk_onboarded', '1');
  });
}

/**
 * Read a versioned store from the test browser's localStorage. Stores
 * are persisted as `{ v: N, d: T }` (see src/lib/stores.ts). Tests
 * historically asserted directly on the inner shape — this helper
 * strips the wrapper so the assertions keep their original form
 * regardless of schema version bumps.
 *
 * Returns `null` if the key is absent and `{}` if a legacy unwrapped
 * entry is found (so old callers' `parsed ?? '{}'` patterns stay
 * shape-compatible).
 */
export async function readStore<T = unknown>(
  page: Page,
  key: string,
): Promise<T | null> {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'v' in parsed && 'd' in parsed) {
        return parsed.d;
      }
      return parsed;
    } catch {
      return null;
    }
  }, key);
}

/**
 * Wait for the lazy-loaded content to settle. After clicking a tab,
 * the page may briefly show "กำลังโหลด ..." before the JSON arrives.
 */
export async function waitForContentReady(page: Page, timeoutMs = 10_000) {
  await page.waitForFunction(
    () => !document.body.textContent?.includes('กำลังโหลด'),
    null,
    { timeout: timeoutMs },
  );
}

/**
 * Click a tab in the top nav by its visible label substring. The tab
 * labels carry emojis so we match by partial text.
 */
export async function clickTab(page: Page, partial: string) {
  await page.getByRole('button', { name: new RegExp(partial) }).first().click();
}

/**
 * Convert a square ("a1".."h8") to viewport pixel coordinates inside
 * the chessground board, accounting for whether the board is flipped.
 * This is how we synthesise drag moves — chessground's DOM squares
 * don't carry a data-key attribute we can target directly.
 */
export async function squareCoords(
  page: Page,
  square: string,
  flipped = false,
): Promise<{ x: number; y: number }> {
  const wrap = page.locator('.cg-wrap').first();
  const box = await wrap.boundingBox();
  if (!box) throw new Error(`.cg-wrap not visible — board not rendered`);
  const file = square.charCodeAt(0) - 97; // 0..7
  const rank = parseInt(square[1], 10) - 1; // 0..7
  let col = file;
  let row = 7 - rank; // rank 1 is at row 7 (bottom) from top-left
  if (flipped) {
    col = 7 - file;
    row = rank;
  }
  const cellW = box.width / 8;
  const cellH = box.height / 8;
  return {
    x: box.x + col * cellW + cellW / 2,
    y: box.y + row * cellH + cellH / 2,
  };
}

/**
 * Drag a piece from one square to another using synthesised mouse
 * events. Chessground listens for pointermove on document, so we
 * must include multiple intermediate steps to trip its drag-state.
 *
 * For ONE-SQUARE moves (e.g. bia d5→d6) the drag distance is short
 * enough that chessground's drag-threshold logic can mis-detect the
 * gesture as a stationary click. We fall back to chessground's
 * built-in click-to-select + click-to-move flow for those cases.
 */
export async function dragMove(
  page: Page,
  from: string,
  to: string,
  flipped = false,
) {
  // Scroll the board into the viewport first. Layouts above the board
  // (resume banner, puzzle goal, timer, etc.) can push it past the
  // bottom of a 900px-tall viewport, and `page.mouse.click(x, y)`
  // works in viewport (not page) coordinates — clicks would miss.
  await page.locator('.cg-wrap').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  const a = await squareCoords(page, from, flipped);
  const b = await squareCoords(page, to, flipped);
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const wrap = await page.locator('.cg-wrap').first().boundingBox();
  const cellW = wrap ? wrap.width / 8 : 80;
  // Adjacent-square move → click-then-click. Multi-square move → drag.
  if (dx < cellW * 1.3 && dy < cellW * 1.3) {
    await page.mouse.click(a.x, a.y);
    await page.waitForTimeout(60);
    await page.mouse.click(b.x, b.y);
    return;
  }
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // Jiggle outside the source square first so chessground commits to
  // drag-state, then sweep to the target.
  await page.mouse.move(a.x + 4, a.y + 4, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

/**
 * Same as `dragMove` but uses touch events. Browser context must be
 * created with `hasTouch: true`. Used by mobile tests to verify
 * chessground handles touch drag correctly.
 *
 * Touch flow on chessground:
 *   1. touchstart on source square → selects piece
 *   2. touchmove past drag-threshold → enters drag state
 *   3. touchend on target → drops piece
 *
 * Adjacent-square touch is finicky for the same reason as mouse —
 * we fall back to tap-then-tap which chessground's "click-to-move"
 * flow accepts.
 */
export async function touchDragMove(
  page: Page,
  from: string,
  to: string,
  flipped = false,
) {
  await page.locator('.cg-wrap').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  const a = await squareCoords(page, from, flipped);
  const b = await squareCoords(page, to, flipped);
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const wrap = await page.locator('.cg-wrap').first().boundingBox();
  const cellW = wrap ? wrap.width / 8 : 80;
  if (dx < cellW * 1.3 && dy < cellW * 1.3) {
    // Tap-then-tap fallback. `page.tap()` synthesises a single
    // touchstart→touchend, which chessground interprets as a click
    // on that square.
    await page.touchscreen.tap(a.x, a.y);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(b.x, b.y);
    return;
  }
  // Multi-square drag: dispatch raw touch events via CDP so we can
  // tween across squares. Playwright's `touchscreen.tap` doesn't
  // support drag, so we use the CDP backdoor.
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: a.x, y: a.y, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: a.x + 6, y: a.y + 6, id: 1 }],
  });
  // 8 intermediate steps for a smooth-enough drag
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, id: 1 }],
    });
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await client.detach();
}

/**
 * Get the FEN currently rendered by chessground by reading the
 * piece positions out of the DOM. This is the "ground truth" of
 * what the user sees — used to verify moves landed.
 */
export async function readBoardFen(page: Page): Promise<string> {
  return page.evaluate(() => {
    const board = document.querySelector('cg-board');
    if (!board) return '';
    const pieces = board.querySelectorAll('piece');
    const grid: string[][] = Array.from({ length: 8 }, () =>
      Array(8).fill(''),
    );
    const wrap = document.querySelector('.cg-wrap') as HTMLElement | null;
    if (!wrap) return '';
    const cellW = wrap.clientWidth / 8;
    const cellH = wrap.clientHeight / 8;
    const isFlipped = wrap.querySelector('.orientation-black') !== null;
    pieces.forEach((p) => {
      const el = p as HTMLElement;
      const style = el.getAttribute('style') || '';
      // Chessground positions pieces via `transform: translate(Xpx, Ypx)`
      const m = style.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      if (!m) return;
      const x = parseFloat(m[1]);
      const y = parseFloat(m[2]);
      let col = Math.round(x / cellW);
      let row = Math.round(y / cellH);
      if (isFlipped) {
        col = 7 - col;
        row = 7 - row;
      }
      const rank = 8 - row;
      const file = String.fromCharCode(97 + col);
      const cls = el.className; // "white king" or "black queen" etc.
      const parts = cls.split(/\s+/);
      const color = parts.includes('white') ? 'w' : 'b';
      const roleMap: Record<string, string> = {
        king: 'k',
        queen: 'q', // chessground sees Met as queen
        bishop: 'b', // chessground sees Khon as bishop
        knight: 'n',
        rook: 'r',
        pawn: 'p',
      };
      const role = parts.find((p) => roleMap[p]);
      if (!role) return;
      const letter = roleMap[role];
      grid[rank - 1][col] = color === 'w' ? letter.toUpperCase() : letter;
    });
    // Compose FEN-like board string (just the piece placement, no
    // side/castling — that's enough for diff'ing position state).
    const ranks: string[] = [];
    for (let r = 7; r >= 0; r--) {
      let s = '';
      let blanks = 0;
      for (let f = 0; f < 8; f++) {
        const p = grid[r][f];
        if (p === '') blanks++;
        else {
          if (blanks > 0) {
            s += blanks;
            blanks = 0;
          }
          s += p;
        }
      }
      if (blanks > 0) s += blanks;
      ranks.push(s);
    }
    return ranks.join('/');
  });
}
