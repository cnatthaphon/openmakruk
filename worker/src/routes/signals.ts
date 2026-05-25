// Engagement signals — counts + recent activity, all from real data.
//
// No fake "online users" — we report verified facts: games played
// today, puzzles solved today, the timestamp of the most recent
// activity. Honesty is part of the brand (open-source, no hidden
// seed bots).

import { Hono } from 'hono';
import type { Env } from '../index';

export const signalsRoute = new Hono<{ Bindings: Env }>();

signalsRoute.get('/', async (c) => {
  c.header('Cache-Control', 'public, max-age=30');

  // Today (UTC) start in ms — used by both queries.
  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();

  const gamesToday = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM games WHERE created_at >= ?',
  ).bind(dayStartMs).first<{ n: number }>();

  const puzzlesToday = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM puzzle_solves WHERE solved_at >= ? AND outcome = "solved"',
  ).bind(dayStartMs).first<{ n: number }>();

  const recentGame = await c.env.DB.prepare(
    `SELECT g.created_at, u.display_name FROM games g
     JOIN users u ON u.id = g.user_id
     WHERE u.is_bot = 0
     ORDER BY g.created_at DESC LIMIT 1`,
  ).first<{ created_at: number; display_name: string }>();

  const recentPuzzle = await c.env.DB.prepare(
    `SELECT ps.solved_at, u.display_name FROM puzzle_solves ps
     JOIN users u ON u.id = ps.user_id
     WHERE ps.outcome = 'solved' AND u.is_bot = 0
     ORDER BY ps.solved_at DESC LIMIT 1`,
  ).first<{ solved_at: number; display_name: string }>();

  return c.json({
    gamesToday: gamesToday?.n ?? 0,
    puzzlesToday: puzzlesToday?.n ?? 0,
    lastGame: recentGame
      ? { at: recentGame.created_at, displayName: recentGame.display_name }
      : null,
    lastPuzzle: recentPuzzle
      ? { at: recentPuzzle.solved_at, displayName: recentPuzzle.display_name }
      : null,
  });
});
