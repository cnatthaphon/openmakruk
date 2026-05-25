// Move analysis archive — store engine-computed per-move evaluations
// for finished games so the user can revisit "where did I go wrong"
// after the fact without re-running the engine each time.
//
// Today: in-memory + localStorage stash via the versioned stores
// module. Future iterations will integrate this with a richer Game
// Review viewer; the store contract stays stable.
//
// One analysis = one finished game. Re-analyzing overwrites the
// previous run for that game id.

import type { EvalScore } from './evalParser';
import { defineStore } from './stores';

const ANALYSIS_VERSION = 1;

export type MoveAnalysis = {
  /** UCI move actually played by the player on this ply. */
  played: string;
  /** Engine's recommended move(s) at this ply, in order. */
  bestLine: string[];
  /** Engine evaluation BEFORE the player's move (whose turn it is). */
  scoreBefore: EvalScore;
  /** Engine evaluation AFTER the player's move. */
  scoreAfter: EvalScore;
  /** Classification of this move (computed from delta). */
  classification:
    | 'best'        // matched the engine's top choice
    | 'good'        // close to best (within ~0.3 pawn)
    | 'inaccuracy'  // 0.3 - 1.0 pawn worse
    | 'mistake'     // 1.0 - 3.0 pawn worse
    | 'blunder';    // > 3.0 pawn worse OR throws a winning position
};

export type GameAnalysis = {
  /** Matches a stats.ts GameRecord id so we can join the two. */
  gameId: string;
  /** Generated when the analysis run completed. */
  analyzedAt: number;
  /** Per-ply analyses in order. moves[0] = first move of the game. */
  moves: MoveAnalysis[];
  /** Engine depth used for this run. */
  depth: number;
};

export type AnalysisStore = {
  /** keyed by gameId */
  analyses: Record<string, GameAnalysis>;
};

const store = defineStore<AnalysisStore>({
  key: 'openmakruk_game_analyses',
  version: ANALYSIS_VERSION,
  // Each analysis is large (move-by-move eval + PV) — easily kilobytes
  // per game. localStorage would silently fail past ~50 stored
  // analyses; durable IDB has effectively no ceiling at this scale.
  storage: 'durable',
  default: () => ({ analyses: {} }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<AnalysisStore>;
    return {
      analyses:
        obj.analyses && typeof obj.analyses === 'object' ? obj.analyses : {},
    };
  },
});

export function loadAnalysisStore(): AnalysisStore {
  return store.load();
}

export function saveAnalysisStore(s: AnalysisStore): void {
  store.save(s);
}

export function storeAnalysis(
  s: AnalysisStore,
  analysis: GameAnalysis,
): AnalysisStore {
  return { analyses: { ...s.analyses, [analysis.gameId]: analysis } };
}

export function getAnalysis(
  s: AnalysisStore,
  gameId: string,
): GameAnalysis | null {
  return s.analyses[gameId] ?? null;
}

/**
 * Classify a move by the eval delta between before/after.
 * Sign convention: delta is "how much did the position get WORSE
 * for the side that just moved". Positive = bad, 0 = neutral.
 */
export function classifyDelta(
  deltaCp: number,
  matchedBest: boolean,
): MoveAnalysis['classification'] {
  if (matchedBest) return 'best';
  if (deltaCp < 30)  return 'good';
  if (deltaCp < 100) return 'inaccuracy';
  if (deltaCp < 300) return 'mistake';
  return 'blunder';
}
