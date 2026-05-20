// Personal puzzle rating per user. Separate from game Elo because
// solving puzzles is a different skill from playing whole games and
// we want progress tracking that isn't tainted by win/loss variance
// from full games.
//
// Algorithm: simplified Elo (K=24 — slightly less reactive than the
// game-side K=32 since puzzles are more deterministic). Each puzzle's
// own `rating` field acts as the opponent. Solve = win, fail = loss.
// A future Phase will swap this for Glicko-2 which handles rating
// deviation; the call-sites care only about `currentRating(state)`.

const STORAGE_KEY = 'openmakruk_puzzle_rating';

export type PuzzleRatingState = {
  rating: number;       // current personal puzzle rating
  attempts: number;     // total puzzles attempted (solved + failed)
  solved: number;       // solved on first try (no hint, no retry)
  failed: number;       // failed (gave up or used reveal)
  startedAt: number;    // when the user first attempted a puzzle (ms)
};

export const STARTING_RATING = 1200;
const K_FACTOR = 24;

export function loadPuzzleRating(): PuzzleRatingState {
  if (typeof window === 'undefined') return blank();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return blank();
    return { ...blank(), ...JSON.parse(raw) };
  } catch {
    return blank();
  }
}

function blank(): PuzzleRatingState {
  return {
    rating: STARTING_RATING,
    attempts: 0,
    solved: 0,
    failed: 0,
    startedAt: 0,
  };
}

export function savePuzzleRating(state: PuzzleRatingState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * Update the personal rating after attempting a puzzle.
 * `outcome` is:
 *   'solved'   — first-try solve, full credit
 *   'partial'  — solved with hint or after retry, half credit
 *   'failed'   — gave up or revealed the answer
 *
 * The opponent-equivalent rating is the puzzle's own rating field.
 */
export function recordAttempt(
  state: PuzzleRatingState,
  puzzleRating: number,
  outcome: 'solved' | 'partial' | 'failed',
): PuzzleRatingState {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - state.rating) / 400));
  const actual = outcome === 'solved' ? 1 : outcome === 'partial' ? 0.5 : 0;
  const delta = K_FACTOR * (actual - expected);
  return {
    rating: Math.round(state.rating + delta),
    attempts: state.attempts + 1,
    solved: state.solved + (outcome === 'solved' ? 1 : 0),
    failed: state.failed + (outcome === 'failed' ? 1 : 0),
    startedAt: state.startedAt || Date.now(),
  };
}

/** "850" / "1340" — for display in the UI. */
export function formatRating(rating: number): string {
  return Math.round(rating).toString();
}
