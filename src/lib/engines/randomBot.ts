// Random Bot — plays a uniformly random legal move. Useful as:
//   1. An educational baseline ("how does a 0-ELO bot play?")
//   2. A tournament participant for the event/leaderboard system
//   3. A regression sanity check (engine zoo wiring works for non-
//      Fairy-Stockfish implementations)
//
// Strength: nominal ~0 Elo. Will lose to any thinking opponent on
// material grounds within ~30 plies in most starts.

import { loadFfish } from '../makruk';
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
  // Difficulty is a no-op for random — present for contract conformance
  // so the difficulty UI still renders something sane.
  difficulty: DEFAULT_DIFFICULTY_PRESETS,
};

class RandomBot implements MakrukEngine {
  readonly id = 'random-bot';
  readonly name = 'Random Bot (baseline)';
  readonly capabilities = CAPS;

  async init(): Promise<void> {
    await loadFfish(); // ensures rules engine loaded for legal-move generation
  }

  async destroy(): Promise<void> {
    // nothing to release
  }

  async search(fen: string, _opts: SearchOpts = {}): Promise<SearchResult> {
    const ffish = await loadFfish();
    const board = new ffish.Board('makruk', fen);
    try {
      const legal = board.legalMoves().split(' ').filter(Boolean);
      if (legal.length === 0) {
        return { bestMove: '0000' };
      }
      const choice = legal[Math.floor(Math.random() * legal.length)];
      return { bestMove: choice };
    } finally {
      board.delete();
    }
  }
}

registerEngine({
  id: 'random-bot',
  name: 'Random Bot (baseline)',
  factory: () => new RandomBot(),
});
