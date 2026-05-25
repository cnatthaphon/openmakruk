// Auto content factory — simulate bot-vs-bot games and mine
// blunders/tactical opportunities into user puzzles.
//
// Pattern: lichess auto-mines its 4M+ puzzle pool from rated human
// games + Stockfish analysis. We do the same thing in miniature: run
// a weaker bot (Greedy) against the strong engine (Fairy-Stockfish),
// then analyze each position. When the weak bot blunders, the strong
// engine knows the punishment — that's a puzzle.
//
// Runtime cost: ~30 sec per game at depth 10. The UI runs N games
// in sequence with progress callbacks so the user sees something
// happening. All work happens client-side; no server needed.
//
// Why bot-vs-bot vs miner-from-user-games (which we already have):
//   - User games are limited to what the user actually plays (slow
//     content growth).
//   - Bot games scale linearly with compute. 100 games = 100s of
//     candidate puzzles. Filter for quality.
//   - Pre-seeded games can be checked in to /content/puzzles for
//     all users; user-mined stays personal.

import { getActiveEngine, setActiveEngine, getActiveEngineId, searchBestMove } from './engine';
import { loadFfish } from './makruk';
import { newUserPuzzleId, saveUserPuzzle } from './userPuzzles';
import { verifyAndAnnotate } from './puzzleVerifier';
import { log } from './log';

const MAX_PLIES_PER_GAME = 60;
const BLUNDER_THRESHOLD_CP = 200;
// Fallback used only if the strong engine somehow surfaces without
// declaring `analysisDefaults`. Registered engines all declare this.
const FALLBACK_STRONG = { depth: 10 } as const;
// Weak side gets a shallower budget so it produces blunders we can
// actually mine. Hardcoded here (rather than read from the weak
// engine's capabilities) because the whole point of mining is to
// make the weak side play worse than its full strength.
const WEAK_DEPTH = 4;

export type MineProgress = {
  game: number;
  totalGames: number;
  ply: number;
  status: 'simulating' | 'analyzing' | 'mining' | 'done';
  minedCount: number;
};

export type MineResult = {
  minedCount: number;
  games: number;
  totalPlies: number;
  skipped: string[];
};

/**
 * Run `numGames` bot-vs-bot matches between `weakBotId` and
 * `strongBotId`. After each game, analyze every position with the
 * strong engine and detect eval swings > BLUNDER_THRESHOLD_CP. Mine
 * those into user puzzles.
 *
 * Progress callback fires often so the UI can show a spinner with
 * "game 3/10, ply 18". Caller can ignore.
 *
 * Returns the count of puzzles successfully saved.
 */
export async function autoMineFromBots(
  weakBotId: string,
  strongBotId: string,
  numGames: number,
  authorName: string,
  onProgress?: (p: MineProgress) => void,
): Promise<MineResult> {
  const ffish = await loadFfish();
  const originalEngineId = getActiveEngineId();
  let minedCount = 0;
  let totalPlies = 0;
  const skipped: string[] = [];

  // Discover the strong engine's preferred analysis budget. This
  // replaces the hardcoded `{ depth: 10 }` so a future MCTS engine
  // chosen as the "strong" side can request `{ nodes: N }` instead.
  await setActiveEngine(strongBotId);
  const strongEngine = await getActiveEngine();
  const strongOpts = strongEngine.capabilities.analysisDefaults ?? FALLBACK_STRONG;

  try {
    for (let gameIdx = 0; gameIdx < numGames; gameIdx++) {
      onProgress?.({ game: gameIdx + 1, totalGames: numGames, ply: 0, status: 'simulating', minedCount });

      // Simulate game: alternate engines per move starting with weak as white.
      const board = new ffish.Board('makruk');
      const fenHistory: string[] = [board.fen()];
      const moveHistory: string[] = [];
      const evalBefore: { scoreCp?: number; mateIn?: number }[] = [];

      try {
        for (let ply = 0; ply < MAX_PLIES_PER_GAME; ply++) {
          if (board.isGameOver()) break;
          // White (ply even) = weak bot; black (ply odd) = strong bot.
          // Alternate roles each game so we mine both sides' blunders.
          const useWeak = (ply % 2 === 0) === (gameIdx % 2 === 0);
          const engineId = useWeak ? weakBotId : strongBotId;
          await setActiveEngine(engineId);
          const engine = await getActiveEngine();
          const result = await engine.search(board.fen(), useWeak ? { depth: WEAK_DEPTH } : strongOpts);
          if (!result.bestMove || result.bestMove === '(none)' || result.bestMove === '0000') break;
          const legal = board.legalMoves().split(' ');
          if (!legal.includes(result.bestMove)) break;

          // BEFORE we push: get the strong engine's eval at this
          // position (we already have it if strong just searched).
          // Otherwise re-search briefly to get baseline.
          if (useWeak) {
            // weak bot is about to play. Get strong-engine eval of
            // the position BEFORE the weak move.
            await setActiveEngine(strongBotId);
            const baseline = await searchBestMove(board.fen(), strongOpts);
            evalBefore.push({ scoreCp: baseline.scoreCp, mateIn: baseline.mateIn });
            await setActiveEngine(weakBotId);
          } else {
            evalBefore.push({ scoreCp: result.scoreCp, mateIn: result.mateIn });
          }

          board.push(result.bestMove);
          moveHistory.push(result.bestMove);
          fenHistory.push(board.fen());

          totalPlies++;
          if (ply % 4 === 0) {
            onProgress?.({ game: gameIdx + 1, totalGames: numGames, ply, status: 'simulating', minedCount });
          }
        }

        // ─── Mining phase: walk history, detect swings ──────────
        onProgress?.({ game: gameIdx + 1, totalGames: numGames, ply: 0, status: 'analyzing', minedCount });

        for (let i = 0; i < moveHistory.length; i++) {
          const before = evalBefore[i];
          const after = i + 1 < evalBefore.length ? evalBefore[i + 1] : null;
          if (!before || !after) continue;

          // Eval is from side-to-move's POV at each position. After a
          // move, side-to-move flips, so we negate `after` to compare
          // on the SAME side's POV as `before`.
          const beforeCp = scoreToCp(before);
          const afterCp = -scoreToCp(after);
          const delta = beforeCp - afterCp;

          // We want positions where THE SIDE THAT JUST MOVED lost
          // material (delta is positive = their position got worse).
          if (delta < BLUNDER_THRESHOLD_CP) continue;
          // Skip if both sides have <= ~10cp eval (drawish): not
          // interesting puzzles.
          if (Math.abs(beforeCp) > 1500) continue; // mate-in-1 type — handled differently

          // Mine the position BEFORE the blunder. Side-to-move is
          // the side that's ABOUT to make the wrong move; the puzzle
          // is from THEIR perspective: "find the right move".
          // We need: fen, bestMove (engine's #1), the optimal line.
          const fenBeforeBlunder = fenHistory[i];
          await setActiveEngine(strongBotId);
          const analysis = await searchBestMove(fenBeforeBlunder, strongOpts);
          if (!analysis.bestMove || analysis.bestMove === '(none)') continue;

          const tmp = new ffish.Board('makruk', fenBeforeBlunder);
          try {
            if (!tmp.legalMoves().split(' ').includes(analysis.bestMove)) continue;
            const toMove: 'white' | 'black' = tmp.turn() ? 'white' : 'black';

            // Build single-move "find the best move" puzzle. For
            // mate positions, we'd want longer PV; the regular miner
            // handles that — auto-mine sticks to 1-move tactics for
            // simplicity.
            const rating = ratingForDelta(delta);
            const verified = await verifyAndAnnotate({
              id: newUserPuzzleId(),
              fen: fenBeforeBlunder,
              category: 'tactic',
              rating,
              toMove,
              solution: [analysis.bestMove],
              prompt: `${toMove === 'white' ? 'ขาว' : 'ดำ'}เดิน · auto-mined จาก bot game · หาตาที่ดีที่สุด`,
              themes: ['auto-mined', 'bot-game', `delta-${Math.floor(delta / 100) * 100}`],
              authorName,
            });
            if (!verified.ok) {
              skipped.push(`game ${gameIdx + 1} ply ${i + 1}: ${verified.reason}`);
              continue;
            }
            saveUserPuzzle(verified.puzzle);
            minedCount++;
            onProgress?.({ game: gameIdx + 1, totalGames: numGames, ply: i + 1, status: 'mining', minedCount });
          } finally {
            tmp.delete();
          }
        }
      } finally {
        board.delete();
      }
    }
  } finally {
    // Restore the user's original engine choice so we don't leave them
    // playing against a bot they didn't pick.
    if (originalEngineId) {
      await setActiveEngine(originalEngineId).catch(() => undefined);
    }
  }

  onProgress?.({ game: numGames, totalGames: numGames, ply: 0, status: 'done', minedCount });
  log('autoMine.complete', { minedCount, games: numGames, totalPlies, skipped: skipped.length });
  return { minedCount, games: numGames, totalPlies, skipped };
}

function scoreToCp(e: { scoreCp?: number; mateIn?: number }): number {
  if (e.mateIn !== undefined) {
    return e.mateIn > 0 ? 10000 : -10000;
  }
  return e.scoreCp ?? 0;
}

function ratingForDelta(deltaCp: number): number {
  if (deltaCp >= 800) return 600;  // huge blunder = obvious win = easy puzzle
  if (deltaCp >= 400) return 800;
  if (deltaCp >= 250) return 1000;
  return 1200;
}
