// Puzzle miner — convert "key moments" from a Game Report into
// user puzzles automatically.
//
// Source signal: an AnnotatedMove with classification === 'mistake'
// or 'blunder' is a position where the user played a move significantly
// worse than the engine's pick. The engine's recommended move at that
// position is a real teaching moment — the user can practice "what
// SHOULD I have played?" on demand later.
//
// Mining flow:
//   1. Take a key moment's fenBefore + bestMove.
//   2. Walk the engine forward a few plies to get the full PV (so the
//      puzzle has the right solution length for its category).
//   3. Pick a category from the eval at fenBefore:
//        mate-in-1 → category 'mate-1', solution = [bestMove]
//        mate-in-N → category 'mate-2', solution = [bestMove, ...PV]
//        otherwise → category 'tactic', solution = [bestMove]
//   4. Run the existing puzzleVerifier to confirm; on pass, save to
//      openmakruk_user_puzzles via the existing store.
//
// Why "tactic" as default: positions in mid-game where the user
// blundered aren't necessarily forced mate — they're tactical
// opportunities. 1-move tactic puzzles ("find the best move here")
// are perfectly valid practice content.

import { searchBestMove } from './engine';
import { loadFfish } from './makruk';
import type { AnnotatedMove } from './review';
import { newUserPuzzleId, saveUserPuzzle } from './userPuzzles';
import { verifyAndAnnotate } from './puzzleVerifier';
import type { PuzzleCategory, UserPuzzle } from './puzzleSchema';
import { log } from './log';

export type MinedPuzzleResult =
  | { ok: true; puzzle: UserPuzzle }
  | { ok: false; reason: string };

/**
 * Take one annotated move + the user's display name and turn it into
 * a saved user puzzle. The save happens inside this function via the
 * existing user-puzzle store; the caller just needs the result for
 * toast/UI feedback.
 *
 * The "depth" parameter caps how deep we walk the PV. 6 is enough
 * for mate-in-3 setups; tactic puzzles end at 1.
 */
export async function mineMoveIntoPuzzle(
  move: AnnotatedMove,
  authorName: string,
): Promise<MinedPuzzleResult> {
  if (move.classification !== 'mistake' && move.classification !== 'blunder' && move.classification !== 'inaccuracy') {
    return { ok: false, reason: 'only mistakes/blunders/inaccuracies are mine-worthy' };
  }

  const toMove: 'white' | 'black' = move.side;
  const mateIn = move.evalBefore.mateIn;

  // Decide category + how many moves to mine
  let category: PuzzleCategory;
  let plyTarget: number;
  if (mateIn !== undefined && Math.abs(mateIn) <= 3) {
    category = Math.abs(mateIn) === 1 ? 'mate-1' : 'mate-2';
    plyTarget = Math.abs(mateIn) * 2 - 1; // mate-in-N = 2N-1 plies (user-opp-user...-user)
  } else {
    category = 'tactic';
    plyTarget = 1; // single-move "find the best move" puzzle
  }

  // Walk the PV starting from fenBefore. Use engine repeatedly so
  // we don't need multi-PV from the original search.
  let solution: string[];
  try {
    solution = await walkPV(move.fenBefore, move.bestMove, plyTarget);
  } catch (err) {
    return { ok: false, reason: `PV walk failed: ${String(err)}` };
  }

  const rating = estimateRating(move, category);
  const prompt = makePrompt(move, category);

  // Verify via existing verifier
  const verified = await verifyAndAnnotate({
    id: newUserPuzzleId(),
    fen: move.fenBefore,
    category,
    rating,
    toMove,
    solution,
    prompt,
    themes: ['mined-from-game', 'auto-generated', move.classification],
    authorName,
  });
  if (!verified.ok) {
    log('puzzleMiner.verifyFailed', { reason: verified.reason });
    return { ok: false, reason: verified.reason };
  }

  saveUserPuzzle(verified.puzzle);
  log('puzzleMiner.saved', { id: verified.puzzle.id, category, plies: solution.length });
  return { ok: true, puzzle: verified.puzzle };
}

/**
 * Starting from `fen` after `firstMove`, ask the engine for the best
 * line up to `plyTarget` total plies. Returns [firstMove, reply1, m2,
 * reply2, ...] — alternating user and opponent moves.
 */
async function walkPV(fen: string, firstMove: string, plyTarget: number): Promise<string[]> {
  const ffish = await loadFfish();
  const board = new ffish.Board('makruk', fen);
  const solution: string[] = [];
  try {
    // Apply first move
    if (!board.legalMoves().split(' ').includes(firstMove)) {
      throw new Error(`firstMove ${firstMove} illegal at fenBefore`);
    }
    board.push(firstMove);
    solution.push(firstMove);

    // Walk forward
    while (solution.length < plyTarget) {
      if (board.isGameOver()) break;
      const result = await searchBestMove(board.fen(), { depth: 14 });
      if (!result.bestMove || result.bestMove === '(none)' || result.bestMove === '0000') break;
      if (!board.legalMoves().split(' ').includes(result.bestMove)) break;
      board.push(result.bestMove);
      solution.push(result.bestMove);
    }
  } finally {
    board.delete();
  }
  return solution;
}

function estimateRating(move: AnnotatedMove, category: PuzzleCategory): number {
  // Heuristic: bigger blunders = "easier to spot in retrospect" = lower rating
  // (since the engine recommendation is more obvious). Smaller deltas =
  // harder puzzles. Clamp to sensible range.
  if (category === 'mate-1') return 800;
  if (category === 'mate-2') return 1100;
  // tactic: scale by delta. >300cp = rating 600, <100cp = rating 1200
  const cp = move.delta;
  if (cp >= 300) return 700;
  if (cp >= 150) return 900;
  if (cp >= 75) return 1100;
  return 1300;
}

function makePrompt(move: AnnotatedMove, category: PuzzleCategory): string {
  const sideTh = move.side === 'white' ? 'ขาว' : 'ดำ';
  const moveLabel = move.ply % 2 === 1 ? Math.ceil(move.ply / 2) : Math.ceil(move.ply / 2);
  if (category === 'mate-1' || category === 'mate-2') {
    return `${sideTh}เดิน · ตำแหน่งจากเกมของคุณ (ตา ${moveLabel}) · หารุกจน`;
  }
  return `${sideTh}เดิน · ตำแหน่งจากเกมของคุณ (ตา ${moveLabel}) · หาตาที่ดีที่สุด`;
}
