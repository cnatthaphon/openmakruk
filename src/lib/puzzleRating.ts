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
  /** Solved but with a hint or after wrong attempts — counted as wins
   * (no rating penalty) but tracked separately for self-awareness. */
  solvedWithHint?: number;
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
 *   'solved'   — clean solve (no hint, no wrong tries) → full +Elo gain
 *   'partial'  — solved with hint or after retries → reduced gain (75%
 *                of what a clean solve would have earned), but never a
 *                rating loss. Stats tracked separately so the user can
 *                see "with hint" usage trend without being punished at
 *                the rating layer.
 *   'failed'   — gave up / revealed solution → full -Elo loss
 *
 * The opponent-equivalent rating is the puzzle's own rating field.
 *
 * Why this scheme: lichess.org doesn't penalise hints at the rating
 * layer at all; chess.com is stricter. Splitting the difference at 75%
 * keeps the hint button non-punitive (users use it to LEARN) while
 * still rewarding clean solves more.
 */
export function recordAttempt(
  state: PuzzleRatingState,
  puzzleRating: number,
  outcome: 'solved' | 'partial' | 'failed',
): PuzzleRatingState {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - state.rating) / 400));
  const win = outcome !== 'failed';
  let delta = K_FACTOR * ((win ? 1 : 0) - expected);
  // 25% haircut on positive gains for hint-assisted solves; losses unchanged
  if (outcome === 'partial' && delta > 0) delta *= 0.75;
  return {
    rating: Math.round(state.rating + delta),
    attempts: state.attempts + 1,
    solved: state.solved + (outcome === 'solved' ? 1 : 0),
    solvedWithHint: (state.solvedWithHint ?? 0) + (outcome === 'partial' ? 1 : 0),
    failed: state.failed + (outcome === 'failed' ? 1 : 0),
    startedAt: state.startedAt || Date.now(),
  };
}

/** "850" / "1340" — for display in the UI. */
export function formatRating(rating: number): string {
  return Math.round(rating).toString();
}
