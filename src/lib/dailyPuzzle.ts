// Daily puzzle — deterministic pick from the puzzle pool keyed by
// the current date, so every user worldwide sees the same puzzle on
// a given day. Same as lichess.org/training/daily.
//
// Implementation: hash today's date string ("YYYY-MM-DD") and use it
// to index into the puzzle list. No server roundtrip; no clock skew
// drama because we use the user's local date.

import type { Puzzle } from './puzzleSchema';

const STORAGE_KEY = 'openmakruk_daily_puzzle';

type DailyRecord = {
  dateKey: string;      // "2026-05-20"
  puzzleId: string;
  solved: boolean;
  attemptedAt: number | null;
};

/** Today's date in YYYY-MM-DD form, using the user's local clock. */
export function dailyDateKey(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** djb2 — small, fast string hash. Stable across browsers. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0; // unsigned
}

/**
 * Pick today's puzzle from the pool. Returns null when the pool is
 * empty. Picks deterministically — calling it twice on the same day
 * returns the same puzzle.
 *
 * Filters to puzzles within a sane range (no super-hard puzzles for
 * the daily, since beginners check the daily too). Phase-future:
 * make this rating-aware (pick close to the user's personal rating).
 */
export function pickDailyPuzzle(puzzles: Puzzle[], today?: Date): Puzzle | null {
  if (puzzles.length === 0) return null;
  const key = dailyDateKey(today);
  const hash = hashString(key);
  // Prefer ratings in the 700-1400 band — but if not enough puzzles
  // are in band, fall back to the whole pool.
  const band = puzzles.filter((p) => p.rating >= 700 && p.rating <= 1400);
  const pool = band.length >= 3 ? band : puzzles;
  return pool[hash % pool.length];
}

export function loadDailyRecord(): DailyRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveDailyRecord(record: DailyRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore
  }
}

/** Has the user already solved today's daily puzzle? */
export function isDailySolvedToday(): boolean {
  const rec = loadDailyRecord();
  if (!rec) return false;
  return rec.dateKey === dailyDateKey() && rec.solved;
}
