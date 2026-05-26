// 🛡️ Survive mode — defensive challenge. Player loads an under-
// attack position and must hold for N moves without getting mated.
// Engine plays the attacking side; player plays the defender.
//
// Start positions come from the existing defense-category puzzles
// in /content/puzzles/all.json — same data, different goal. Adding
// new positions = add a defense puzzle. No new content schema.

import { defineStore } from './stores';

const SURVIVE_VERSION = 1;

// How many user-side moves the player must hold for the round to
// count as a clear. Picked low (10) so the mode plays in 2-3 minutes;
// chess.com's analogue ("Defend Like Petrosian") uses similar.
export const SURVIVE_TARGET_PLIES = 10;

export type SurviveBest = {
  /** Maximum plies the player has survived from this position. Clear
   *  if >= SURVIVE_TARGET_PLIES. */
  plies: number;
  setAt: number;
};

type SurviveState = {
  bestById: Record<string, SurviveBest>;
};

const store = defineStore<SurviveState>({
  key: 'openmakruk_survive_mode',
  version: SURVIVE_VERSION,
  default: () => ({ bestById: {} }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<SurviveState>;
    return {
      bestById:
        obj.bestById && typeof obj.bestById === 'object'
          ? (obj.bestById as Record<string, SurviveBest>)
          : {},
    };
  },
});

export function loadSurviveProgress(): SurviveState {
  return store.load();
}

export function recordSurviveRun(puzzleId: string, plies: number): SurviveState {
  const cur = store.load();
  const prior = cur.bestById[puzzleId];
  if (prior && prior.plies >= plies) return cur;
  const next: SurviveState = {
    bestById: { ...cur.bestById, [puzzleId]: { plies, setAt: Date.now() } },
  };
  store.save(next);
  return next;
}
