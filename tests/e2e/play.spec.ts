// Play tab — confirms the engine loads + the starting position
// renders correctly. The actual move-playing loop is covered by
// bot-game.spec.ts so we don't pay the engine-startup cost twice
// in CI.

import { test, expect } from '@playwright/test';
import { readBoardFen, waitForContentReady } from './helpers';

test.describe('play tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('Fairy-Stockfish WASM loads + board renders at the Makruk start position', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/play');
    await waitForContentReady(page);

    // Loading screen must clear within 30s
    await page.waitForSelector('.screen.loading', {
      state: 'detached',
      timeout: 30_000,
    });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // Starting position check — note this uses chessground's piece
    // letters (q for Met, b for Khon). Makruk has White K at d1 and
    // Black K at e8 (kings face each other diagonally), so the white
    // rank reads RNBKQBNR (not the chess-standard RNBQKBNR).
    const startFen = await readBoardFen(page);
    expect(startFen).toBe('rnbqkbnr/8/pppppppp/8/8/PPPPPPPP/8/RNBKQBNR');
  });
});
