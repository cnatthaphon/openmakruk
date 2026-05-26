// Daily puzzle — deterministic pick from the puzzle pool keyed by
// the current date, so every user worldwide sees the same puzzle on
// a given day. Same as lichess.org/training/daily.
//
// Implementation: hash today's date string ("YYYY-MM-DD") and use it
// to index into the puzzle list. No server roundtrip; no clock skew
// drama because we use the user's local date.

import type { Puzzle } from './puzzleSchema';
import { defineStore } from './stores';

const DAILY_PUZZLE_VERSION = 1;

type DailyRecord = {
  dateKey: string;      // "2026-05-20"
  puzzleId: string;
  solved: boolean;
  attemptedAt: number | null;
};

const store = defineStore<DailyRecord | null>({
  key: 'openmakruk_daily_puzzle',
  version: DAILY_PUZZLE_VERSION,
  default: () => null,
  migrate: (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Partial<DailyRecord>;
    if (typeof obj.dateKey !== 'string' || typeof obj.puzzleId !== 'string') {
      return null;
    }
    return {
      dateKey: obj.dateKey,
      puzzleId: obj.puzzleId,
      solved: !!obj.solved,
      attemptedAt: typeof obj.attemptedAt === 'number' ? obj.attemptedAt : null,
    };
  },
});

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

/** Daily difficulty cycle — Monday easy, Sunday hard. Returns a
 *  rating band that the daily puzzle picker uses to escalate
 *  difficulty across the week. Pattern borrowed from chess.com's
 *  daily-cycle: predictable rhythm gives the user a reason to come
 *  back every day, not just on solve-once Wednesday. */
export function dailyDifficultyBand(date: Date = new Date()): {
  dayLabel: string;
  min: number;
  max: number;
} {
  // 0=Sunday, 1=Monday, ..., 6=Saturday — escalate Mon → Sun
  const dow = date.getDay();
  // Mon=easiest → Sun=hardest. Sunday is the hardest because that's
  // when Sunday Showdown runs, so it should test the player.
  const bands: { dayLabel: string; min: number; max: number }[] = [
    { dayLabel: 'อาทิตย์',  min: 1400, max: 1900 }, // Sun hardest
    { dayLabel: 'จันทร์',   min: 700,  max: 1100 }, // Mon easiest
    { dayLabel: 'อังคาร',   min: 800,  max: 1200 },
    { dayLabel: 'พุธ',     min: 900,  max: 1300 },
    { dayLabel: 'พฤหัสบดี', min: 1000, max: 1500 },
    { dayLabel: 'ศุกร์',    min: 1100, max: 1600 },
    { dayLabel: 'เสาร์',   min: 1300, max: 1800 },
  ];
  return bands[dow];
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
  const date = today ?? new Date();
  const key = dailyDateKey(date);
  const hash = hashString(key);
  // Daily difficulty cycle — Monday easy → Sunday hard. The band
  // floor/ceiling escalates through the week so players who solve
  // every day get progressively harder puzzles by Sunday.
  const cycle = dailyDifficultyBand(date);
  const inBand = puzzles.filter((p) => p.rating >= cycle.min && p.rating <= cycle.max);
  const pool = inBand.length >= 3 ? inBand : puzzles;
  return pool[hash % pool.length];
}

export function loadDailyRecord(): DailyRecord | null {
  return store.load();
}

export function saveDailyRecord(record: DailyRecord): void {
  store.save(record);
}

/** Has the user already solved today's daily puzzle? */
export function isDailySolvedToday(): boolean {
  const rec = loadDailyRecord();
  if (!rec) return false;
  return rec.dateKey === dailyDateKey() && rec.solved;
}
