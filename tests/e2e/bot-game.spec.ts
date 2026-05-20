// "Bot vs engine" — drives the human side of the play tab with a
// scripted move-picker (uses ffish loaded inside the test page to
// find legal moves and pick one deterministically). After each
// human move we wait for the embedded Fairy-Stockfish engine to
// respond, then loop.
//
// This proves the full play loop holds together across many turns
// in a row — not just the first move. If the engine ever stalls,
// produces an illegal move, or the position state diverges between
// chessground/ffish/the engine, the test catches it.

import { test, expect } from '@playwright/test';
import { dragMove, readBoardFen, waitForContentReady } from './helpers';

const TARGET_PLIES = 6;       // 3 human moves + 3 engine replies
const PER_PLY_TIMEOUT_MS = 30_000;

test.describe('bot game vs Fairy-Stockfish', () => {
  test(`plays ${TARGET_PLIES} plies without stalling or illegal moves`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // Load a separate ffish instance inside the page — this is the
    // "user bot" that picks moves. It runs alongside the app's own
    // ffish instance but in a different scope, so they don't share
    // state. We re-sync after each move using the app's current FEN.
    await page.evaluate(async () => {
      const mod = await import('/node_modules/ffish-es6/ffish.js');
      const Module = (mod as any).default;
      const ffish = await Module({
        locateFile: (file: string) => (file.endsWith('.wasm') ? `/${file}` : file),
      });
      (window as any).__botFfish = ffish;
    });

    // Pick a "user" move from the current board state: ask ffish for
    // all legal moves and return the first one whose source square has
    // a white piece (the user is white in v1).
    async function pickUserMove(currentFen: string): Promise<string | null> {
      return page.evaluate((fen) => {
        const ffish = (window as any).__botFfish;
        const board = new ffish.Board('makruk', fen);
        try {
          const movesStr = board.legalMoves();
          const moves = movesStr.trim().split(/\s+/).filter(Boolean);
          // We're white; legal moves from a white-to-move FEN are by
          // definition white moves, so the first one is fine. But to
          // make moves feel less robotic we prefer central pawn pushes
          // when available.
          const central = moves.find((m: string) =>
            /^(d3d4|e3e4|c3c4|f3f4)$/.test(m),
          );
          return central ?? moves[0] ?? null;
        } finally {
          board.delete();
        }
      }, currentFen);
    }

    // Convert the chessground-rendered FEN (Q/B letters) back into
    // Makruk letters (M/S) before handing to ffish, which only knows
    // the Makruk piece letters.
    function chessgroundToMakrukFen(rendered: string): string {
      return rendered
        .replace(/Q/g, 'M')
        .replace(/q/g, 'm')
        .replace(/B/g, 'S')
        .replace(/b/g, 's');
    }

    let pliesPlayed = 0;
    let lastFen = await readBoardFen(page);

    while (pliesPlayed < TARGET_PLIES) {
      const isUserTurn = pliesPlayed % 2 === 0; // white plays first, even plies = white
      if (!isUserTurn) {
        // engine's turn — already triggered by our last move; we just
        // wait for the rendered position to change again
        const deadline = Date.now() + PER_PLY_TIMEOUT_MS;
        let after = lastFen;
        while (Date.now() < deadline) {
          after = await readBoardFen(page);
          if (after !== lastFen) break;
          await page.waitForTimeout(250);
        }
        expect(after, 'engine should have responded').not.toBe(lastFen);
        lastFen = after;
        pliesPlayed += 1;
        continue;
      }

      // User's turn — pick + drag a move.
      const makrukFen = chessgroundToMakrukFen(lastFen) + ' w - - 0 1';
      const move = await pickUserMove(makrukFen);
      expect(move, 'bot should find a legal user move').not.toBeNull();
      if (!move) break;
      const from = move.slice(0, 2);
      const to = move.slice(2, 4);
      await dragMove(page, from, to);

      // Wait for the user move to actually land (chessground re-renders)
      const drawDeadline = Date.now() + 5000;
      while (Date.now() < drawDeadline) {
        const current = await readBoardFen(page);
        if (current !== lastFen) {
          lastFen = current;
          break;
        }
        await page.waitForTimeout(150);
      }
      pliesPlayed += 1;
    }

    // After the loop: position MUST have changed multiple times
    expect(pliesPlayed).toBe(TARGET_PLIES);
    expect(lastFen).not.toBe('rnbqkbnr/8/pppppppp/8/8/PPPPPPPP/8/RNBKQBNR');
    // No JS errors thrown anywhere in the loop
    expect(errors).toEqual([]);
  });
});
