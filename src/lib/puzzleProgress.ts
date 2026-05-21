// Per-puzzle solve bookkeeping. localStorage-only — same privacy
// posture as everything else in the app.

const STORAGE_KEY = 'openmakruk_puzzle_progress';

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

type Persisted = PuzzleProgress;

export function loadPuzzleProgress(): PuzzleProgress {
  if (typeof window === 'undefined') return { solved: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { solved: {} };
    const parsed = JSON.parse(raw) as Persisted;
    return { solved: parsed.solved ?? {} };
  } catch {
    return { solved: {} };
  }
}

export function savePuzzleProgress(progress: PuzzleProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore quota / disabled
  }
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
