// Public engine facade. All callers (App.tsx, review.ts, etc.) go
// through this module instead of importing a concrete engine. Under
// the hood every call routes to the active engine in the registry, so
// dropping in a new engine (an AlphaZero, a Random baseline, a future
// NNUE-only build) requires only registering it — no caller code change.
//
// The exported names + signatures here match the pre-refactor API so
// existing imports across the codebase keep working. New code can
// instead consume `./engines/types` + `./engines/registry` directly.

import {
  getActiveEngine,
  getActiveEngineSync,
} from './engines/registry';
import {
  DEFAULT_DIFFICULTY_PRESETS,
  type AnalysisLine,
  type DifficultyLevel,
  type ProgressCb,
  type SearchOpts,
  type SearchResult,
} from './engines/types';

// Side-effect import: registers Fairy-Stockfish as the default engine.
// Importing the module is what calls registerEngine() at its bottom.
import './engines/fairyStockfish';
// Random-bot and Greedy-bot baselines REMOVED — they masked real bugs
// (e.g. review.ts grading a game with Random Bot returned "no
// blunders" because random can't see threats; users defaulted to
// random-bot after onboarding and never realised every game was a
// nonsense shuffle). All "fallback" engines now go through
// Fairy-Stockfish or the 7 personality bots — if something can't load
// a real engine, surface the error instead of producing garbage.
import './personalities/scoredBot';

// ---- Re-exports (backward compat) -------------------------------------

export type { SearchOpts, SearchResult, AnalysisLine, ProgressCb };
export type Difficulty = DifficultyLevel;

// UI labels live here because they're the Thai display strings the Play
// / Profile pages render; the engine itself doesn't care about labels.
export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy:   'ง่าย',
  medium: 'ปานกลาง',
  hard:   'ยาก',
  master: 'ระดับมาสเตอร์',
};

// Default UCI-style mapping. Most callers read this synchronously to
// pick search options before calling searchBestMove(). When/if the
// active engine has a different difficulty mapping, prefer
// `(await getActiveEngine()).capabilities.difficulty` instead.
export const DIFFICULTY_PRESETS = DEFAULT_DIFFICULTY_PRESETS;

// ---- Registry surface (new public API) --------------------------------

export {
  getActiveEngine,
  getActiveEngineSync,
  getActiveEngineId,
  listEngines,
  setActiveEngine,
} from './engines/registry';

// ---- Routed calls -----------------------------------------------------

export async function searchBestMove(
  fen: string,
  opts: SearchOpts = {},
): Promise<SearchResult> {
  const engine = await getActiveEngine();
  return engine.search(fen, opts);
}

export async function searchTopMoves(
  fen: string,
  opts: SearchOpts = {},
  multipv: number = 3,
): Promise<AnalysisLine[]> {
  const engine = await getActiveEngine();
  if (engine.capabilities.multiPV && engine.searchMulti) {
    return engine.searchMulti(fen, opts, multipv);
  }
  // Fallback: surface the single best move as a one-line list so callers
  // (the Analyze panel) still render something coherent.
  const r = await engine.search(fen, opts);
  return [
    {
      multipv: 1,
      depth: r.depth ?? 0,
      scoreCp: r.scoreCp,
      mateIn: r.mateIn,
      pv: [r.bestMove],
    },
  ];
}

export async function loadNNUE(
  url?: string,
  onProgress?: ProgressCb,
): Promise<void> {
  const engine = await getActiveEngine();
  // Engines without a loadable network just silently no-op — the UI
  // toggle should hide itself by checking capabilities.network first.
  if (!engine.loadNetwork) return;
  await engine.loadNetwork(url, onProgress);
}

/**
 * Synchronous "is the network active right now?" used by React renders.
 * Returns false until the engine has finished init and (separately)
 * loaded its network, which is the conservative answer either way —
 * callers fall through to the "load NNUE" UI in both states.
 */
export function isNNUELoaded(): boolean {
  const engine = getActiveEngineSync();
  return engine?.isNetworkLoaded?.() ?? false;
}

/** Clear the on-disk cache for the active engine's network blob. */
export async function clearCachedNNUE(): Promise<void> {
  const engine = await getActiveEngine();
  if (!engine.clearNetworkCache) return;
  await engine.clearNetworkCache();
}
