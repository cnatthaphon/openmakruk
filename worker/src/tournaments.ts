// Tournament periods catalog.
//
// Two kinds of windows surface to the client:
//   1. RECURRING — pattern-based (e.g. "every Sunday"). The server
//      computes the current week's instance dynamically.
//   2. ONE-OFF   — explicit start/end timestamps (festival majors).
//
// Match-LB scoring multiplier: games whose created_at falls inside an
// active window get score × multiplier. Recurring "Sunday Showdown"
// uses 1.5×; one-off majors use higher (2×). The multiplier is
// SUGGESTED via the API; the LB SQL applies it via a CASE join.
//
// Adding a tournament = append to the catalog. No DB row needed —
// the data lives in code so we can ship narrative copy + UI hooks
// together. If tournaments become first-class user-created entities
// later, this catalog becomes the seed for that table.

export type TournamentKind = 'recurring' | 'one-off';

export type RecurringPattern = {
  kind: 'recurring';
  /** Day of week (0 = Sunday … 6 = Saturday) in UTC. */
  dayUtc: number;
  /** Window hours in UTC, inclusive start, exclusive end. */
  startHourUtc: number;
  endHourUtc: number;
};

export type OneOffPattern = {
  kind: 'one-off';
  startsAt: number; // unix ms
  endsAt: number;   // unix ms
};

export type Tournament = {
  id: string;
  nameTh: string;
  descTh: string;
  icon: string;
  multiplier: number;
  pattern: RecurringPattern | OneOffPattern;
};

export const TOURNAMENTS: Tournament[] = [
  {
    id: 'sunday-showdown',
    nameTh: '🌅 Sunday Showdown',
    descTh: 'ทุกวันอาทิตย์ · เกมที่เล่นช่วงนี้ได้คะแนน × 1.5 บน match leaderboard',
    icon: '🌅',
    multiplier: 1.5,
    // Sundays 00:00 – 23:59 UTC (Thailand is UTC+7, so this is roughly
    // Sun 07:00 → Mon 06:59 TH local time). When we add TZ-aware
    // overrides, this will move; the multiplier semantics stay.
    pattern: { kind: 'recurring', dayUtc: 0, startHourUtc: 0, endHourUtc: 24 },
  },
];

/** Window for the current instance of a recurring pattern, anchored
 *  to "now". Returns null if today isn't the recurring day. */
function currentWindow(
  pattern: RecurringPattern | OneOffPattern,
  now: number,
): { startsAt: number; endsAt: number } | null {
  if (pattern.kind === 'one-off') {
    if (now >= pattern.startsAt && now < pattern.endsAt) {
      return { startsAt: pattern.startsAt, endsAt: pattern.endsAt };
    }
    return null;
  }
  const d = new Date(now);
  if (d.getUTCDay() !== pattern.dayUtc) return null;
  const dayStart = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    pattern.startHourUtc,
  );
  const dayEnd = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    pattern.endHourUtc,
  );
  if (now >= dayStart && now < dayEnd) return { startsAt: dayStart, endsAt: dayEnd };
  return null;
}

/** Next upcoming window for a recurring pattern. Used by the UI to
 *  show "starts in N hours" countdowns. */
function nextWindow(
  pattern: RecurringPattern | OneOffPattern,
  now: number,
): { startsAt: number; endsAt: number } | null {
  if (pattern.kind === 'one-off') {
    return now < pattern.startsAt
      ? { startsAt: pattern.startsAt, endsAt: pattern.endsAt }
      : null;
  }
  // Walk forward day-by-day to the next matching dayUtc.
  for (let i = 0; i < 7; i++) {
    const d = new Date(now + i * 86_400_000);
    if (d.getUTCDay() !== pattern.dayUtc) continue;
    const startsAt = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      pattern.startHourUtc,
    );
    const endsAt = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      pattern.endHourUtc,
    );
    if (startsAt > now) return { startsAt, endsAt };
  }
  return null;
}

/** Catalog with computed "now" status per tournament. */
export function tournamentsWithStatus(now: number = Date.now()) {
  return TOURNAMENTS.map((t) => {
    const active = currentWindow(t.pattern, now);
    const upcoming = active ? null : nextWindow(t.pattern, now);
    return {
      id: t.id,
      nameTh: t.nameTh,
      descTh: t.descTh,
      icon: t.icon,
      multiplier: t.multiplier,
      active: active !== null,
      activeUntil: active?.endsAt ?? null,
      upcomingStartsAt: upcoming?.startsAt ?? null,
      upcomingEndsAt: upcoming?.endsAt ?? null,
    };
  });
}
