// /api/exhibition — public-read endpoints for bot-vs-bot games.
//
// GET /api/exhibition/recent  → list of last 20 games (no moves, just
//                               meta — keeps the payload small for the
//                               feed view)
// GET /api/exhibition/:id     → one game with full moves array for the
//                               replay viewer

import { Hono } from 'hono';
import type { Env } from '../index';

export const exhibitionRoute = new Hono<{ Bindings: Env }>();

type ExhibitionRow = {
  id: string;
  white_bot_id: string;
  black_bot_id: string;
  outcome: string;
  ply_count: number;
  final_fen: string;
  created_at: number;
  white_name: string | null;
  black_name: string | null;
  white_avatar: string | null;
  black_avatar: string | null;
};

exhibitionRoute.get('/recent', async (c) => {
  // Join twice on users to denormalize bot display names + avatars in
  // one query — saves the client from N+1 follow-ups.
  const sql = `
    SELECT g.id, g.white_bot_id, g.black_bot_id, g.outcome, g.ply_count,
           g.final_fen, g.created_at,
           wu.display_name AS white_name, wu.bot_avatar AS white_avatar,
           bu.display_name AS black_name, bu.bot_avatar AS black_avatar
    FROM bot_exhibition_games g
    LEFT JOIN users wu ON wu.id = g.white_bot_id
    LEFT JOIN users bu ON bu.id = g.black_bot_id
    ORDER BY g.created_at DESC
    LIMIT 20
  `;
  const result = await c.env.DB.prepare(sql).all<ExhibitionRow>();
  return c.json({
    games: (result.results ?? []).map((g) => ({
      id: g.id,
      whiteBotId: g.white_bot_id,
      blackBotId: g.black_bot_id,
      whiteName: g.white_name,
      blackName: g.black_name,
      whiteAvatar: g.white_avatar,
      blackAvatar: g.black_avatar,
      outcome: g.outcome,
      plyCount: g.ply_count,
      finalFen: g.final_fen,
      createdAt: g.created_at,
    })),
  });
});

exhibitionRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const sql = `
    SELECT g.id, g.white_bot_id, g.black_bot_id, g.outcome, g.ply_count,
           g.moves_json, g.final_fen, g.created_at,
           wu.display_name AS white_name, wu.bot_avatar AS white_avatar,
           bu.display_name AS black_name, bu.bot_avatar AS black_avatar
    FROM bot_exhibition_games g
    LEFT JOIN users wu ON wu.id = g.white_bot_id
    LEFT JOIN users bu ON bu.id = g.black_bot_id
    WHERE g.id = ?
  `;
  const row = await c.env.DB.prepare(sql)
    .bind(id)
    .first<ExhibitionRow & { moves_json: string }>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  let moves: string[] = [];
  try {
    const parsed = JSON.parse(row.moves_json) as unknown;
    if (Array.isArray(parsed)) moves = parsed.filter((m): m is string => typeof m === 'string');
  } catch {
    /* malformed row — return empty moves */
  }
  return c.json({
    id: row.id,
    whiteBotId: row.white_bot_id,
    blackBotId: row.black_bot_id,
    whiteName: row.white_name,
    blackName: row.black_name,
    whiteAvatar: row.white_avatar,
    blackAvatar: row.black_avatar,
    outcome: row.outcome,
    plyCount: row.ply_count,
    moves,
    finalFen: row.final_fen,
    createdAt: row.created_at,
  });
});
