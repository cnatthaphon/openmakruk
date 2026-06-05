// Minimax baseline — second rung of the AI Lab ladder. A small,
// readable negamax with α-β pruning over a material + center-control
// evaluation. Intentionally self-contained and unclever: the Lab's
// value is a CLEAR reference implementation you can read top-to-bottom
// and compare against the random floor below it and the MCTS / NNUE
// engines above it.
//
// Registers with `research: true` (grouped under "🧪 AI Lab"). Like the
// random baseline it never feeds analysis (reviews force
// Fairy-Stockfish) and never becomes the default (registered after it).
//
// Strength ≈ a cautious beginner: depth 2 by default (opts.depth wins),
// material-aware so it won't hang pieces for free, but no tactics
// beyond the horizon and no opening book.

import { loadFfish } from '../makruk';
import { rngFromSeed } from '../seededRng';
import { staticEval } from './baselineEval';
import { registerEngine } from './registry';
import {
  DEFAULT_DIFFICULTY_PRESETS,
  type EngineCapabilities,
  type MakrukEngine,
  type SearchOpts,
  type SearchResult,
} from './types';

const DEFAULT_DEPTH = 2;
const MATE = 100_000;

type FfishBoard = {
  legalMoves: () => string;
  push: (uci: string) => boolean;
  pop: () => void;
  fen: () => string;
  isGameOver: (countRules?: boolean) => boolean;
  result: (countRules?: boolean) => string;
  delete: () => void;
};

/** Negamax with α-β. Returns the score from the side-to-move's POV. */
function negamax(board: FfishBoard, depth: number, alpha: number, beta: number): number {
  if (board.isGameOver(true)) {
    const res = board.result(true);
    // Side to move is checkmated/stalemated → from their POV it's a loss
    // (or draw). result is white-POV ('1-0'/'0-1'/'1/2-1/2').
    if (res === '1/2-1/2') return 0;
    // Whoever is to move and the game is over with a decisive result has
    // been mated → worst for them.
    return -MATE - depth;
  }
  const whiteToMove = board.fen().split(' ')[1] === 'w';
  if (depth <= 0) {
    const e = staticEval(board.fen());
    return whiteToMove ? e : -e;
  }
  const moves = board.legalMoves().split(' ').filter(Boolean);
  let best = -Infinity;
  for (const mv of moves) {
    if (!board.push(mv)) continue;
    const val = -negamax(board, depth - 1, -beta, -alpha);
    board.pop();
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // β cutoff
  }
  return best;
}

const CAPABILITIES: EngineCapabilities = {
  multiPV: false,
  network: null,
  difficulty: DEFAULT_DIFFICULTY_PRESETS,
  analysisDefaults: { depth: DEFAULT_DEPTH },
};

export class MinimaxEngine implements MakrukEngine {
  readonly id = 'lab-minimax';
  readonly name = '🧮 Minimax (baseline)';
  readonly capabilities = CAPABILITIES;

  async init(): Promise<void> {
    await loadFfish();
  }

  async destroy(): Promise<void> {
    // Stateless.
  }

  async search(fen: string, opts: SearchOpts = {}): Promise<SearchResult> {
    const depth = Math.max(1, opts.depth ?? DEFAULT_DEPTH);
    const rng = opts.seed ? rngFromSeed(opts.seed) : Math.random;
    const ffish = await loadFfish();
    const board = new ffish.Board('makruk', fen) as unknown as FfishBoard;
    try {
      const moves = board.legalMoves().split(' ').filter(Boolean);
      if (moves.length === 0) return { bestMove: '(none)' };
      let bestMove = moves[0];
      let bestVal = -Infinity;
      for (const mv of moves) {
        if (!board.push(mv)) continue;
        // Child is from the opponent's POV → negate.
        const val = -negamax(board, depth - 1, -Infinity, Infinity)
          + rng() * 0.001; // tiny deterministic-with-seed tiebreak
        board.pop();
        if (val > bestVal) {
          bestVal = val;
          bestMove = mv;
        }
      }
      // SearchResult.scoreCp is contractually from the side-to-move's POV.
      // `bestVal` already has that perspective because root child scores are
      // negated out of the opponent's POV.
      const scoreCp = Math.round(bestVal);
      return { bestMove, scoreCp, depth };
    } finally {
      board.delete();
    }
  }
}

registerEngine({
  id: 'lab-minimax',
  name: '🧮 Minimax (baseline)',
  factory: () => new MinimaxEngine(),
  research: true,
});
