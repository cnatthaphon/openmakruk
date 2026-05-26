// 🔥 Puzzle Rush — timed back-to-back puzzle solving.
//
// Rules (v1, "lichess-lite"):
//   - 3-minute clock from the first move
//   - 3 strikes (wrong moves) = end
//   - Solving = +1 score, instant next puzzle
//   - End condition: time runs out OR 3rd strike
//
// Puzzles are picked from the loaded puzzle pool, shuffled with a
// time-based seed so each rush session sees a fresh order. We filter
// to a rating band (600-1500) to keep early puzzles solvable — Rush
// is about volume, not difficulty.
//
// Personal best is local-only (defineStore). A future Phase can add
// server submission for a global Rush leaderboard.

import { defineStore } from './stores';
import type { Puzzle } from './puzzleSchema';

export const RUSH_DURATION_MS = 180_000; // 3:00
export const RUSH_MAX_STRIKES = 3;
export const RUSH_RATING_MIN = 600;
export const RUSH_RATING_MAX = 1500;

const RUSH_BEST_VERSION = 1;

type RushBest = {
  score: number;
  /** Unix ms — when this best was set. */
  setAt: number;
  /** How many strikes did the user finish with. */
  strikesAtEnd: number;
  /** Time remaining (ms) at end — for tie-break / "perfect run" detection. */
  timeLeftMs: number;
};

const store = defineStore<RushBest>({
  key: 'openmakruk_puzzle_rush_best',
  version: RUSH_BEST_VERSION,
  default: () => ({ score: 0, setAt: 0, strikesAtEnd: 0, timeLeftMs: 0 }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<RushBest>;
    return {
      score: typeof obj.score === 'number' ? obj.score : 0,
      setAt: typeof obj.setAt === 'number' ? obj.setAt : 0,
      strikesAtEnd: typeof obj.strikesAtEnd === 'number' ? obj.strikesAtEnd : 0,
      timeLeftMs: typeof obj.timeLeftMs === 'number' ? obj.timeLeftMs : 0,
    };
  },
});

export function loadRushBest(): RushBest {
  return store.load();
}

/** Save if this run beats the prior personal best. Returns the
 *  current best after the operation (which is either the new run or
 *  the unchanged prior best). */
export function recordRushRun(run: {
  score: number;
  strikesAtEnd: number;
  timeLeftMs: number;
}): RushBest {
  const prior = store.load();
  // Score is the primary metric; on a tie prefer the run with more
  // time left (faster), then fewer strikes.
  const isBetter =
    run.score > prior.score ||
    (run.score === prior.score && run.timeLeftMs > prior.timeLeftMs) ||
    (run.score === prior.score &&
      run.timeLeftMs === prior.timeLeftMs &&
      run.strikesAtEnd < prior.strikesAtEnd);
  if (!isBetter) return prior;
  const next: RushBest = { ...run, setAt: Date.now() };
  store.save(next);
  return next;
}

/** Deterministic shuffle using a simple LCG keyed by the seed. Two
 *  rush sessions with the same seed produce the same order — used so
 *  React StrictMode's double-mount doesn't accidentally show two
 *  different first puzzles. */
function shuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pick the rush queue from a puzzle pool. Returns an array of
 *  puzzles in randomized order, filtered to the difficulty band. */
export function buildRushQueue(puzzles: Puzzle[], seed: number = Date.now()): Puzzle[] {
  const band = puzzles.filter(
    (p) => p.rating >= RUSH_RATING_MIN && p.rating <= RUSH_RATING_MAX,
  );
  const pool = band.length >= 10 ? band : puzzles;
  return shuffle(pool, seed);
}

export function formatRushTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}
