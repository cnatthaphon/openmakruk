// Daily streak — counts consecutive UTC-Bangkok days the user has
// visited / played / solved a puzzle / completed a lesson. Soft
// engagement hook: lichess + chess.com + Duolingo all use this
// pattern, returning users get a "🔥 N day streak" badge.
//
// Stored in localStorage via the versioned stores module so a future
// schema change can migrate without losing the streak count.

import { defineStore } from './stores';

const STREAK_VERSION = 1;

export type StreakState = {
  /** Current consecutive-day count. Resets to 0 if a day is skipped. */
  current: number;
  /** Highest streak ever — never decreases. */
  longest: number;
  /** Date of last activity, as 'YYYY-MM-DD' in user's local TZ. */
  lastActiveDate: string | null;
};

const blank = (): StreakState => ({ current: 0, longest: 0, lastActiveDate: null });

const store = defineStore<StreakState>({
  key: 'openmakruk_streak',
  version: STREAK_VERSION,
  default: blank,
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<StreakState>;
    return {
      current: typeof obj.current === 'number' ? obj.current : 0,
      longest: typeof obj.longest === 'number' ? obj.longest : 0,
      lastActiveDate: typeof obj.lastActiveDate === 'string' ? obj.lastActiveDate : null,
    };
  },
});

export function loadStreak(): StreakState {
  return store.load();
}

export function saveStreak(s: StreakState): void {
  store.save(s);
}

/** Date key for "today" in the user's local timezone. */
export function todayKey(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Date key for "yesterday" in the user's local timezone. */
export function yesterdayKey(now: Date = new Date()): string {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return todayKey(y);
}

/**
 * Apply a "I did something today" pulse to the streak state. Returns
 * the updated state — caller persists. Idempotent for the same day
 * (calling 10 times today still counts as 1).
 */
export function recordActivity(s: StreakState, now: Date = new Date()): StreakState {
  const today = todayKey(now);
  if (s.lastActiveDate === today) return s; // already counted
  const yesterday = yesterdayKey(now);
  let nextCurrent: number;
  if (s.lastActiveDate === yesterday) {
    nextCurrent = s.current + 1;        // continued streak
  } else {
    nextCurrent = 1;                    // new streak (gap → reset)
  }
  return {
    current: nextCurrent,
    longest: Math.max(s.longest, nextCurrent),
    lastActiveDate: today,
  };
}

/**
 * Without recording, what would the streak DISPLAY value be? If the
 * user's last activity was yesterday, the streak is still "alive"
 * and we show its value. If older, the displayed streak is 0 (lost).
 */
export function displayStreak(s: StreakState, now: Date = new Date()): number {
  if (!s.lastActiveDate) return 0;
  if (s.lastActiveDate === todayKey(now)) return s.current;
  if (s.lastActiveDate === yesterdayKey(now)) return s.current;
  return 0;
}
