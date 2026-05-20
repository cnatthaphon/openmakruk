// Per-puzzle solve bookkeeping. localStorage-only — same privacy
// posture as everything else in the app.

const STORAGE_KEY = 'openmakruk_puzzle_progress';

export type PuzzleAttempt = {
  solvedAt: number; // ms epoch
  attempts: number; // how many user moves it took (lower = better)
  usedHint: boolean;
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
  // Keep the best attempt (fewest tries, hint=false wins ties)
  const existing = progress.solved[puzzleId];
  if (existing) {
    const newBetter =
      attempt.attempts < existing.attempts ||
      (attempt.attempts === existing.attempts && !attempt.usedHint && existing.usedHint);
    if (!newBetter) return progress;
  }
  return {
    solved: { ...progress.solved, [puzzleId]: attempt },
  };
}

export function isPuzzleSolved(progress: PuzzleProgress, puzzleId: string): boolean {
  return puzzleId in progress.solved;
}
