// ScoredBot — generic MakrukEngine driven by a Personality.
//
// One class powers ALL score-based bots. Differentiation is data (the
// Personality's `weights`). To add a new bot:
//   1. Append a Personality to PERSONALITIES.
//   2. registerPersonalityEngines() picks it up automatically (called
//      from this module's side-effect import).
//
// Strength tuning: the scorers themselves are simple heuristics, so
// these bots fill the 700–1100 Elo band. We deliberately do NOT call
// Fairy-Stockfish for evaluation — that would make every personality
// effectively the same strong engine. Cheap scorers = distinct play
// styles + cheap CPU per move (instant on any device).

import { loadFfish } from '../makruk';
import type { Color } from '../lessonRules';
import { registerEngine } from '../engines/registry';
import {
  DEFAULT_DIFFICULTY_PRESETS,
  type EngineCapabilities,
  type MakrukEngine,
  type SearchOpts,
  type SearchResult,
} from '../engines/types';
import { SCORERS, SCORER_KEYS, makeScorerCtx, type ScorerKey } from './scorers';
import { PERSONALITIES, type Personality } from './personalities';

// Engine id namespace: 'personality:<id>'. Keeps the engine registry
// uncluttered and lets the UI distinguish personality bots from full
// engines (Fairy-Stockfish, NNUE) for capability decisions.
export const PERSONALITY_ENGINE_PREFIX = 'personality:';

export function personalityEngineId(personalityId: string): string {
  return PERSONALITY_ENGINE_PREFIX + personalityId;
}

const CAPS: EngineCapabilities = {
  multiPV: false,
  network: null,
  difficulty: DEFAULT_DIFFICULTY_PRESETS,
  // ScoredBot evaluates each legal move with its personality weights;
  // there's no tree search. Depth has no meaning here but is required
  // by the contract — declare 1 so analysis callers don't crash on
  // an undefined.
  analysisDefaults: { depth: 1 },
};

class ScoredBot implements MakrukEngine {
  readonly id: string;
  readonly name: string;
  readonly capabilities = CAPS;

  constructor(private readonly personality: Personality) {
    this.id = personalityEngineId(personality.id);
    this.name = `${personality.emoji} ${personality.name}`;
  }

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

      const ctx = makeScorerCtx(fen, board);

      // Score each legal move by the personality's weighted scorers.
      // Use a typed-tuple array so we can sort by score then break ties
      // by a small random offset (avoids identical move every time the
      // user replays the same opening, which would feel robotic).
      const scored: { move: string; total: number }[] = legal.map((mv) => {
        let total = 0;
        for (const key of SCORER_KEYS) {
          const weight = this.personality.weights[key as ScorerKey];
          if (!weight) continue;
          const component = SCORERS[key](ctx, mv);
          total += weight * component;
        }
        return { move: mv, total };
      });

      // Tiny tiebreak jitter (~0.5% of max scorer range) so equal-top
      // moves get shuffled, not deterministic. Without this, the bot
      // would play the same move in identical positions every game.
      for (const s of scored) s.total += Math.random() * 0.005;

      scored.sort((a, b) => b.total - a.total);
      return { bestMove: scored[0].move };
    } finally {
      board.delete();
    }
  }
}

/** Build a one-shot bot for a specific personality. Used by the
 *  registry factory and by ad-hoc callers (auto-mine, gauntlet) that
 *  want to instantiate a bot without going through the registry. */
export function makeScoredBot(personality: Personality): MakrukEngine {
  return new ScoredBot(personality);
}

// ─── Side-effect registration ──────────────────────────────────────
//
// Importing this module registers EVERY personality in the catalog as
// an engine. Done once at module evaluation. The catalog is small
// (<20) so the cost is negligible.

let registered = false;
function registerPersonalityEngines(): void {
  if (registered) return;
  registered = true;
  for (const p of PERSONALITIES) {
    registerEngine({
      id: personalityEngineId(p.id),
      name: `${p.emoji} ${p.name}`,
      factory: () => makeScoredBot(p),
    });
  }
}

registerPersonalityEngines();

// Helper for downstream code that wants to know if an engine id refers
// to a personality bot (vs Fairy-Stockfish etc).
export function isPersonalityEngineId(id: string): boolean {
  return id.startsWith(PERSONALITY_ENGINE_PREFIX);
}

// re-export Color so callers don't reach into makruk for it
export type { Color };
