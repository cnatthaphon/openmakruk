// LocalPuzzleRepository — the persistence boundary for promoted
// candidates. Writes to the existing user puzzle store, preserving
// every guarantee the current authoring flow gives:
//   - engine verification before save (verifyAndAnnotate)
//   - server mirror via the existing saveUserPuzzle publish path
//
// This is the impure tail of the pipeline. It deepens a candidate's
// solution for multi-move (mate-in-N) puzzles via a bounded PV walk —
// kept here (lazy, at promote time) so the upstream analysis stays
// cheap and the pure extractor never needs an engine.
//
// A future ServerPuzzleRepository can implement the same interface
// (POST /api/puzzles/promote) without any caller change.

import { searchBestMove } from '../engine';
import { loadFfish } from '../makruk';
import { verifyAndAnnotate } from '../puzzleVerifier';
import { newUserPuzzleId, saveUserPuzzle } from '../userPuzzles';
import { log } from '../log';
import type { PuzzleCategory } from '../puzzleSchema';
import type { PromoteResult, PuzzleCandidate, PuzzleRepository } from './contracts';

const DEEPEN_DEPTH = 14;

/** How many plies a category's stored solution should hold. */
function solutionPlyTarget(category: PuzzleCategory): number {
  if (category === 'mate-2') return 3; // user, opp, user
  return 1; // mate-1 + tactic = single best move
}

/**
 * Extend a seed solution to the category's ply target by walking the
 * engine PV. The seed's first move is assumed legal at fenBefore (the
 * runtime produced it); we apply it, then ask the engine for the best
 * reply repeatedly. Bounded by `target`. Returns the full UCI line.
 */
async function deepenSolution(
  fenBefore: string,
  seed: string[],
  target: number,
): Promise<string[]> {
  if (seed.length >= target) return seed.slice(0, target);
  const ffish = await loadFfish();
  const board = new ffish.Board('makruk', fenBefore);
  const line: string[] = [];
  try {
    const first = seed[0];
    if (!first || !board.legalMoves().split(' ').includes(first)) {
      throw new Error(`seed move ${first ?? '(none)'} illegal at fenBefore`);
    }
    board.push(first);
    line.push(first);
    while (line.length < target) {
      if (board.isGameOver()) break;
      const res = await searchBestMove(board.fen(), { depth: DEEPEN_DEPTH });
      const mv = res.bestMove;
      if (!mv || mv === '(none)' || mv === '0000') break;
      if (!board.legalMoves().split(' ').includes(mv)) break;
      board.push(mv);
      line.push(mv);
    }
  } finally {
    board.delete();
  }
  return line;
}

function buildPrompt(candidate: PuzzleCandidate): string {
  if (candidate.promptSeed) return candidate.promptSeed;
  const sideTh = candidate.sideToMove === 'white' ? 'ขาว' : 'ดำ';
  const moveLabel = Math.ceil(candidate.sourcePly / 2);
  const goal =
    candidate.category === 'mate-1' || candidate.category === 'mate-2'
      ? 'หารุกจน'
      : 'หาตาที่ดีที่สุด';
  return `${sideTh}เดิน · ตำแหน่งจากเกมของคุณ (ตา ${moveLabel}) · ${goal}`;
}

export class LocalPuzzleRepository implements PuzzleRepository {
  async promote(
    candidate: PuzzleCandidate,
    opts: { authorName?: string; visibility?: PuzzleCandidate['visibility'] } = {},
  ): Promise<PromoteResult> {
    const target = solutionPlyTarget(candidate.category);
    let solution: string[];
    try {
      solution = await deepenSolution(candidate.fenBefore, candidate.solution, target);
    } catch (err) {
      return { ok: false, reason: `solution deepen failed: ${String(err)}` };
    }
    if (solution.length === 0) {
      return { ok: false, reason: 'empty solution after deepen' };
    }

    const verified = await verifyAndAnnotate({
      id: newUserPuzzleId(),
      fen: candidate.fenBefore,
      category: candidate.category,
      rating: candidate.ratingEstimate,
      toMove: candidate.sideToMove,
      solution,
      prompt: buildPrompt(candidate),
      themes: [
        'mined-from-game',
        'review-pipeline',
        candidate.severity,
        ...candidate.motifs,
      ],
      authorName: opts.authorName ?? 'ผู้เล่น',
    });
    if (!verified.ok) {
      log('reviewPipeline.promote.verifyFailed', {
        sourceGameId: candidate.sourceGameId,
        sourcePly: candidate.sourcePly,
        reason: verified.reason,
      });
      return { ok: false, reason: verified.reason };
    }

    saveUserPuzzle(verified.puzzle);
    const visibility = opts.visibility ?? candidate.visibility;
    log('reviewPipeline.promote.saved', {
      id: verified.puzzle.id,
      category: candidate.category,
      plies: solution.length,
      visibility,
    });
    return { ok: true, id: verified.puzzle.id, visibility };
  }
}

/** Singleton — the default local repository the facade hands out. */
export const localPuzzleRepository = new LocalPuzzleRepository();
