// Greedy Bot — captures whenever possible, otherwise random.
//
// Heuristic:
//   1. Look at all legal moves; check which ones land on an enemy
//      piece (capture). Score each capture by the piece value at
//      the destination (from chessAttacks.PIECE_VALUE).
//   2. If captures exist, pick the highest-value capture.
//   3. If no captures, pick a random legal move.
//
// Strength: roughly "club beginner who sees free pieces but no plan".
// Loses material trades because doesn't evaluate after-capture state.
// Useful as a step up from Random Bot and a fun tournament opponent.

import { loadFfish, fenToPieceMap } from '../makruk';
import { PIECE_VALUE, letterToPiece } from '../chessAttacks';
import type {
  EngineCapabilities,
  MakrukEngine,
  SearchOpts,
  SearchResult,
} from './types';
import { DEFAULT_DIFFICULTY_PRESETS } from './types';
import { registerEngine } from './registry';

const CAPS: EngineCapabilities = {
  multiPV: false,
  network: null,
  difficulty: DEFAULT_DIFFICULTY_PRESETS,
};

class GreedyBot implements MakrukEngine {
  readonly id = 'greedy-bot';
  readonly name = 'Greedy Bot (จับฟรีอย่างเดียว)';
  readonly capabilities = CAPS;

  async init(): Promise<void> {
    await loadFfish();
  }

  async destroy(): Promise<void> {
    // nothing to release
  }

  async search(fen: string, _opts: SearchOpts = {}): Promise<SearchResult> {
    const ffish = await loadFfish();
    const board = new ffish.Board('makruk', fen);
    try {
      const legal = board.legalMoves().split(' ').filter(Boolean);
      if (legal.length === 0) return { bestMove: '0000' };

      const pieceMap = fenToPieceMap(fen);
      // For each legal move, check if the destination square has an
      // enemy piece. Score that capture by piece value.
      const captures: { move: string; value: number }[] = [];
      for (const mv of legal) {
        const to = mv.slice(2, 4);
        const targetLetter = pieceMap[to];
        if (!targetLetter) continue;
        const piece = letterToPiece(targetLetter);
        if (!piece) continue;
        captures.push({ move: mv, value: PIECE_VALUE[piece.role] ?? 1 });
      }

      if (captures.length > 0) {
        // Sort by value descending; pick the best.
        captures.sort((a, b) => b.value - a.value);
        return { bestMove: captures[0].move };
      }

      // No captures available — random legal move.
      const choice = legal[Math.floor(Math.random() * legal.length)];
      return { bestMove: choice };
    } finally {
      board.delete();
    }
  }
}

registerEngine({
  id: 'greedy-bot',
  name: 'Greedy Bot (จับฟรีอย่างเดียว)',
  factory: () => new GreedyBot(),
});
