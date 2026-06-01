// User rating + per-level record persisted via the versioned stores
// module. Backed by IndexedDB (durable storage; see stores.ts) so
// history grows without the 5MB localStorage ceiling.
//
// Goals:
//   1. Give the user a single number that says "you're roughly at this
//      strength" so they can pick a sensible difficulty.
//   2. Track win/loss/draw per CPU level for self-awareness.
//   3. Default is offline-only — no data leaves the device. When the
//      user enables ☁️ Cloud Sync, recordGame() also POSTs to the
//      worker so leaderboard + multi-device sync work. PDPA scope
//      stays minimal: only display name + game outcomes leave; no
//      email / phone / IP retention.
//
// Rating model: vanilla Elo with K=32 and a starting rating of 1000.
// CPU ratings are calibrated against typical chess Elo (rough mapping):
//   easy   ~800   (Stockfish skill 1, depth 3 — blunders often)
//   medium ~1400  (skill 8, depth 8 — casual)
//   hard   ~1900  (skill 15, depth 14 — strong club player)
//   master ~2500  (skill 20, depth 20 — full strength, no NNUE yet)

import type { Difficulty } from './engine';
import { defineStore } from './stores';

const STATS_VERSION = 3;
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
  /**
   * Tombstones — ids the user deleted locally. The merge-from-server
   * sync filters these out AND retries the server-side DELETE, so a
   * failed cloud DELETE cannot resurrect the row on the next pull.
   *
   * Bounded growth: once syncHistoryFromServer successfully deletes
   * the row server-side, the tombstone is dropped. Offline-forever
   * users accumulate at most one tombstone per deleted game; cheap
   * compared to the history they already store.
   */
  deletedIds: string[];
};

/**
 * Caller-supplied context for `recordGame`. We pass an options bag
 * (not positional args) because the list of things a finished game
 * needs to persist has grown — moves, final FEN, time control, rated
 * vs casual — and a positional signature would silently drop any
 * field a caller forgot. The options form makes the contract
 * inspectable in one place and the missing fields obvious at the
 * call site.
 *
 * Why each field is here:
 *   - moves        — required for in-app replay (issue #21). Without
 *                    them, the per-row ▶ button is disabled.
 *   - finalFen     — game-resume + sanity-check that the recorded
 *                    move sequence matches what the engine ended on.
 *   - timeControlId — the rated-vs-casual decision is independent of
 *                    time control, so we store both.
 *   - mode         — 'rated' applies Elo + counts toward `byLevel`;
 *                    'casual' adds the record to history with zero
 *                    rating delta. Casual was previously skipped
 *                    entirely; that left casual games invisible in
 *                    the local replay surface even though the cloud
 *                    backend persisted them.
 */
export type RecordGameOptions = {
  opponent: Difficulty;
  userSide: 'white' | 'black';
  /** ffish raw result string: '1-0' / '0-1' / '1/2-1/2'. */
  result: string;
  plyCount: number;
  moves?: string[];
  finalFen?: string;
  timeControlId?: string | null;
  mode?: 'rated' | 'casual';
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
    deletedIds: [],
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
    // field. v1+: wrapped by stores.ts. v3 added `deletedIds` (issue
    // #21 — cloud delete tombstones). Either way we merge with the
    // initial shape so newly-added fields get sane defaults without
    // needing a per-version branch.
    const base = initialStats();
    const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<UserStats>;
    return {
      ...base,
      ...partial,
      version: STATS_VERSION,
      byLevel: { ...base.byLevel, ...(partial.byLevel ?? {}) },
      history: Array.isArray(partial.history) ? partial.history : [],
      deletedIds: Array.isArray(partial.deletedIds) ? partial.deletedIds : [],
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
      deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
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
 * Apply a finished game to the stats record. Mutates nothing; returns
 * a fresh UserStats with the rating + per-level counters updated AND
 * a full GameRecord (including moves + finalFen + timeControlId)
 * inserted at the head of `history`.
 *
 * Rating math runs ONLY when `mode === 'rated'` (the default). Casual
 * games still produce a history row so the user can replay them; the
 * row carries `ratingDelta: 0` and the by-level counters stay put.
 *
 * Returns the input stats unchanged if the result string doesn't
 * decode to an outcome (e.g. game-in-progress called by accident).
 */
export function recordGame(stats: UserStats, opts: RecordGameOptions): UserStats {
  const outcome = outcomeFromResult(opts.result, opts.userSide);
  if (outcome === null) return stats; // unknown / not a finished game

  const mode = opts.mode ?? 'rated';

  // Rating math is rated-only. Casual writes 0 delta and leaves the
  // by-level counters untouched.
  let delta = 0;
  let newRating = stats.rating;
  if (mode === 'rated') {
    const opponentRating = CPU_RATINGS[opts.opponent];
    const expected =
      1 / (1 + Math.pow(10, (opponentRating - stats.rating) / 400));
    const actual = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
    delta = Math.round(K_FACTOR * (actual - expected));
    newRating = stats.rating + delta;
  }

  const record: GameRecord = {
    id: `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    outcome,
    opponent: opts.opponent,
    userSide: opts.userSide,
    date: Date.now(),
    plyCount: opts.plyCount,
    ratingBefore: stats.rating,
    ratingAfter: newRating,
    ratingDelta: delta,
    moves: opts.moves,
    mode,
    timeControlId: opts.timeControlId ?? undefined,
    finalFen: opts.finalFen,
  };

  // By-level counters move only for rated games; casual stays unrated.
  const oldLevel = stats.byLevel[opts.opponent] ?? EMPTY_LEVEL;
  const byLevel: Record<Difficulty, LevelRecord> =
    mode === 'rated'
      ? {
          ...stats.byLevel,
          [opts.opponent]: {
            wins: oldLevel.wins + (outcome === 'win' ? 1 : 0),
            losses: oldLevel.losses + (outcome === 'loss' ? 1 : 0),
            draws: oldLevel.draws + (outcome === 'draw' ? 1 : 0),
          },
        }
      : stats.byLevel;

  return {
    ...stats,
    version: STATS_VERSION,
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

/**
 * Remove one game from the user's history by id. Returns a fresh
 * UserStats with the row stripped, the per-level + total counters
 * decremented, AND the id appended to `deletedIds`.
 *
 * The tombstone is the durable bit: even if the local row is gone, a
 * later `syncHistoryFromServer` would naïvely re-introduce the row
 * from the server. `deletedIds` lets the sync filter it out AND
 * retry the server-side DELETE until it succeeds.
 *
 * Rating is NOT recalculated — historical Elo math is monotonic in
 * event-order and we can't "un-apply" a single match without
 * re-running every game that came after it.
 *
 * Idempotent: deleting an id that's no longer in history returns the
 * input stats unchanged (but does NOT add another tombstone — the id
 * is either already in `deletedIds` from a previous call, or was
 * never there to begin with).
 */
export function removeGameRecord(stats: UserStats, id: string): UserStats {
  const idx = stats.history.findIndex((g) => g.id === id);
  if (idx < 0) return stats;
  const removed = stats.history[idx];
  const history = [
    ...stats.history.slice(0, idx),
    ...stats.history.slice(idx + 1),
  ];

  // Decrement the matching by-level bucket. Guard against unknown
  // opponents (e.g. a hand-edited import with a stale enum value) by
  // treating a missing bucket as zero — never let counters go negative.
  // Casual games (mode === 'casual') never incremented the bucket on
  // the way in, so they don't decrement on the way out either.
  const isRated = removed.mode !== 'casual';
  const bucket = stats.byLevel[removed.opponent] ?? EMPTY_LEVEL;
  const byLevel: Record<Difficulty, LevelRecord> = isRated
    ? {
        ...stats.byLevel,
        [removed.opponent]: {
          wins: Math.max(0, bucket.wins - (removed.outcome === 'win' ? 1 : 0)),
          losses: Math.max(0, bucket.losses - (removed.outcome === 'loss' ? 1 : 0)),
          draws: Math.max(0, bucket.draws - (removed.outcome === 'draw' ? 1 : 0)),
        },
      }
    : stats.byLevel;

  const deletedIds = stats.deletedIds.includes(id)
    ? stats.deletedIds
    : [...stats.deletedIds, id];

  return {
    ...stats,
    totalGames: Math.max(0, stats.totalGames - 1),
    byLevel,
    history,
    deletedIds,
  };
}

/**
 * Drop a tombstone — call this AFTER the server-side DELETE has
 * succeeded so the next sync doesn't keep retrying. Returns the input
 * unchanged if the id isn't in `deletedIds`.
 */
export function forgetDeletedId(stats: UserStats, id: string): UserStats {
  if (!stats.deletedIds.includes(id)) return stats;
  return {
    ...stats,
    deletedIds: stats.deletedIds.filter((x) => x !== id),
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
