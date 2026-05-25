// Server-side badge evaluator.
//
// Called after every recordGame (and on-demand via GET /api/users/me/badges).
// Computes which badges the user qualifies for from the current state of:
//   - users.rating
//   - games table (count, opponent, outcome, created_at by day)
//   - puzzle_solves table (solved count)
//   - leaderboard_cache (province rank — derived on-the-fly via match LB query)
//
// INSERT OR IGNORE writes — a badge is never re-issued; the timestamp
// + slug from the first qualifying moment is preserved forever even
// if the user later drops below threshold.
//
// Returns the LIST of badge ids newly unlocked in this call, so the
// caller (recordGame) can echo them back as `newBadges` in the API
// response. Client toasts each.

import type { D1Database } from '@cloudflare/workers-types';
import { BADGES, findBadge, makeShareableSlug } from './badges';

const MATCH_WEIGHTS: Record<string, number> = {
  easy: 1,
  medium: 3,
  hard: 8,
  master: 20,
};

export async function evaluateBadges(
  db: D1Database,
  userId: string,
): Promise<string[]> {
  // 1. Pull the cheap aggregates in one round-trip.
  const profile = await db
    .prepare('SELECT rating, province, is_bot FROM users WHERE id = ?')
    .bind(userId)
    .first<{ rating: number; province: string | null; is_bot: number }>();
  if (!profile || profile.is_bot === 1) return []; // bots don't earn badges

  // 2. Already-unlocked set — skip computing those.
  const alreadyRes = await db
    .prepare('SELECT badge_id FROM user_badges WHERE user_id = ?')
    .bind(userId)
    .all<{ badge_id: string }>();
  const already = new Set((alreadyRes.results ?? []).map((r) => r.badge_id));

  const candidates: string[] = [];

  // ─── Rating ladder ──────────────────────────────────────────────
  for (const b of BADGES.filter((x) => x.category === 'rating')) {
    if (already.has(b.id)) continue;
    if (profile.rating >= b.threshold) candidates.push(b.id);
  }

  // ─── Puzzle solver ──────────────────────────────────────────────
  // Count distinct puzzles the user solved with outcome='solved'. We
  // don't credit 'partial' to keep the bar meaningful.
  const puzzleRes = await db
    .prepare(
      `SELECT COUNT(DISTINCT puzzle_id) AS n
       FROM puzzle_solves WHERE user_id = ? AND outcome = 'solved'`,
    )
    .bind(userId)
    .first<{ n: number }>();
  const puzzleCount = puzzleRes?.n ?? 0;
  for (const b of BADGES.filter((x) => x.category === 'puzzles')) {
    if (already.has(b.id)) continue;
    if (puzzleCount >= b.threshold) candidates.push(b.id);
  }

  // ─── Bot conqueror ──────────────────────────────────────────────
  // Tier-based: does the user have ≥1 verified win vs any bot of
  // each tier? + "all 7 personalities" + "boss".
  const botWinsRes = await db
    .prepare(
      `SELECT u.bot_tier AS tier, u.bot_personality AS personality, u.id AS bot_id, COUNT(*) AS wins
       FROM games g
       JOIN users u ON u.id = g.opponent AND u.is_bot = 1
       WHERE g.user_id = ? AND g.outcome = 'win' AND g.verified = 1
       GROUP BY u.id`,
    )
    .bind(userId)
    .all<{ tier: string; personality: string; bot_id: string; wins: number }>();
  const winRows = botWinsRes.results ?? [];
  const tierWins = new Set(winRows.map((r) => r.tier));
  const beatBoss = winRows.some((r) => r.bot_id === 'bot:fairy-stockfish-boss');
  const distinctPersonalities = new Set(winRows.map((r) => r.personality)).size;

  if (!already.has('bot-rookie')  && tierWins.has('rookie'))  candidates.push('bot-rookie');
  if (!already.has('bot-veteran') && tierWins.has('veteran')) candidates.push('bot-veteran');
  if (!already.has('bot-master')  && tierWins.has('master'))  candidates.push('bot-master');
  if (!already.has('bot-all-personalities') && distinctPersonalities >= 7) {
    candidates.push('bot-all-personalities');
  }
  if (!already.has('bot-boss') && beatBoss) candidates.push('bot-boss');

  // ─── Streak ─────────────────────────────────────────────────────
  // Count consecutive unique calendar days ending today (UTC). Cheap
  // because we just pull the most recent ~60 days of game timestamps.
  const streakRes = await db
    .prepare(
      `SELECT DISTINCT DATE(created_at / 1000, 'unixepoch') AS d
       FROM games
       WHERE user_id = ?
       ORDER BY d DESC
       LIMIT 60`,
    )
    .bind(userId)
    .all<{ d: string }>();
  const days = (streakRes.results ?? []).map((r) => r.d);
  const streak = computeStreakLength(days);
  for (const b of BADGES.filter((x) => x.category === 'streak')) {
    if (already.has(b.id)) continue;
    if (streak >= b.threshold) candidates.push(b.id);
  }

  // ─── Region top-N ───────────────────────────────────────────────
  // Only meaningful if the user declared a province. Compute their
  // rank within the province's match-score leaderboard.
  if (profile.province) {
    const provinceRank = await computeProvinceRank(db, profile.province, userId);
    if (provinceRank !== null) {
      for (const b of BADGES.filter((x) => x.category === 'region')) {
        if (already.has(b.id)) continue;
        if (provinceRank <= b.threshold) candidates.push(b.id);
      }
    }
  }

  // 3. Persist newly-unlocked rows. INSERT OR IGNORE → idempotent.
  if (candidates.length === 0) return [];
  const now = Date.now();
  const inserted: string[] = [];
  for (const id of candidates) {
    if (!findBadge(id)) continue;
    const slug = makeShareableSlug(id);
    try {
      const res = await db
        .prepare(
          `INSERT OR IGNORE INTO user_badges (user_id, badge_id, unlocked_at, shareable_slug)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(userId, id, now, slug)
        .run();
      // D1 reports `meta.rows_written` for INSERT; rely on it to
      // distinguish "newly inserted" from "already there".
      if (res.meta?.rows_written && res.meta.rows_written > 0) {
        inserted.push(id);
      }
    } catch {
      // Slug collision is theoretically possible (~36^6 namespace);
      // skip and the next evaluation will retry with fresh randomness.
    }
  }
  return inserted;
}

// ─── helpers ───────────────────────────────────────────────────────

/** Walk the sorted-desc day list and count how many consecutive days
 *  ending at the most recent entry are present. Returns 0 for empty
 *  input. Day strings are YYYY-MM-DD UTC. */
function computeStreakLength(days: string[]): number {
  if (days.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + 'T00:00:00Z').getTime();
    const cur = new Date(days[i] + 'T00:00:00Z').getTime();
    if (prev - cur === 86_400_000) streak++;
    else break;
  }
  return streak;
}

/** Recompute the user's province-leaderboard rank from scratch. SQL
 *  mirrors /api/leaderboard/match?province=<code> but only returns
 *  the user's position (RANK() window function). */
async function computeProvinceRank(
  db: D1Database,
  province: string,
  userId: string,
): Promise<number | null> {
  const weightRows = Object.entries(MATCH_WEIGHTS)
    .map(([k, v]) => `('${k}', ${v})`)
    .join(', ');
  const sql = `
    WITH weights(opponent, weight) AS (VALUES ${weightRows}),
         scores AS (
           SELECT u.id AS user_id,
                  SUM(CASE WHEN g.outcome = 'win'  THEN w.weight
                           WHEN g.outcome = 'draw' THEN w.weight * 0.5
                           ELSE 0 END) AS score
           FROM games g
           JOIN users u ON u.id = g.user_id
           JOIN weights w ON w.opponent = g.opponent
           WHERE g.mode = 'rated' AND g.verified = 1 AND u.province = ?
           GROUP BY u.id
           HAVING score > 0
         )
    SELECT rank
    FROM (SELECT user_id, RANK() OVER (ORDER BY score DESC) AS rank FROM scores)
    WHERE user_id = ?
  `;
  const r = await db.prepare(sql).bind(province, userId).first<{ rank: number }>();
  return r?.rank ?? null;
}
