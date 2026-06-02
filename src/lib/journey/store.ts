// Journey persistence + the single write entry point (issue #7).
//
// `submitProgress(input)` is how EVERY training surface contributes:
// load → reduce (against the shipped checkpoint set) → save → return.
// Callers don't touch the reducer or the store shape; they emit a
// ProgressInput and the journey updates. This is the "one progress
// contract" the issue asks for.
//
// Storage is 'durable' (IndexedDB) — like stats.ts — because the
// evidence (recordedGameIds, solvedPuzzles) grows with play and would
// eventually strain the 5MB localStorage ceiling.

import { defineStore } from '../stores';
import { createJourneyReducer } from './reducer.ts';
import { JOURNEY_CHECKPOINTS } from './checkpoints.ts';
import { emptyJourney, JOURNEY_SCHEMA_VERSION } from './contract.ts';
import type { JourneyState, ProgressInput } from './contract';

const store = defineStore<JourneyState>({
  key: 'openmakruk_journey',
  version: JOURNEY_SCHEMA_VERSION,
  storage: 'durable',
  default: () => emptyJourney(0),
  migrate: (raw) => {
    const base = emptyJourney(0);
    const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<JourneyState>;
    return {
      ...base,
      ...partial,
      v: JOURNEY_SCHEMA_VERSION,
      cleared: Array.isArray(partial.cleared) ? partial.cleared : [],
      mastery: partial.mastery && typeof partial.mastery === 'object' ? partial.mastery : {},
      evidence: partial.evidence && typeof partial.evidence === 'object' ? partial.evidence : {},
      updatedAt: typeof partial.updatedAt === 'number' ? partial.updatedAt : base.updatedAt,
    };
  },
});

/** The reducer bound to the shipped checkpoint ladder. */
const reduce = createJourneyReducer(JOURNEY_CHECKPOINTS);

export function loadJourney(): JourneyState {
  return store.load();
}

export function saveJourney(state: JourneyState): void {
  store.save(state);
}

export function clearJourney(): void {
  store.clear();
}

/**
 * Apply one progress event and persist. Returns the new state. Safe to
 * call from anywhere (lesson complete, puzzle solve, drill pass, game
 * end, review, rating change). Idempotent per the reducer's contract,
 * so re-emitting an event (cloud sync replay, startup backfill) never
 * double-counts.
 */
export function submitProgress(input: ProgressInput): JourneyState {
  const next = reduce(store.load(), input);
  store.save(next);
  return next;
}

/** Apply a batch in one load/save round-trip — used by the migration
 *  seed so a backfill of hundreds of historical events doesn't write
 *  the store once per event. */
export function submitProgressBatch(inputs: ProgressInput[]): JourneyState {
  let state = store.load();
  for (const input of inputs) state = reduce(state, input);
  store.save(state);
  return state;
}
