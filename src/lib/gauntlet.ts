// Gauntlet — "beat all 4 CPU levels in a row" challenge mode.
//
// Sequence: easy → medium → hard → master. Win a game = advance to
// the next level. Lose or draw = the gauntlet ends (counts as a fail).
// Complete the full ladder = badge + bragging rights.
//
// Why a separate state from regular stats: the gauntlet tracks an
// ordered sequence. Treating it like a normal game would let the
// user skip levels by choosing the highest one directly. The
// gauntlet enforces order.
//
// Stored versioned so future variations (allow draws as half-pass?
// allow retry on master only?) can migrate.

import { defineStore } from './stores';
import type { Difficulty } from './engine';

const GAUNTLET_VERSION = 1;

export const GAUNTLET_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'master'];

export type GauntletState = {
  /** null = no active gauntlet. */
  active: boolean;
  /** Index into GAUNTLET_ORDER for the level currently being played. */
  cursor: number;
  /** Outcomes of completed rungs so far. Length === cursor. */
  results: ('win' | 'loss' | 'draw')[];
  /** When the gauntlet started (ms epoch). */
  startedAt: number | null;
  /** When the gauntlet completed or failed (ms epoch). null if active. */
  finishedAt: number | null;
  /** "completed" = beat all 4. "failed" = lost/drew before that. */
  outcome: 'completed' | 'failed' | null;
  /** History of past gauntlet runs, newest first, capped at 20. */
  history: {
    startedAt: number;
    finishedAt: number;
    outcome: 'completed' | 'failed';
    reachedLevel: Difficulty;
    results: ('win' | 'loss' | 'draw')[];
  }[];
};

function blank(): GauntletState {
  return {
    active: false,
    cursor: 0,
    results: [],
    startedAt: null,
    finishedAt: null,
    outcome: null,
    history: [],
  };
}

const store = defineStore<GauntletState>({
  key: 'openmakruk_gauntlet',
  version: GAUNTLET_VERSION,
  default: blank,
  migrate: (raw) => {
    const base = blank();
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<GauntletState>;
    return {
      ...base,
      ...obj,
      results: Array.isArray(obj.results) ? obj.results : [],
      history: Array.isArray(obj.history) ? obj.history : [],
    };
  },
});

export function loadGauntlet(): GauntletState {
  return store.load();
}

export function saveGauntlet(s: GauntletState): void {
  store.save(s);
}

/** Start a new gauntlet. Discards any in-progress run. */
export function startGauntlet(now: number = Date.now()): GauntletState {
  return {
    active: true,
    cursor: 0,
    results: [],
    startedAt: now,
    finishedAt: null,
    outcome: null,
    history: loadGauntlet().history,
  };
}

/** The level the user should play right now (or null if not active). */
export function currentLevel(s: GauntletState): Difficulty | null {
  if (!s.active) return null;
  return GAUNTLET_ORDER[s.cursor] ?? null;
}

/**
 * Apply a game outcome. Win → advance. Loss/draw → fail.
 * On completion (cursor reaches end), outcome is 'completed'.
 * Returns the next state (does not persist).
 */
export function applyGauntletOutcome(
  s: GauntletState,
  outcome: 'win' | 'loss' | 'draw',
  now: number = Date.now(),
): GauntletState {
  if (!s.active) return s;
  const level = GAUNTLET_ORDER[s.cursor];
  if (!level) return s;
  const results = [...s.results, outcome];
  if (outcome !== 'win') {
    // Fail — record + archive to history
    const archived = {
      startedAt: s.startedAt ?? now,
      finishedAt: now,
      outcome: 'failed' as const,
      reachedLevel: level,
      results,
    };
    return {
      active: false,
      cursor: s.cursor,
      results,
      startedAt: s.startedAt,
      finishedAt: now,
      outcome: 'failed',
      history: [archived, ...s.history].slice(0, 20),
    };
  }
  // Win — advance
  const nextCursor = s.cursor + 1;
  if (nextCursor >= GAUNTLET_ORDER.length) {
    // Completed all levels!
    const archived = {
      startedAt: s.startedAt ?? now,
      finishedAt: now,
      outcome: 'completed' as const,
      reachedLevel: GAUNTLET_ORDER[GAUNTLET_ORDER.length - 1],
      results,
    };
    return {
      active: false,
      cursor: nextCursor,
      results,
      startedAt: s.startedAt,
      finishedAt: now,
      outcome: 'completed',
      history: [archived, ...s.history].slice(0, 20),
    };
  }
  return {
    ...s,
    cursor: nextCursor,
    results,
  };
}
