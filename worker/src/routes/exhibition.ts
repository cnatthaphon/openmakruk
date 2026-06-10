// /api/exhibition — public-read + admin-write endpoints for bot games.
//
// GET  /api/exhibition/recent  → list of last 20 games (no moves, just
//                                meta — keeps the payload small for the
//                                feed view)
// GET  /api/exhibition/:id     → one game with full moves array for the
//                                replay viewer
// POST /api/exhibition/submit  → external bot runner ingests a finished
//                                bot-vs-bot game. Gated by a shared
//                                admin token (Cloudflare Worker secret
//                                EXHIBITION_ADMIN_TOKEN). Replaces the
//                                cron-based runner from Phase 10G — the
//                                runner now lives outside the worker so
//                                we can use the full Fairy-Stockfish +
//                                NNUE engine instead of the lightweight
//                                ported scorers that the worker's CPU/
//                                memory budget constrained us to.

import { Hono } from 'hono';
import type { Env } from '../index';
import { newId } from '../auth';

export const exhibitionRoute = new Hono<{ Bindings: Env }>();

// Idempotency-key shape — same contract as the games route
// (CLIENT_GAME_ID_RE there). Any 1–64 char [A-Za-z0-9_-] string; the
// runner sends a UUID, which is a subset.
const CLIENT_GAME_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

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
  // Tier comes straight from the bot row (bot_tier column). Surfacing
  // it in the API lets the client filter by tier without parsing the
  // bot id slug — i.e. no `'bot:fairy-stockfish'` literal needed in
  // the UI to special-case the boss.
  white_tier: string | null;
  black_tier: string | null;
};

exhibitionRoute.get('/recent', async (c) => {
  // Join twice on users to denormalize bot display names + avatars in
  // one query — saves the client from N+1 follow-ups.
  const sql = `
    SELECT g.id, g.white_bot_id, g.black_bot_id, g.outcome, g.ply_count,
           g.final_fen, g.created_at,
           wu.display_name AS white_name, wu.bot_avatar AS white_avatar,
           wu.bot_tier AS white_tier,
           bu.display_name AS black_name, bu.bot_avatar AS black_avatar,
           bu.bot_tier AS black_tier
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
      whiteTier: g.white_tier,
      blackTier: g.black_tier,
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
           wu.bot_tier AS white_tier,
           bu.display_name AS black_name, bu.bot_avatar AS black_avatar,
           bu.bot_tier AS black_tier
    FROM bot_exhibition_games g
    LEFT JOIN users wu ON wu.id = g.white_bot_id
    LEFT JOIN users bu ON bu.id = g.black_bot_id
    WHERE g.id = ?
  `;
  const row = await c.env.DB.prepare(sql).bind(id).first<ExhibitionRow & { moves_json: string }>();
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
    whiteTier: row.white_tier,
    blackTier: row.black_tier,
    outcome: row.outcome,
    plyCount: row.ply_count,
    moves,
    finalFen: row.final_fen,
    createdAt: row.created_at,
  });
});

/** Admin-only: external runner submits a finished bot-vs-bot game.
 *
 *  Auth: `Authorization: Bearer <EXHIBITION_ADMIN_TOKEN>`. The token is
 *  a Cloudflare Worker secret (set via `wrangler secret put`), not a
 *  user bearer — exhibition games aren't owned by any human account.
 *  Without the env var set (i.e. local `wrangler dev` without --secret),
 *  the endpoint refuses by default to prevent accidental open-relay.
 *
 *  Validation:
 *    - Both bot ids must exist in users with is_bot = 1
 *    - outcome must be one of the 4 canonical values
 *    - plyCount must equal moves.length
 *    - moves array length capped at 300 (engine games never exceed
 *      our 200-ply cap; the 300 buffer catches obvious bad submissions)
 *    - final_fen must parse (light syntactic check; the worker doesn't
 *      run ffish for full replay verification — that's the runner's
 *      job, and forging requires both the admin token AND a valid bot
 *      id, which an attacker who got the token could already misuse
 *      in worse ways).
 *
 *  Returns: `{ ok: true, id, createdAt }` on success.
 */
exhibitionRoute.post('/submit', async (c) => {
  const expected = c.env.EXHIBITION_ADMIN_TOKEN;
  if (!expected) {
    return c.json({ error: 'forbidden', reason: 'admin_token_not_configured' }, 403);
  }
  const header = c.req.header('Authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (presented !== expected) {
    return c.json({ error: 'forbidden', reason: 'bad_admin_token' }, 403);
  }

  type SubmitBody = {
    whiteBotId?: string;
    blackBotId?: string;
    outcome?: string;
    plyCount?: number;
    moves?: unknown;
    finalFen?: string;
    /** Optional caller-supplied idempotency key (UUID). Lets the runner
     *  safely retry after a D1 "storage timeout after commit" without
     *  double-inserting — a re-submit with the same id is a no-op. */
    clientGameId?: string;
  };
  const body = await c.req.json<SubmitBody>().catch(() => ({}) as SubmitBody);

  if (typeof body.whiteBotId !== 'string' || typeof body.blackBotId !== 'string') {
    return c.json({ error: 'bad_request', reason: 'missing_bot_ids' }, 400);
  }
  const ALLOWED_OUTCOMES = new Set(['white-wins', 'black-wins', 'draw', 'truncated']);
  if (typeof body.outcome !== 'string' || !ALLOWED_OUTCOMES.has(body.outcome)) {
    return c.json({ error: 'bad_request', reason: 'bad_outcome' }, 400);
  }
  if (typeof body.plyCount !== 'number' || body.plyCount < 1 || body.plyCount > 300) {
    return c.json({ error: 'bad_request', reason: 'bad_ply_count' }, 400);
  }
  if (
    !Array.isArray(body.moves) ||
    body.moves.length !== body.plyCount ||
    !body.moves.every((m) => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][nkrqbsmp]?$/.test(m))
  ) {
    return c.json({ error: 'bad_request', reason: 'bad_moves' }, 400);
  }
  if (typeof body.finalFen !== 'string' || !body.finalFen.includes('/')) {
    return c.json({ error: 'bad_request', reason: 'bad_final_fen' }, 400);
  }
  // Mirror the games route's idempotency-key contract: when present it
  // must be valid (a malformed key must NOT silently fall back to a fresh
  // id, or a retry with the same bad key would duplicate). Absent is fine.
  if (body.clientGameId !== undefined) {
    if (typeof body.clientGameId !== 'string' || !CLIENT_GAME_ID_RE.test(body.clientGameId)) {
      return c.json({ error: 'bad_request', reason: 'clientGameId_invalid' }, 400);
    }
  }

  // Verify both bot ids exist + are bots. Cheap: 2 indexed lookups.
  const whiteBot = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND is_bot = 1')
    .bind(body.whiteBotId)
    .first();
  const blackBot = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND is_bot = 1')
    .bind(body.blackBotId)
    .first();
  if (!whiteBot || !blackBot) {
    return c.json({ error: 'bad_request', reason: 'unknown_bot' }, 400);
  }

  // Idempotency: a caller-supplied id (validated above) becomes the
  // primary key so a retry collapses onto the same row. INSERT OR IGNORE
  // makes the duplicate a no-op; we then read back the stored row so the
  // response reflects what's actually persisted (original created_at on a
  // dedup, not the retry's clock).
  const id = body.clientGameId ?? newId();
  const now = Date.now();
  const insert = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO bot_exhibition_games
       (id, white_bot_id, black_bot_id, outcome, ply_count, moves_json, final_fen, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.whiteBotId,
      body.blackBotId,
      body.outcome,
      body.plyCount,
      JSON.stringify(body.moves),
      body.finalFen,
      now,
    )
    .run();

  // changes === 0 → the row already existed (idempotent re-submit).
  const deduped = (insert.meta?.changes ?? 0) === 0;
  const stored = await c.env.DB.prepare('SELECT created_at FROM bot_exhibition_games WHERE id = ?')
    .bind(id)
    .first<{ created_at: number }>();

  return c.json({ ok: true, id, createdAt: stored?.created_at ?? now, deduped });
});
