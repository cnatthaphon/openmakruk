// Per-puzzle solve bookkeeping. localStorage-only via the versioned
// stores module — same privacy posture as everything else in the app.

import { defineStore } from './stores';

const PUZZLE_PROGRESS_VERSION = 1;

export type PuzzleAttempt = {
  solvedAt: number; // ms epoch
  attempts: number; // how many user moves it took (lower = better)
  usedHint: boolean;
  /** How long the user spent on this puzzle, ms. Optional for back-compat
   * with records saved before this field was added. */
  timeToSolveMs?: number;
  /** UCI moves the user tried unsuccessfully — useful for showing the
   * user their own wrong-move pattern. Capped to last 5 to bound size. */
  wrongMoves?: string[];
};

export type PuzzleProgress = {
  solved: Record<string, PuzzleAttempt>;
};

const store = defineStore<PuzzleProgress>({
  key: 'openmakruk_puzzle_progress',
  version: PUZZLE_PROGRESS_VERSION,
  default: () => ({ solved: {} }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<PuzzleProgress>;
    return {
      solved: obj.solved && typeof obj.solved === 'object' ? obj.solved : {},
    };
  },
});

export function loadPuzzleProgress(): PuzzleProgress {
  return store.load();
}

export function savePuzzleProgress(progress: PuzzleProgress): void {
  store.save(progress);
}

export function recordPuzzleSolve(
  progress: PuzzleProgress,
  puzzleId: string,
  attempt: PuzzleAttempt,
): PuzzleProgress {
  // Keep the BEST attempt across all the times the user has retried.
  // Tie-breakers, in order:
  //   1. fewer attempts wins
  //   2. no-hint wins over with-hint
  //   3. faster time wins
  const existing = progress.solved[puzzleId];
  if (existing) {
    const newBetter =
      attempt.attempts < existing.attempts ||
      (attempt.attempts === existing.attempts &&
        !attempt.usedHint &&
        existing.usedHint) ||
      (attempt.attempts === existing.attempts &&
        attempt.usedHint === existing.usedHint &&
        (attempt.timeToSolveMs ?? Infinity) < (existing.timeToSolveMs ?? Infinity));
    if (!newBetter) return progress;
  }
  return {
    solved: { ...progress.solved, [puzzleId]: attempt },
  };
}

export function isPuzzleSolved(progress: PuzzleProgress, puzzleId: string): boolean {
  return puzzleId in progress.solved;
}
