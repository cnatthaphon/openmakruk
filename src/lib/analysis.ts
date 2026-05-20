// Move analysis archive — store engine-computed per-move evaluations
// for finished games so the user can revisit "where did I go wrong"
// after the fact without re-running the engine each time.
//
// Today (skeleton): in-memory + localStorage stash of analysis runs.
// A future iteration will integrate this with a Game Review viewer
// on the Profile page that walks ply-by-ply showing eval delta, top
// engine move, and classification badge (best / good / inaccuracy /
// mistake / blunder).
//
// One analysis = one finished game. Re-analyzing overwrites the
// previous run for that game id.

import type { EvalScore } from './evalParser';

const STORAGE_KEY = 'openmakruk_game_analyses';

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

export function loadAnalysisStore(): AnalysisStore {
  if (typeof window === 'undefined') return { analyses: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { analyses: {} };
    return JSON.parse(raw);
  } catch {
    return { analyses: {} };
  }
}

export function saveAnalysisStore(store: AnalysisStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage quota: each analysis is ~2KB so 5MB cap = ~2500
    // games. Should be plenty for v1 — when it does start being an
    // issue, switch to IndexedDB.
  }
}

export function storeAnalysis(
  store: AnalysisStore,
  analysis: GameAnalysis,
): AnalysisStore {
  return { analyses: { ...store.analyses, [analysis.gameId]: analysis } };
}

export function getAnalysis(
  store: AnalysisStore,
  gameId: string,
): GameAnalysis | null {
  return store.analyses[gameId] ?? null;
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
