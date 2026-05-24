// Match leaderboard scoring — a single weighted number summarising
// the user's CPU-match record. Pure function of `UserStats.byLevel`;
// no separate storage needed.
//
// Weights chosen to feel "fair":
//   easy   = 1pt per win  (it's beginner)
//   medium = 3pt per win
//   hard   = 7pt per win
//   master = 15pt per win (~half a Stockfish point)
//
// Draws count as half a win (round down). Losses count zero —
// negative wouldn't reward variety. The number is a single integer
// for compactness in UI.
//
// Future: global ladder via backend → submit `MatchScore` from
// `BackendAdapter`. Until then, this is a self-improvement gauge.

import type { Difficulty } from './engine';
import type { UserStats, LevelRecord } from './stats';

export const MATCH_WEIGHTS: Record<Difficulty, number> = {
  easy: 1,
  medium: 3,
  hard: 7,
  master: 15,
};

export type MatchLeaderboardEntry = {
  level: Difficulty;
  weight: number;
  record: LevelRecord;
  /** Points contributed by this level (wins + draws/2). */
  points: number;
};

export type MatchLeaderboard = {
  total: number;
  byLevel: MatchLeaderboardEntry[];
  /** Total wins across all levels. */
  totalWins: number;
  /** Total games (wins + losses + draws). */
  totalGames: number;
};

export function computeMatchLeaderboard(stats: UserStats): MatchLeaderboard {
  let total = 0;
  let totalWins = 0;
  let totalGames = 0;
  const entries: MatchLeaderboardEntry[] = [];
  for (const level of ['easy', 'medium', 'hard', 'master'] as Difficulty[]) {
    const record = stats.byLevel[level];
    const weight = MATCH_WEIGHTS[level];
    const points = record.wins * weight + Math.floor(record.draws * weight / 2);
    total += points;
    totalWins += record.wins;
    totalGames += record.wins + record.losses + record.draws;
    entries.push({ level, weight, record, points });
  }
  return { total, byLevel: entries, totalWins, totalGames };
}

/** "12,345" — locale-formatted for readability. */
export function formatScore(n: number): string {
  return n.toLocaleString('en-US');
}
