// Spaced-repetition scheduler — SM-2 (SuperMemo 2) algorithm.
//
// When the user attempts a puzzle, we record the outcome and compute
// the NEXT due date based on how well they did. Puzzles whose
// dueAt <= now() are surfaced in a "review queue" in the Puzzles tab.
//
// SM-2 reference: https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
//
// Quality grades:
//   5 = perfect solve, no hesitation
//   4 = solved after some thought
//   3 = solved with hint
//   2 = solved with reveal/retry
//   1 = failed but recognised
//   0 = total blank
// Our app maps onto 3 grades; the math handles all 0..5.

const STORAGE_KEY = 'openmakruk_puzzle_schedule';

export type ScheduleEntry = {
  /** Days between repetitions on next success. */
  interval: number;
  /** Easiness factor — starts at 2.5, can drop to 1.3. */
  ease: number;
  /** How many consecutive successful reviews. Resets to 0 on fail. */
  repetitions: number;
  /** When this puzzle is next due for review (ms epoch). */
  dueAt: number;
};

export type ScheduleStore = {
  /** keyed by puzzle id */
  entries: Record<string, ScheduleEntry>;
};

export function loadSchedule(): ScheduleStore {
  if (typeof window === 'undefined') return { entries: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: {} };
    return JSON.parse(raw);
  } catch {
    return { entries: {} };
  }
}

export function saveSchedule(store: ScheduleStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Update one puzzle's schedule based on the SM-2 quality grade. */
export function applyOutcome(
  store: ScheduleStore,
  puzzleId: string,
  quality: 0 | 1 | 2 | 3 | 4 | 5,
  now: number = Date.now(),
): ScheduleStore {
  const prev = store.entries[puzzleId] ?? {
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    dueAt: now,
  };
  let { interval, ease, repetitions } = prev;

  if (quality < 3) {
    // Failed: reset repetition count, show again tomorrow.
    repetitions = 0;
    interval = 1;
  } else {
    // Passed: advance the schedule.
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ease);
    repetitions += 1;
    // Update easiness.
    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ease < 1.3) ease = 1.3;
  }

  const nextEntry: ScheduleEntry = {
    interval,
    ease,
    repetitions,
    dueAt: now + interval * DAY_MS,
  };
  return {
    entries: { ...store.entries, [puzzleId]: nextEntry },
  };
}

/** Get every puzzle id that's due for review at `now`. */
export function dueNow(store: ScheduleStore, now: number = Date.now()): string[] {
  return Object.entries(store.entries)
    .filter(([_, e]) => e.dueAt <= now)
    .map(([id]) => id);
}

/** Convert an app-level outcome to an SM-2 quality grade. */
export function outcomeToQuality(
  outcome: 'solved' | 'partial' | 'failed',
): 0 | 1 | 2 | 3 | 4 | 5 {
  if (outcome === 'solved') return 5;
  if (outcome === 'partial') return 3;
  return 1;
}
