// Move Trainer — drill the moves of a known Makruk opening until they
// stick. Reuses the public/content/openings/all.json data (same as
// the worker exhibition book) so adding a line in the JSON
// automatically adds it to the trainer.
//
// Loop:
//   1. Player picks an opening from the catalog.
//   2. The board is rendered after the previous (computer-played)
//      half-move; player must produce the next book move.
//   3. Correct → green flash + advance one ply. Wrong → red flash +
//      reveal the correct square, player retries until they get it.
//   4. After the last move of the opening, session ends with a
//      score = correct_on_first_try / total_moves.
//
// Per-opening best score is persisted in localStorage so the player
// can see "you mastered Khun-pawn 4/4 (no errors)" on subsequent
// visits.

import { defineStore } from './stores';

const TRAINER_VERSION = 1;

export type TrainerBest = {
  /** Number of moves the user got right on the first try. */
  perfectMoves: number;
  /** Total moves in the line. */
  totalMoves: number;
  /** Unix ms when this best was set. */
  setAt: number;
};

export type TrainerProgress = {
  bestByOpening: Record<string, TrainerBest>;
};

const store = defineStore<TrainerProgress>({
  key: 'openmakruk_move_trainer',
  version: TRAINER_VERSION,
  default: () => ({ bestByOpening: {} }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<TrainerProgress>;
    return {
      bestByOpening:
        obj.bestByOpening && typeof obj.bestByOpening === 'object'
          ? (obj.bestByOpening as Record<string, TrainerBest>)
          : {},
    };
  },
});

export function loadTrainerProgress(): TrainerProgress {
  return store.load();
}

/** Record a trainer-session result. Saves only if the new run beats
 *  the prior best (more perfect moves out of total). */
export function recordTrainerRun(
  openingId: string,
  perfectMoves: number,
  totalMoves: number,
): TrainerProgress {
  const current = store.load();
  const prior = current.bestByOpening[openingId];
  if (prior && prior.perfectMoves >= perfectMoves) return current;
  const next: TrainerProgress = {
    bestByOpening: {
      ...current.bestByOpening,
      [openingId]: { perfectMoves, totalMoves, setAt: Date.now() },
    },
  };
  store.save(next);
  return next;
}
