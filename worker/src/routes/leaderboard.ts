// Leaderboard endpoints.
//
// GET /api/leaderboard/match — global match score, derived from games
//   table. Score = Σ (wins × weight(opponent) + draws × weight/2),
//   matching the client's formula in src/lib/leaderboard.ts.
//
//   Implementation note: we do this as an on-demand query rather than
//   reading `leaderboard_cache` because the user count is small enough
//   (early launch). When >10k users, switch to the cache table that's
//   refreshed by a cron Worker every 5 minutes.
//
// GET /api/leaderboard/rating — top N by current rating.

import { Hono } from 'hono';
import type { Env } from '../index';
import { CPU_RATINGS, opponentRating, type Difficulty } from '../elo';
import type { AuthVars } from '../auth';

// Match-score weights — match client/src/lib/leaderboard.ts. Hardcoded
// per difficulty because that's the bucket the leaderboard rewards.
// Personality bots / random / greedy contribute nothing (their wins
// are casual). This forces the leaderboard to reward beating the
// 4 calibrated CPU strengths, not farming weak personalities.
const MATCH_WEIGHTS: Record<Difficulty, number> = {
  easy: 1,
  medium: 3,
  hard: 8,
  master: 20,
};

const TOP_N_DEFAULT = 100;
const TOP_N_MAX = 200;

export const leaderboardRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

/** Match leaderboard. Heavy query but bounded (GROUP BY user + filtered
 *  to the 4 ranked opponents only). */
leaderboardRoute.get('/match', async (c) => {
  const limit = clampLimit(c.req.query('limit'));

  // Build VALUES clause for the weight join. Inline the literal numbers
  // since they're constants from this module (no user input).
  const weightRows = (Object.keys(MATCH_WEIGHTS) as Difficulty[])
    .map((d) => `('${d}', ${MATCH_WEIGHTS[d]})`)
    .join(', ');

  // Score per user = Σ (wins × weight + draws × weight/2). We compute
  // both terms by joining games to a virtual weight table.
  const sql = `
    WITH weights(opponent, weight) AS (VALUES ${weightRows})
    SELECT u.id AS user_id,
           u.display_name AS display_name,
           u.rating AS rating,
           CAST(SUM(
             CASE WHEN g.outcome = 'win'  THEN w.weight
                  WHEN g.outcome = 'draw' THEN w.weight * 0.5
                  ELSE 0 END
           ) AS REAL) AS score,
           SUM(CASE WHEN g.outcome = 'win'  THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN g.outcome = 'loss' THEN 1 ELSE 0 END) AS losses,
           SUM(CASE WHEN g.outcome = 'draw' THEN 1 ELSE 0 END) AS draws,
           COUNT(*) AS games_played,
           MAX(g.created_at) AS last_active_at
    FROM games g
    JOIN users   u ON u.id = g.user_id
    JOIN weights w ON w.opponent = g.opponent
    WHERE g.mode = 'rated'
    GROUP BY u.id
    HAVING score > 0
    ORDER BY score DESC, u.rating DESC, last_active_at ASC
    LIMIT ?
  `;

  const result = await c.env.DB.prepare(sql).bind(limit).all<MatchRow>();
  const rows = result.results ?? [];
  return c.json({
    entries: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      displayName: r.display_name,
      rating: r.rating,
      score: r.score,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      gamesPlayed: r.games_played,
      lastActiveAt: r.last_active_at,
    })),
    weights: MATCH_WEIGHTS,
    cpuRatings: CPU_RATINGS,
    // Echoed for clients that want to validate their local Elo math
    // before submitting unverified games.
    sampleOpponentRating: opponentRating('master'),
  });
});

/** Rating leaderboard — purely by users.rating descending. Cheap. */
leaderboardRoute.get('/rating', async (c) => {
  const limit = clampLimit(c.req.query('limit'));
  const sql = `
    SELECT id, display_name, rating, last_seen_at
    FROM users
    ORDER BY rating DESC, last_seen_at DESC
    LIMIT ?
  `;
  const result = await c.env.DB.prepare(sql).bind(limit).all<RatingRow>();
  const rows = result.results ?? [];
  return c.json({
    entries: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.id,
      displayName: r.display_name,
      rating: r.rating,
      lastSeenAt: r.last_seen_at,
    })),
  });
});

// ─── helpers ───────────────────────────────────────────────────────

function clampLimit(raw: string | undefined): number {
  const n = Number(raw ?? TOP_N_DEFAULT);
  if (!Number.isFinite(n) || n <= 0) return TOP_N_DEFAULT;
  return Math.min(Math.floor(n), TOP_N_MAX);
}

type MatchRow = {
  user_id: string;
  display_name: string;
  rating: number;
  score: number;
  wins: number;
  losses: number;
  draws: number;
  games_played: number;
  last_active_at: number;
};

type RatingRow = {
  id: string;
  display_name: string;
  rating: number;
  last_seen_at: number;
};
