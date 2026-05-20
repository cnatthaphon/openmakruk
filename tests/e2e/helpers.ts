// Shared helpers for the Playwright E2E suite.

import type { Page, Locator } from '@playwright/test';

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
 */
export async function dragMove(
  page: Page,
  from: string,
  to: string,
  flipped = false,
) {
  const a = await squareCoords(page, from, flipped);
  const b = await squareCoords(page, to, flipped);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // Tiny jiggle first — chessground considers a move only when the
  // pointer leaves the source square. Then sweep to the target.
  await page.mouse.move(a.x + 4, a.y + 4, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
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
