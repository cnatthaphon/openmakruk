// Random baseline — the first rung of the AI Lab engine ladder
// (random → minimax → MCTS → AlphaZero). Picks a uniformly-random
// LEGAL move. Deliberately weak: it's a reference floor for measuring
// every stronger engine against, and a live proof that the
// MakrukEngine plug-in path works (write an adapter → registerEngine →
// it appears + plays, no caller changes).
//
// It registers with `research: true`, so the engine selector files it
// under the labeled "🧪 AI Lab" group rather than the real play
// engines. Post-game analysis force-routes through Fairy-Stockfish, so
// a random mover never poisons a review — that was the original reason
// the old random/greedy bots were pulled from the main dropdown.
//
// Seed-reproducible: with `opts.seed` set, identical seed + identical
// position yields an identical move (challenge / leaderboard determinism).

import { loadFfish } from '../makruk';
import { rngFromSeed } from '../seededRng';
import { registerEngine } from './registry';
import {
  DEFAULT_DIFFICULTY_PRESETS,
  type EngineCapabilities,
  type MakrukEngine,
  type SearchOpts,
  type SearchResult,
} from './types';

const CAPABILITIES: EngineCapabilities = {
  multiPV: false,
  network: null,
  // Strength doesn't vary with difficulty (it's random), but the field
  // is required; reuse the standard presets so callers stay uniform.
  difficulty: DEFAULT_DIFFICULTY_PRESETS,
  // Never actually consulted — analysis routes through Fairy-Stockfish.
  analysisDefaults: { depth: 1 },
};

export class RandomEngine implements MakrukEngine {
  readonly id = 'lab-random';
  readonly name = '🎲 Random (baseline)';
  readonly capabilities = CAPABILITIES;

  async init(): Promise<void> {
    await loadFfish();
  }

  async destroy(): Promise<void> {
    // Stateless — nothing to release.
  }

  async search(fen: string, opts: SearchOpts = {}): Promise<SearchResult> {
    const rng = opts.seed ? rngFromSeed(opts.seed) : Math.random;
    const ffish = await loadFfish();
    const board = new ffish.Board('makruk', fen);
    try {
      const moves = board.legalMoves().split(' ').filter(Boolean);
      if (moves.length === 0) return { bestMove: '(none)' };
      const idx = Math.floor(rng() * moves.length);
      return { bestMove: moves[idx] };
    } finally {
      board.delete();
    }
  }
}

registerEngine({
  id: 'lab-random',
  name: '🎲 Random (baseline)',
  factory: () => new RandomEngine(),
  research: true,
});
