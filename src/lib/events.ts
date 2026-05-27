// Event / Tournament system — time-bound bot-as-proxy challenges.
//
// Concept: an "Event" pins a specific bot (engine id) for a window
// (start..end). The user plays N matches against that bot during
// the window; their best result becomes their score. After the
// window closes, the event is archived.
//
// Why this works as a tournament proxy:
//   - Same bot for everyone in the same window → fair comparison.
//   - Result archived per-user locally; the leaderboard within one
//     person's account shows their personal best per event.
//   - Future: when backend ships (Phase 9), event records sync to
//     a global leaderboard; the local schema already has everything
//     needed.
//
// Events are AUTHORED as a static catalog (not runtime-created). That
// keeps the contract clear — no surprise "make-your-own event" UI
// that would invite abuse without moderation. Adding an event is
// editing this file (or future content/events/all.json).

import { defineStore } from './stores';
import type { Difficulty } from './engine';

const EVENTS_VERSION = 1;

export type Event = {
  id: string;
  name: string;
  description: string;
  /** Engine id to play against — must match a registered engine. */
  engineId: string;
  /** Default difficulty preset for Fairy-Stockfish-family engines.
   *  No-op for random/greedy. */
  difficulty: Difficulty;
  /** ms epoch — event starts. */
  startsAt: number;
  /** ms epoch — event ends. */
  endsAt: number;
  /** Higher number = more points per win in this event. Lets us run
   *  a "Master Showdown" where wins are worth more than a casual
   *  "Random Friday". */
  pointsPerWin: number;
  pointsPerDraw: number;
};

export type EventScore = {
  eventId: string;
  /** Best (most points) result achieved during the window. */
  bestPoints: number;
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  lastUpdatedAt: number;
};

export type EventStore = {
  scores: Record<string, EventScore>;
};

const store = defineStore<EventStore>({
  key: 'openmakruk_events',
  version: EVENTS_VERSION,
  default: () => ({ scores: {} }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<EventStore>;
    return {
      scores: obj.scores && typeof obj.scores === 'object' ? obj.scores : {},
    };
  },
});

export function loadEventScores(): Record<string, EventScore> {
  return store.load().scores;
}

export function saveEventScore(s: EventScore): void {
  const current = store.load().scores;
  store.save({ scores: { ...current, [s.eventId]: s } });
}

// ─── Event catalog ─────────────────────────────────────────────────
//
// Static, authored events. Time-bound by absolute timestamps. After
// `endsAt` passes the event is "archived" — UI shows it as past.
//
// The first event runs from now → +7 days so a fresh install sees an
// active event immediately. Subsequent events have explicit dates.
//
// Adding events:
//   1. Append an entry below.
//   2. Pick a unique id (e.g. 'evt-2026-06-personality-friday').
//   3. Reference an engine that's registered (fairy-stockfish or any
//      `personality:<id>` from src/lib/personalities/personalities.ts).
//
// Note (2026-05-27): the old 'random-bot' / 'greedy-bot' baseline
// engines were removed because they masked review-engine bugs (see
// src/lib/engine.ts comment). The events below previously pointed at
// those ids and would 404 on click — they're now rerouted to the
// closest-feel personality bots (Wanderer for "random feel" / Hunter
// for "capture-everything").

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

export const EVENTS: Event[] = [
  {
    id: 'evt-wanderer-week',
    name: '🍃 Wanderer Week',
    description: 'แข่งกับ 🍃 นักเดิน · เดินไปเรื่อย ๆ ไม่มีแผน · ลองเอาชนะให้เร็วที่สุด',
    engineId: 'personality:wanderer',
    difficulty: 'easy',
    startsAt: NOW - DAY,         // already started
    endsAt: NOW + 7 * DAY,       // +7 days
    pointsPerWin: 5,
    pointsPerDraw: 2,
  },
  {
    id: 'evt-hunter-hunt',
    name: '🦅 Hunter Hunt',
    description: 'แข่งกับ 🦅 นักล่า ที่จับทุกตัวที่ลอย · ระวังให้ดี · ของฟรีไม่มี',
    engineId: 'personality:hunter',
    difficulty: 'medium',
    startsAt: NOW + 7 * DAY,
    endsAt: NOW + 14 * DAY,
    pointsPerWin: 8,
    pointsPerDraw: 3,
  },
  {
    id: 'evt-personality-festival',
    name: '🎭 Personality Festival',
    description: 'พบกับสไตล์ต่างๆ · ตั้งค่า bot เป็น personality ใดก็ได้ · คะแนนเท่ากัน',
    engineId: 'personality:hunter',
    difficulty: 'medium',
    startsAt: NOW + 7 * DAY,
    endsAt: NOW + 14 * DAY,
    pointsPerWin: 6,
    pointsPerDraw: 2,
  },
  {
    id: 'evt-master-showdown',
    name: '👑 Master Showdown',
    description: 'แข่งกับ Fairy-Stockfish ระดับ Master · ของจริง · ใครชนะคือเก่งจริง',
    engineId: 'fairy-stockfish',
    difficulty: 'master',
    startsAt: NOW + 14 * DAY,
    endsAt: NOW + 21 * DAY,
    pointsPerWin: 30,
    pointsPerDraw: 10,
  },
];

/** Active events as of `now`. */
export function activeEvents(now: number = Date.now()): Event[] {
  return EVENTS.filter((e) => e.startsAt <= now && now < e.endsAt);
}

/** Upcoming events (haven't started). */
export function upcomingEvents(now: number = Date.now()): Event[] {
  return EVENTS.filter((e) => e.startsAt > now);
}

/** Archived events (already ended). */
export function pastEvents(now: number = Date.now()): Event[] {
  return EVENTS.filter((e) => e.endsAt <= now);
}

/**
 * Apply a game outcome to the user's score for an event. Idempotent
 * per-game — caller is responsible for not double-counting (typically
 * via the same gameRecordedRef flag used for stats).
 */
export function applyEventOutcome(
  event: Event,
  outcome: 'win' | 'loss' | 'draw',
): EventScore {
  const current = loadEventScores()[event.id] ?? {
    eventId: event.id,
    bestPoints: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    totalGames: 0,
    lastUpdatedAt: Date.now(),
  };
  const next: EventScore = {
    ...current,
    wins: current.wins + (outcome === 'win' ? 1 : 0),
    losses: current.losses + (outcome === 'loss' ? 1 : 0),
    draws: current.draws + (outcome === 'draw' ? 1 : 0),
    totalGames: current.totalGames + 1,
    lastUpdatedAt: Date.now(),
  };
  const earned =
    (outcome === 'win' ? event.pointsPerWin : 0) +
    (outcome === 'draw' ? event.pointsPerDraw : 0);
  next.bestPoints = Math.max(current.bestPoints, current.bestPoints + earned);
  saveEventScore(next);
  return next;
}

/** Quick utility: which event (if any) should this game count toward,
 *  given the user's current settings? Match on engineId + difficulty
 *  + time window. */
export function matchEvent(
  engineId: string,
  difficulty: Difficulty,
  now: number = Date.now(),
): Event | null {
  for (const e of EVENTS) {
    if (e.startsAt <= now && now < e.endsAt) {
      if (e.engineId !== engineId) continue;
      if (e.engineId === 'fairy-stockfish' && e.difficulty !== difficulty) continue;
      return e;
    }
  }
  return null;
}
