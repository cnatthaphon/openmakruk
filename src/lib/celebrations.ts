// Celebration moments — one-time cinematic acknowledgments when the
// user crosses a meaningful threshold. Co-Claude flagged this as a
// ~40% gap vs chess.com: rating just changes silently when you cross
// 1200 → ขุนทอง, no moment to mark it. This layer adds that moment.
//
// Triggers (each fires AT MOST ONCE per user):
//   • Rating tier crossing — 1000 / 1200 / 1400 / 1600 / 1800 / 2000 / 2200
//   • Streak milestones — 3 / 7 / 14 / 30 / 100 days
//   • First Master-tier bot defeated (future hook; not wired yet)
//
// Storage: a tiny `seen` set under defineStore so a reload doesn't
// re-fire the same milestone. Cleared explicitly by the user via
// Settings → reset, intentional so post-reset celebrations replay.
//
// Trigger discipline: detectCelebration only RETURNS what should
// fire; the caller decides when to render. This keeps the lib
// pure / testable and lets the UI sequence multiple moments without
// rendering all at once.

import { defineStore } from './stores';
import { TITLE_TIERS, type TitleTier } from './titles';

const STORE_VERSION = 1;

export type CelebrationKind =
  | { kind: 'tier'; tier: TitleTier }
  | { kind: 'streak'; days: number };

type SeenSet = { tiers: number[]; streaks: number[] };

const store = defineStore<SeenSet>({
  key: 'openmakruk_celebrations_seen',
  version: STORE_VERSION,
  default: () => ({ tiers: [], streaks: [] }),
  migrate: (raw) => {
    if (!raw || typeof raw !== 'object') return { tiers: [], streaks: [] };
    const obj = raw as Partial<SeenSet>;
    return {
      tiers: Array.isArray(obj.tiers) ? obj.tiers.filter((n): n is number => typeof n === 'number') : [],
      streaks: Array.isArray(obj.streaks) ? obj.streaks.filter((n): n is number => typeof n === 'number') : [],
    };
  },
});

/** Milestone streak days we fire on. Aligned to chess-community
 *  defaults — 3 to acknowledge habit-formation, 7 / 14 / 30 / 100
 *  for the long-term ladders. */
const STREAK_MILESTONES = [3, 7, 14, 30, 100];

/** Inspect current state vs the seen-set, return ONE pending
 *  celebration if any. Returns null when nothing new to celebrate.
 *  Caller is expected to render it then call markSeen. */
export function detectCelebration(rating: number, streakDays: number): CelebrationKind | null {
  const seen = store.load();
  // Tier check — find the highest tier the user qualifies for that
  // hasn't been celebrated yet. We iterate from highest down so
  // crossing multiple thresholds at once (rare but possible during
  // an import) fires the BIGGEST one first.
  for (let i = TITLE_TIERS.length - 1; i >= 0; i--) {
    const t = TITLE_TIERS[i];
    if (rating < t.minRating) continue;
    // Skip the entry tiers — celebrating "you started playing"
    // (มือใหม่ at 0) or "you registered" (ผู้เล่น at the default
    // 1000) is noise. The first ladder rung worth celebrating is
    // ขุนทอง at 1200 — see comment in lib/titles.ts which calls it
    // 'the first real title'. Below 1200, silence.
    if (t.minRating < 1200) continue;
    if (seen.tiers.includes(t.minRating)) continue;
    return { kind: 'tier', tier: t };
  }
  // Streak check — fire on the highest milestone the user is at or
  // above that's still unseen.
  for (let i = STREAK_MILESTONES.length - 1; i >= 0; i--) {
    const days = STREAK_MILESTONES[i];
    if (streakDays < days) continue;
    if (seen.streaks.includes(days)) continue;
    return { kind: 'streak', days };
  }
  return null;
}

/** Record that a celebration has been shown so it doesn't replay
 *  on the next render tick. */
export function markCelebrationSeen(c: CelebrationKind): void {
  const seen = store.load();
  if (c.kind === 'tier' && !seen.tiers.includes(c.tier.minRating)) {
    store.save({ ...seen, tiers: [...seen.tiers, c.tier.minRating] });
  } else if (c.kind === 'streak' && !seen.streaks.includes(c.days)) {
    store.save({ ...seen, streaks: [...seen.streaks, c.days] });
  }
}

/** Reset all celebration seen-state. Hooked into Settings → reset
 *  via App.tsx handleResetAll so a fresh-start user can re-experience
 *  the moments. */
export function resetCelebrations(): void {
  store.clear();
}
