// User rating + per-level record persisted in localStorage.
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

const STORAGE_KEY = 'openmakruk_stats';
const STATS_VERSION = 1;
const K_FACTOR = 32;

export const CPU_RATINGS: Record<Difficulty, number> = {
  easy: 800,
  medium: 1400,
  hard: 1900,
  master: 2500,
};

export type GameOutcome = 'win' | 'loss' | 'draw';

export type GameRecord = {
  outcome: GameOutcome;
  opponent: Difficulty;
  userSide: 'white' | 'black';
  date: number;
  plyCount: number;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
};

export type LevelRecord = { wins: number; losses: number; draws: number };

export type UserStats = {
  version: number;
  displayName: string; // user-chosen handle, default 'ผู้เล่น'
  createdAt: number;   // ms timestamp of first init
  rating: number;
  totalGames: number;
  byLevel: Record<Difficulty, LevelRecord>;
  history: GameRecord[]; // most recent first, capped at 50
};

const EMPTY_LEVEL: LevelRecord = { wins: 0, losses: 0, draws: 0 };

const INITIAL_STATS: UserStats = {
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

export function loadStats(): UserStats {
  if (typeof window === 'undefined') return cloneStats(INITIAL_STATS);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneStats(INITIAL_STATS);
    const parsed = JSON.parse(raw) as Partial<UserStats>;
    return {
      ...INITIAL_STATS,
      ...parsed,
      byLevel: { ...INITIAL_STATS.byLevel, ...(parsed.byLevel ?? {}) },
      history: parsed.history ?? [],
      displayName: parsed.displayName ?? INITIAL_STATS.displayName,
      createdAt: parsed.createdAt ?? INITIAL_STATS.createdAt,
    };
  } catch {
    return cloneStats(INITIAL_STATS);
  }
}

export function exportStatsJSON(stats: UserStats): string {
  return JSON.stringify(stats, null, 2);
}

export function importStatsJSON(json: string): UserStats | null {
  try {
    const parsed = JSON.parse(json) as Partial<UserStats>;
    if (typeof parsed.rating !== 'number') return null;
    return {
      ...INITIAL_STATS,
      ...parsed,
      byLevel: { ...INITIAL_STATS.byLevel, ...(parsed.byLevel ?? {}) },
      history: parsed.history ?? [],
      displayName: parsed.displayName ?? INITIAL_STATS.displayName,
      createdAt: parsed.createdAt ?? INITIAL_STATS.createdAt,
    };
  } catch {
    return null;
  }
}

export function saveStats(stats: UserStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // localStorage may be full or disabled — silently ignore for now
  }
}

export function clearStats(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
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
    history: [record, ...stats.history].slice(0, 50),
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

function cloneStats(s: UserStats): UserStats {
  return JSON.parse(JSON.stringify(s)) as UserStats;
}
