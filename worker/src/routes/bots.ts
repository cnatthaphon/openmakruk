// Bot character endpoints.
//
// GET /api/bots          — list every bot character + live stats (rating,
//                          W/L/D pulled from games table)
// GET /api/bots/:id      — single bot profile + recent games against this user
//
// Bots are rows in `users` with is_bot = 1; their rating moves through
// the same Elo math humans do (see Phase 9H-2 recordGame mutation),
// so the leaderboard mixes them naturally. Filtering bots in/out is a
// query-string concern on the existing /api/leaderboard/match route.

import { Hono } from 'hono';
import type { Env } from '../index';
import type { AuthVars } from '../auth';

export const botsRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

type BotRow = {
  id: string;
  display_name: string;
  rating: number;
  bot_personality: string;
  bot_tier: string;
  bot_lore_th: string;
  bot_avatar: string;
};

type Stats = {
  bot_id: string;
  wins: number;
  losses: number;
  draws: number;
  games_played: number;
};

/** Full catalog with denormalized stats. Used by the AI Lab / bot
 *  picker UI. Stats are computed live from games table — no cache. */
botsRoute.get('/', async (c) => {
  const bots = await c.env.DB.prepare(
    `SELECT id, display_name, rating, bot_personality, bot_tier,
            bot_lore_th, bot_avatar
     FROM users
     WHERE is_bot = 1
     ORDER BY rating ASC, display_name ASC`,
  ).all<BotRow>();

  // Aggregate human-vs-bot stats: for each bot id, count games where
  // it was the opponent. Outcome is from the HUMAN's POV, so a 'win'
  // row means a human beat the bot — invert for bot stats.
  const stats = await c.env.DB.prepare(
    `SELECT opponent AS bot_id,
            SUM(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN outcome = 'win'  THEN 1 ELSE 0 END) AS losses,
            SUM(CASE WHEN outcome = 'draw' THEN 1 ELSE 0 END) AS draws,
            COUNT(*) AS games_played
     FROM games
     WHERE opponent LIKE 'bot:%' AND verified = 1
     GROUP BY opponent`,
  ).all<Stats>();
  const statsById = new Map<string, Stats>();
  for (const s of stats.results ?? []) statsById.set(s.bot_id, s);

  const rows = bots.results ?? [];
  return c.json({
    bots: rows.map((b) => {
      const s = statsById.get(b.id);
      return {
        id: b.id,
        displayName: b.display_name,
        rating: b.rating,
        personality: b.bot_personality,
        tier: b.bot_tier,
        lore: b.bot_lore_th,
        avatar: b.bot_avatar,
        wins: s?.wins ?? 0,
        losses: s?.losses ?? 0,
        draws: s?.draws ?? 0,
        gamesPlayed: s?.games_played ?? 0,
      };
    }),
  });
});

/** Single bot — same shape as list entry; convenient for deep links
 *  like `/#/bots/bot:attacker-veteran`. */
botsRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!id.startsWith('bot:')) {
    return c.json({ error: 'bad_request', reason: 'not_a_bot_id' }, 400);
  }
  const bot = await c.env.DB.prepare(
    `SELECT id, display_name, rating, bot_personality, bot_tier,
            bot_lore_th, bot_avatar
     FROM users
     WHERE id = ? AND is_bot = 1`,
  )
    .bind(id)
    .first<BotRow>();
  if (!bot) return c.json({ error: 'not_found' }, 404);

  const stats = await c.env.DB.prepare(
    `SELECT SUM(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN outcome = 'win'  THEN 1 ELSE 0 END) AS losses,
            SUM(CASE WHEN outcome = 'draw' THEN 1 ELSE 0 END) AS draws,
            COUNT(*) AS games_played
     FROM games
     WHERE opponent = ? AND verified = 1`,
  )
    .bind(id)
    .first<{ wins: number; losses: number; draws: number; games_played: number }>();

  return c.json({
    id: bot.id,
    displayName: bot.display_name,
    rating: bot.rating,
    personality: bot.bot_personality,
    tier: bot.bot_tier,
    lore: bot.bot_lore_th,
    avatar: bot.bot_avatar,
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    draws: stats?.draws ?? 0,
    gamesPlayed: stats?.games_played ?? 0,
  });
});
