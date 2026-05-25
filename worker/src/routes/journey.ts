// Journey endpoint — server computes the current level + next-level
// checkpoint state for the authenticated user.
//
// All gates are cheap aggregates so this endpoint is safe to hit on
// every Profile page load. The level definition itself (LEVELS in
// worker/src/journey.ts) is static and could be served as part of
// the public catalog; we keep it inline in the response so the
// client doesn't need a second fetch.

import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, getUser, type AuthVars } from '../auth';
import { LEVELS, levelForRating, type Checkpoint, type LevelId } from '../journey';

export const journeyRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

journeyRoute.get('/me', authMiddleware, async (c) => {
  const u = getUser(c);

  // Pull cheap aggregates once. Branches in the checkpoint loop just
  // index into these objects — no per-checkpoint round-trip.
  const profile = await c.env.DB.prepare(
    'SELECT rating, province FROM users WHERE id = ?',
  ).bind(u.id).first<{ rating: number; province: string | null }>();
  const rating = profile?.rating ?? 1000;
  const province = profile?.province ?? null;

  // Win counts vs each CPU level + each bot tier.
  const cpuWinsRes = await c.env.DB.prepare(
    `SELECT opponent, COUNT(*) AS n FROM games
     WHERE user_id = ? AND outcome = 'win' AND verified = 1
       AND opponent IN ('easy','medium','hard','master')
     GROUP BY opponent`,
  ).bind(u.id).all<{ opponent: string; n: number }>();
  const cpuWins = new Map<string, number>();
  for (const r of cpuWinsRes.results ?? []) cpuWins.set(r.opponent, r.n);

  const botWinsRes = await c.env.DB.prepare(
    `SELECT u.bot_tier AS tier, COUNT(*) AS n
     FROM games g JOIN users u ON u.id = g.opponent AND u.is_bot = 1
     WHERE g.user_id = ? AND g.outcome = 'win' AND g.verified = 1
     GROUP BY u.bot_tier`,
  ).bind(u.id).all<{ tier: string; n: number }>();
  const botTierWins = new Map<string, number>();
  for (const r of botWinsRes.results ?? []) botTierWins.set(r.tier, r.n);

  const beatBossRes = await c.env.DB.prepare(
    `SELECT 1 AS hit FROM games
     WHERE user_id = ? AND opponent = 'bot:fairy-stockfish-boss'
       AND outcome = 'win' AND verified = 1 LIMIT 1`,
  ).bind(u.id).first<{ hit: number }>();
  const beatBoss = beatBossRes !== null;

  const puzzleRes = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT puzzle_id) AS n FROM puzzle_solves
     WHERE user_id = ? AND outcome = 'solved'`,
  ).bind(u.id).first<{ n: number }>();
  const puzzlesSolved = puzzleRes?.n ?? 0;

  // Streak: same logic as badge eval — pull last 60 unique-day buckets,
  // walk for consecutive descending days from today.
  const streakRes = await c.env.DB.prepare(
    `SELECT DISTINCT DATE(created_at / 1000, 'unixepoch') AS d FROM games
     WHERE user_id = ? ORDER BY d DESC LIMIT 60`,
  ).bind(u.id).all<{ d: string }>();
  const days = (streakRes.results ?? []).map((r) => r.d);
  const streak = computeStreakLength(days);

  // Province rank — only if user set their province.
  let provinceRank: number | null = null;
  if (province) {
    const r = await c.env.DB.prepare(
      `WITH weights(opponent, weight) AS (VALUES ('easy',1),('medium',3),('hard',8),('master',20)),
            scores AS (
              SELECT u.id AS user_id,
                     SUM(CASE WHEN g.outcome='win' THEN w.weight
                              WHEN g.outcome='draw' THEN w.weight*0.5 ELSE 0 END) AS score
              FROM games g JOIN users u ON u.id = g.user_id
              JOIN weights w ON w.opponent = g.opponent
              WHERE g.mode='rated' AND g.verified=1 AND u.province = ?
              GROUP BY u.id HAVING score > 0
            )
       SELECT rank FROM (SELECT user_id, RANK() OVER (ORDER BY score DESC) AS rank FROM scores)
       WHERE user_id = ?`,
    ).bind(province, u.id).first<{ rank: number }>();
    provinceRank = r?.rank ?? null;
  }

  const evaluator = (cp: Checkpoint): { complete: boolean; doneCount: number; neededCount: number } => {
    switch (cp.kind) {
      case 'rating-gte': {
        const need = Number(cp.value);
        return { complete: rating >= need, doneCount: rating, neededCount: need };
      }
      case 'wins-vs-cpu-gte': {
        const [level, nStr] = cp.value.split(':');
        const need = Number(nStr);
        const done = cpuWins.get(level) ?? 0;
        return { complete: done >= need, doneCount: done, neededCount: need };
      }
      case 'puzzles-solved-gte': {
        const need = Number(cp.value);
        return { complete: puzzlesSolved >= need, doneCount: puzzlesSolved, neededCount: need };
      }
      case 'bot-tier-beaten': {
        const done = botTierWins.get(cp.value) ?? 0;
        return { complete: done >= 1, doneCount: done, neededCount: 1 };
      }
      case 'streak-days-gte': {
        const need = Number(cp.value);
        return { complete: streak >= need, doneCount: streak, neededCount: need };
      }
      case 'province-rank-lte': {
        const need = Number(cp.value);
        if (provinceRank === null) return { complete: false, doneCount: 0, neededCount: need };
        return { complete: provinceRank <= need, doneCount: provinceRank, neededCount: need };
      }
      case 'beat-boss': {
        return { complete: beatBoss, doneCount: beatBoss ? 1 : 0, neededCount: 1 };
      }
    }
  };

  const currentLevel: LevelId = levelForRating(rating);
  // The "next-level" view: pick checkpoints OF the current level (which
  // are the ones you need to graduate). If user is already master,
  // checkpoints array is empty by definition.
  const currentDef = LEVELS.find((l) => l.id === currentLevel);
  const nextLevel = currentDef
    ? LEVELS[LEVELS.findIndex((l) => l.id === currentLevel) + 1] ?? null
    : null;

  const checkpoints = (currentDef?.checkpoints ?? []).map((cp) => ({
    ...cp,
    ...evaluator(cp),
  }));

  return c.json({
    currentLevel,
    currentNameTh: currentDef?.nameTh ?? '',
    currentIcon: currentDef?.icon ?? '',
    nextLevel: nextLevel?.id ?? null,
    nextNameTh: nextLevel?.nameTh ?? null,
    nextIcon: nextLevel?.icon ?? null,
    nextRatingFloor: nextLevel?.ratingFloor ?? null,
    checkpoints,
    levelLadder: LEVELS.map((l) => ({
      id: l.id,
      nameTh: l.nameTh,
      icon: l.icon,
      ratingFloor: l.ratingFloor,
    })),
    rating,
  });
});

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
