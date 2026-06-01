// Insights — pure analytical functions over the user's GameRecord[]
// history. No new state; no new persistence. The Profile page reads
// stats.history and asks computeInsights() for a digest.
//
// All math is local; history is capped at 50 games (see stats.ts) so
// these numbers reflect "recent activity," not lifetime totals. That's
// a deliberate trade: lichess-style lifetime insights require backend
// retention we don't have. The 50-game window catches form/trend
// changes — which is what users mostly want to see anyway.
//
// Design rule: every computed number must be safe with an empty
// history. Callers shouldn't have to guard.

import type { Difficulty } from './engine';
import type { GameRecord } from './stats';

export type SideStats = {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winRate: number; // 0..1
};

export type Insights = {
  totalGames: number;
  asWhite: SideStats;
  asBlack: SideStats;
  byLevel: Record<Difficulty, SideStats>;
  avgPlies: number;
  shortGames: number;        // < 30 plies — likely blunder-out
  mediumGames: number;       // 30..80 — typical game
  longGames: number;         // > 80 plies — endgame grinds
  recentForm: SideStats;     // last 10 games
  longestWinStreak: number;
  longestLossStreak: number;
  byTimeControl: Record<string, number>;
  perDayOfWeek: number[];    // index 0 = Sunday, 6 = Saturday
  perHour: number[];         // 24 buckets
  /** Best win — highest opponent rating defeated. null if no wins. */
  bestWinAgainst: Difficulty | null;
  /** Average rating delta per game. Positive = climbing. */
  avgRatingDelta: number;
};

const EMPTY_SIDE: SideStats = { wins: 0, losses: 0, draws: 0, total: 0, winRate: 0 };

function emptySide(): SideStats {
  return { wins: 0, losses: 0, draws: 0, total: 0, winRate: 0 };
}

function addOutcome(s: SideStats, outcome: GameRecord['outcome']): SideStats {
  const next: SideStats = {
    wins: s.wins + (outcome === 'win' ? 1 : 0),
    losses: s.losses + (outcome === 'loss' ? 1 : 0),
    draws: s.draws + (outcome === 'draw' ? 1 : 0),
    total: s.total + 1,
    winRate: 0,
  };
  next.winRate = next.total > 0 ? next.wins / next.total : 0;
  return next;
}

export function computeInsights(history: GameRecord[]): Insights {
  const out: Insights = {
    totalGames: history.length,
    asWhite: emptySide(),
    asBlack: emptySide(),
    byLevel: {
      easy: emptySide(),
      medium: emptySide(),
      hard: emptySide(),
      master: emptySide(),
    },
    avgPlies: 0,
    shortGames: 0,
    mediumGames: 0,
    longGames: 0,
    recentForm: emptySide(),
    longestWinStreak: 0,
    longestLossStreak: 0,
    byTimeControl: {},
    perDayOfWeek: [0, 0, 0, 0, 0, 0, 0],
    perHour: new Array(24).fill(0),
    bestWinAgainst: null,
    avgRatingDelta: 0,
  };
  if (history.length === 0) return out;

  let totalPlies = 0;
  let totalDelta = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  // history is newest-first; walk in chronological order so streak
  // semantics match user intuition (consecutive in time).
  const chronological = [...history].reverse();

  // levels ordered weakest → strongest so we can compare ratings.
  const levelOrder: Difficulty[] = ['easy', 'medium', 'hard', 'master'];
  let bestWinIdx = -1;

  for (const g of chronological) {
    if (g.userSide === 'white') out.asWhite = addOutcome(out.asWhite, g.outcome);
    else out.asBlack = addOutcome(out.asBlack, g.outcome);

    out.byLevel[g.ratingBucket] = addOutcome(out.byLevel[g.ratingBucket], g.outcome);

    totalPlies += g.plyCount;
    if (g.plyCount < 30) out.shortGames++;
    else if (g.plyCount <= 80) out.mediumGames++;
    else out.longGames++;

    const tcKey = g.timeControlId ?? 'unlimited';
    out.byTimeControl[tcKey] = (out.byTimeControl[tcKey] ?? 0) + 1;

    const d = new Date(g.date);
    out.perDayOfWeek[d.getDay()]++;
    out.perHour[d.getHours()]++;

    totalDelta += g.ratingDelta;

    if (g.outcome === 'win') {
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > out.longestWinStreak) out.longestWinStreak = currentWinStreak;
      const idx = levelOrder.indexOf(g.ratingBucket);
      if (idx > bestWinIdx) {
        bestWinIdx = idx;
        out.bestWinAgainst = g.ratingBucket;
      }
    } else if (g.outcome === 'loss') {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > out.longestLossStreak) out.longestLossStreak = currentLossStreak;
    } else {
      // draws break both streaks
      currentWinStreak = 0;
      currentLossStreak = 0;
    }
  }

  out.avgPlies = totalPlies / history.length;
  out.avgRatingDelta = totalDelta / history.length;

  // Recent form: history is newest-first, take first 10.
  for (const g of history.slice(0, 10)) {
    out.recentForm = addOutcome(out.recentForm, g.outcome);
  }

  return out;
}

/** Pretty Thai day-of-week labels for chart axes. */
export const DAY_LABELS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/** Find the user's most-played time control id (or 'unlimited'). */
export function favoriteTimeControl(i: Insights): string | null {
  const entries = Object.entries(i.byTimeControl);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

// Re-exported for tests that need the empty side without rebuilding it.
export { EMPTY_SIDE };
