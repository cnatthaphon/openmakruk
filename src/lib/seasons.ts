// Seasonal ladder — quarterly snapshots of personal stats so the user
// sees progress arc across 3-month chunks rather than just "lifetime
// numbers". A full server-side seasonal ladder (global leaderboard
// resets, permanent Hall-of-Fame entries) needs schema migrations +
// cron rollover — out of scope for this client-side v1. What ships
// here is the personal-narrative layer: "Q2 2026 high rating 1280,
// down 12 from Q1 peak".
//
// Season boundaries — calendar quarters in Bangkok local time:
//   Q1 = Jan 1 → Mar 31
//   Q2 = Apr 1 → Jun 30
//   Q3 = Jul 1 → Sep 30
//   Q4 = Oct 1 → Dec 31
//
// On every app boot, ensureCurrentSeasonRecorded() snapshots the
// user's current stats into the active season's record. When the
// quarter rolls over, the old season's record is frozen and a new
// one starts. The freeze captures the user's peak rating, total
// games, total puzzles solved during that quarter.

import { defineStore } from './stores';
import { loadStats } from './stats';
import { loadPuzzleProgress } from './puzzleProgress';

const SEASONS_VERSION = 1;

export type SeasonId = string; // e.g. "2026-Q1"

export type SeasonSnapshot = {
  seasonId: SeasonId;
  /** Unix ms when this season's record first touched (entry created). */
  startedAt: number;
  /** Highest rating reached during this season. */
  peakRating: number;
  /** Lowest rating during this season (after first game played). */
  troughRating: number;
  /** Snapshot of rating at season end (only set after the quarter
   *  rolls over — null while season is active). */
  finalRating: number | null;
  /** Total puzzles solved during the season. */
  puzzlesSolved: number;
  /** Total games recorded during the season. */
  totalGames: number;
};

type SeasonsState = {
  /** Snapshots keyed by season id, including the active one. */
  snapshots: Record<SeasonId, SeasonSnapshot>;
};

const store = defineStore<SeasonsState>({
  key: 'openmakruk_seasons',
  version: SEASONS_VERSION,
  default: () => ({ snapshots: {} }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<SeasonsState>;
    return {
      snapshots:
        obj.snapshots && typeof obj.snapshots === 'object'
          ? (obj.snapshots as Record<SeasonId, SeasonSnapshot>)
          : {},
    };
  },
});

/** Derive the season id (e.g. "2026-Q2") for a given date. */
export function seasonIdForDate(date: Date = new Date()): SeasonId {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/** Human label for a season — "Q2 2026" reads better in UI than the id. */
export function seasonLabel(seasonId: SeasonId): string {
  const [year, q] = seasonId.split('-');
  return `${q} ${year}`;
}

/** Get the active season's snapshot, creating it on first call of the
 *  quarter. Also freezes any earlier snapshots that have rolled over
 *  by setting their finalRating from the user's current state. */
export function getActiveSeason(): SeasonSnapshot {
  const state = store.load();
  const currentId = seasonIdForDate();
  const stats = loadStats();
  const puzzles = loadPuzzleProgress();
  const solvedCount = Object.keys(puzzles.solved ?? {}).length;

  // Freeze any old seasons (those that aren't the current id and
  // haven't been frozen yet).
  let mutated = false;
  for (const id of Object.keys(state.snapshots)) {
    if (id !== currentId && state.snapshots[id].finalRating === null) {
      state.snapshots[id].finalRating = state.snapshots[id].peakRating;
      mutated = true;
    }
  }

  // Create or update the active season's snapshot.
  const existing = state.snapshots[currentId];
  if (!existing) {
    state.snapshots[currentId] = {
      seasonId: currentId,
      startedAt: Date.now(),
      peakRating: stats.rating,
      troughRating: stats.rating,
      finalRating: null,
      puzzlesSolved: solvedCount,
      totalGames: stats.totalGames,
    };
    mutated = true;
  } else {
    const before = JSON.stringify(existing);
    existing.peakRating = Math.max(existing.peakRating, stats.rating);
    existing.troughRating = Math.min(existing.troughRating, stats.rating);
    existing.puzzlesSolved = Math.max(existing.puzzlesSolved, solvedCount);
    existing.totalGames = Math.max(existing.totalGames, stats.totalGames);
    if (JSON.stringify(existing) !== before) mutated = true;
  }

  if (mutated) store.save(state);
  return state.snapshots[currentId];
}

/** All recorded seasons (most-recent first), useful for a "season
 *  history" panel. */
export function loadAllSeasons(): SeasonSnapshot[] {
  const state = store.load();
  return Object.values(state.snapshots).sort((a, b) =>
    b.seasonId.localeCompare(a.seasonId),
  );
}

/** Get the previous (immediate-prior) season's snapshot, or null if
 *  no prior season exists. Used by the Profile "Q2 vs Q1" comparison. */
export function getPriorSeason(): SeasonSnapshot | null {
  const all = loadAllSeasons();
  if (all.length < 2) return null;
  // [0] is current; [1] is prior
  return all[1];
}
