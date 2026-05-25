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
import { PROVINCES, REGION_LABELS_TH, type Region } from '../provinces';

const VALID_REGIONS = new Set<Region>([
  'north', 'northeast', 'central', 'east', 'west', 'south',
]);

/** Codes that belong to a region — used to expand a region filter into
 *  a SQL `IN (...)` clause. Built once at module load. */
const PROVINCE_CODES_BY_REGION: Record<Region, string[]> = (() => {
  const out: Record<Region, string[]> = {
    north: [], northeast: [], central: [], east: [], west: [], south: [],
  };
  for (const p of PROVINCES) out[p.region].push(p.code);
  return out;
})();

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
  const provinceFilter = c.req.query('province');
  const regionFilter = c.req.query('region') as Region | undefined;

  // Build VALUES clause for the weight join. Inline the literal numbers
  // since they're constants from this module (no user input).
  const weightRows = (Object.keys(MATCH_WEIGHTS) as Difficulty[])
    .map((d) => `('${d}', ${MATCH_WEIGHTS[d]})`)
    .join(', ');

  // Region/province filtering. `province=10` narrows to one
  // จังหวัด; `region=north` expands to every province in ภาคเหนือ.
  // Both are optional; default = global.
  const whereExtras: string[] = [];
  const extraParams: unknown[] = [];
  if (provinceFilter) {
    whereExtras.push('u.province = ?');
    extraParams.push(provinceFilter);
  } else if (regionFilter) {
    if (!VALID_REGIONS.has(regionFilter)) {
      return c.json({ error: 'bad_request', reason: 'unknown_region' }, 400);
    }
    const codes = PROVINCE_CODES_BY_REGION[regionFilter];
    if (codes.length === 0) {
      // Shouldn't happen for known regions, but defensive.
      return c.json({ entries: [], scope: { region: regionFilter, count: 0 } });
    }
    const placeholders = codes.map(() => '?').join(', ');
    whereExtras.push(`u.province IN (${placeholders})`);
    extraParams.push(...codes);
  }
  const whereClause = ['g.mode = \'rated\'', 'g.verified = 1', ...whereExtras].join(' AND ');

  // Score per user = Σ (wins × weight + draws × weight/2). We compute
  // both terms by joining games to a virtual weight table.
  const sql = `
    WITH weights(opponent, weight) AS (VALUES ${weightRows})
    SELECT u.id AS user_id,
           u.display_name AS display_name,
           u.rating AS rating,
           u.province AS province,
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
    WHERE ${whereClause}
    GROUP BY u.id
    HAVING score > 0
    ORDER BY score DESC, u.rating DESC, last_active_at ASC
    LIMIT ?
  `;

  const result = await c.env.DB.prepare(sql)
    .bind(...extraParams, limit)
    .all<MatchRow>();
  const rows = result.results ?? [];
  return c.json({
    entries: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      displayName: r.display_name,
      rating: r.rating,
      province: r.province,
      score: r.score,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      gamesPlayed: r.games_played,
      lastActiveAt: r.last_active_at,
    })),
    weights: MATCH_WEIGHTS,
    cpuRatings: CPU_RATINGS,
    scope: {
      province: provinceFilter ?? null,
      region: regionFilter ?? null,
      regionLabelTh: regionFilter ? REGION_LABELS_TH[regionFilter] : null,
    },
    sampleOpponentRating: opponentRating('master'),
  });
});

/** Province-vs-province summary — aggregate score per province, sorted.
 *  Useful for "ภาคเหนือ vs ภาคกลาง" macro view + per-province ranking. */
leaderboardRoute.get('/match/by-province', async (c) => {
  const weightRows = (Object.keys(MATCH_WEIGHTS) as Difficulty[])
    .map((d) => `('${d}', ${MATCH_WEIGHTS[d]})`)
    .join(', ');
  const sql = `
    WITH weights(opponent, weight) AS (VALUES ${weightRows})
    SELECT u.province AS province,
           CAST(SUM(
             CASE WHEN g.outcome = 'win'  THEN w.weight
                  WHEN g.outcome = 'draw' THEN w.weight * 0.5
                  ELSE 0 END
           ) AS REAL) AS score,
           COUNT(DISTINCT u.id) AS player_count,
           COUNT(*) AS games_played
    FROM games g
    JOIN users   u ON u.id = g.user_id
    JOIN weights w ON w.opponent = g.opponent
    WHERE g.mode = 'rated' AND g.verified = 1 AND u.province IS NOT NULL
    GROUP BY u.province
    ORDER BY score DESC
  `;
  const result = await c.env.DB.prepare(sql).all<{
    province: string;
    score: number;
    player_count: number;
    games_played: number;
  }>();
  const rows = result.results ?? [];
  return c.json({
    entries: rows.map((r, i) => ({
      rank: i + 1,
      province: r.province,
      score: r.score,
      playerCount: r.player_count,
      gamesPlayed: r.games_played,
    })),
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
  province: string | null;
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
