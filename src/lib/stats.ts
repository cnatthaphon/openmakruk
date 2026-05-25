// User rating + per-level record persisted in localStorage via the
// versioned stores module.
//
// Goals:
//   1. Give the user a single number that says "you're roughly at this
//      strength" so they can pick a sensible difficulty.
//   2. Track win/loss/draw per CPU level for self-awareness.
//   3. Keep it pure localStorage — no backend, PDPA-free.
//
// Rating model: vanilla Elo with K=32 and a starting rating of 1000.
// CPU ratings are calibrated against typical chess Elo (rough mapping):
//   easy   ~800   (Stockfish skill 1, depth 3 — blunders often)
//   medium ~1400  (skill 8, depth 8 — casual)
//   hard   ~1900  (skill 15, depth 14 — strong club player)
//   master ~2500  (skill 20, depth 20 — full strength, no NNUE yet)

import type { Difficulty } from './engine';
import { defineStore } from './stores';

const STATS_VERSION = 2;
const K_FACTOR = 32;

export const CPU_RATINGS: Record<Difficulty, number> = {
  easy: 800,
  medium: 1400,
  hard: 1900,
  master: 2500,
};

export type GameOutcome = 'win' | 'loss' | 'draw';

export type GameRecord = {
  /** Stable id for joining with analysis/PGN store. */
  id: string;
  outcome: GameOutcome;
  opponent: Difficulty;
  userSide: 'white' | 'black';
  date: number;
  plyCount: number;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  /** UCI move sequence — optional for back-compat with games saved
   * before the moves field was added. PGN export skips the moves
   * section for records missing this. */
  moves?: string[];
  /** Rated counted toward the user's Elo; casual didn't. Older
   * records assume rated. */
  mode?: 'rated' | 'casual';
  /** Time-control id from clock.ts. null/undefined = unlimited. */
  timeControlId?: string | null;
  /** Final FEN of the game — for resume-from-final-position. */
  finalFen?: string;
};

export type LevelRecord = { wins: number; losses: number; draws: number };

export type UserStats = {
  /** Deprecated: kept on the in-memory shape for back-compat with any
   *  caller that read it. The stores module is now the source of truth
   *  for schema version (see STATS_VERSION). */
  version: number;
  displayName: string; // user-chosen handle, default 'ผู้เล่น'
  createdAt: number;   // ms timestamp of first init
  rating: number;
  totalGames: number;
  byLevel: Record<Difficulty, LevelRecord>;
  history: GameRecord[]; // most recent first, capped at 50
};

const EMPTY_LEVEL: LevelRecord = { wins: 0, losses: 0, draws: 0 };

function initialStats(): UserStats {
  return {
    version: STATS_VERSION,
    displayName: 'ผู้เล่น',
    createdAt: Date.now(),
    rating: 1000,
    totalGames: 0,
    byLevel: {
      easy: { ...EMPTY_LEVEL },
      medium: { ...EMPTY_LEVEL },
      hard: { ...EMPTY_LEVEL },
      master: { ...EMPTY_LEVEL },
    },
    history: [],
  };
}

const store = defineStore<UserStats>({
  key: 'openmakruk_stats',
  version: STATS_VERSION,
  // Durable storage — game history is the largest growing thing in
  // the user's local state. Past releases capped history at 50 to fit
  // localStorage; that's data loss for power users. IDB-backed storage
  // removes the ceiling. Migration from prior localStorage entries
  // happens transparently on first boot (see stores.ts `hydrateKey`).
  storage: 'durable',
  default: initialStats,
  migrate: (raw) => {
    // v0 legacy: unwrapped object with its own embedded `version`
    // field. v1+: wrapped by stores.ts. Either way we merge with the
    // initial shape so newly-added fields (e.g. future stats) get
    // sane defaults without needing a per-version branch.
    const base = initialStats();
    const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<UserStats>;
    return {
      ...base,
      ...partial,
      version: STATS_VERSION,
      byLevel: { ...base.byLevel, ...(partial.byLevel ?? {}) },
      history: Array.isArray(partial.history) ? partial.history : [],
      displayName: partial.displayName ?? base.displayName,
      createdAt: partial.createdAt ?? base.createdAt,
    };
  },
});

export function loadStats(): UserStats {
  return store.load();
}

export function exportStatsJSON(stats: UserStats): string {
  return JSON.stringify(stats, null, 2);
}

export function importStatsJSON(json: string): UserStats | null {
  try {
    const parsed = JSON.parse(json) as Partial<UserStats>;
    if (typeof parsed.rating !== 'number') return null;
    const base = initialStats();
    return {
      ...base,
      ...parsed,
      version: STATS_VERSION,
      byLevel: { ...base.byLevel, ...(parsed.byLevel ?? {}) },
      history: parsed.history ?? [],
      displayName: parsed.displayName ?? base.displayName,
      createdAt: parsed.createdAt ?? base.createdAt,
    };
  } catch {
    return null;
  }
}

export function saveStats(stats: UserStats): void {
  store.save(stats);
}

export function clearStats(): void {
  store.clear();
}

/**
 * Apply a finished game to the stats record. Mutates nothing; returns a
 * fresh UserStats with the rating + per-level counters updated.
 *
 * `result` is the ffish raw result string ("1-0" / "0-1" / "1/2-1/2").
 */
export function recordGame(
  stats: UserStats,
  opponent: Difficulty,
  userSide: 'white' | 'black',
  result: string,
  plyCount: number,
): UserStats {
  const outcome = outcomeFromResult(result, userSide);
  if (outcome === null) return stats; // unknown / not a finished game

  const opponentRating = CPU_RATINGS[opponent];
  const expected =
    1 / (1 + Math.pow(10, (opponentRating - stats.rating) / 400));
  const actual = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  const delta = Math.round(K_FACTOR * (actual - expected));
  const newRating = stats.rating + delta;

  const record: GameRecord = {
    id: `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    outcome,
    opponent,
    userSide,
    date: Date.now(),
    plyCount,
    ratingBefore: stats.rating,
    ratingAfter: newRating,
    ratingDelta: delta,
  };

  const oldLevel = stats.byLevel[opponent] ?? EMPTY_LEVEL;
  const byLevel: Record<Difficulty, LevelRecord> = {
    ...stats.byLevel,
    [opponent]: {
      wins: oldLevel.wins + (outcome === 'win' ? 1 : 0),
      losses: oldLevel.losses + (outcome === 'loss' ? 1 : 0),
      draws: oldLevel.draws + (outcome === 'draw' ? 1 : 0),
    },
  };

  return {
    version: STATS_VERSION,
    displayName: stats.displayName,
    createdAt: stats.createdAt,
    rating: newRating,
    totalGames: stats.totalGames + 1,
    byLevel,
    // History is unbounded since stats.ts moved to durable (IDB-backed)
    // storage. Power users no longer lose their 51st game forever; the
    // UI is responsible for its own pagination (Profile shows the last
    // 50, but the data behind it is the full record).
    history: [record, ...stats.history],
  };
}

/** Map the rating to a sensible difficulty to play next. */
export function recommendedLevel(rating: number): Difficulty {
  if (rating < 1100) return 'easy';
  if (rating < 1650) return 'medium';
  if (rating < 2200) return 'hard';
  return 'master';
}

// ---- helpers -----------------------------------------------------------

function outcomeFromResult(
  result: string,
  userSide: 'white' | 'black',
): GameOutcome | null {
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return userSide === 'white' ? 'win' : 'loss';
  if (result === '0-1') return userSide === 'black' ? 'win' : 'loss';
  return null;
}
