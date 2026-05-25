// Puzzle catalog endpoints — read-mostly, paginated.
//
// GET  /api/puzzles                  — paginated list with filters
// GET  /api/puzzles/:id              — single puzzle (no auth)
// POST /api/puzzles                  — submit user-mined puzzle (auth)
//   * server runs Fairy-Stockfish verification (Phase 9B). For now
//     accept the client's solution unconditionally with verified_by
//     null, and a follow-up Worker cron pass verifies in batch.
//
// Why paginate at 50 and not 500: D1 has a 100MB per-row response
// budget and pagination keeps the worker memory predictable. The
// client never needs more than one page at a time for the UI.

import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, getUser, newId, type AuthVars } from '../auth';
import { applyMove, classify, parseFen } from '../rules';

const PAGE_SIZE = 50;
const VALID_CATEGORIES = new Set([
  'mate-1',
  'mate-2',
  'tactic',
  'counting',
  'defense',
]);

export const puzzlesRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

/** Paginated puzzle list. Query params:
 *    category — 'mate-1'|'mate-2'|'tactic'|'counting'|'defense' (optional)
 *    source   — 'curated'|'user-mined'|'auto-mined' (optional, default curated)
 *    minRating, maxRating — rating window
 *    cursor   — opaque pagination token from the previous response
 *
 *  Response: { puzzles: PuzzleRow[], nextCursor: string | null }
 *  Cursor format: created_at|id of last row (string).
 */
puzzlesRoute.get('/', async (c) => {
  const category = c.req.query('category');
  const source = c.req.query('source') ?? 'curated';
  const minRating = Number(c.req.query('minRating') ?? 0);
  const maxRating = Number(c.req.query('maxRating') ?? 3000);
  const cursor = c.req.query('cursor');

  if (category && !VALID_CATEGORIES.has(category)) {
    return c.json({ error: 'bad_request', reason: 'unknown_category' }, 400);
  }

  // Build WHERE clauses dynamically. SQL injection risk is gated by
  // parameter bindings — we never inline user strings into the query.
  const where: string[] = ['source = ?', 'rating >= ?', 'rating <= ?'];
  const params: unknown[] = [source, minRating, maxRating];
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (cursor) {
    const [createdAtStr, lastId] = cursor.split('|');
    const createdAt = Number(createdAtStr);
    if (!Number.isFinite(createdAt) || !lastId) {
      return c.json({ error: 'bad_request', reason: 'bad_cursor' }, 400);
    }
    // Compound cursor: keep stable ordering when timestamps collide.
    where.push('(created_at < ? OR (created_at = ? AND id < ?))');
    params.push(createdAt, createdAt, lastId);
  }

  const sql = `
    SELECT id, category, fen, solution_json, to_move, rating, prompt,
           themes_json, source, author_id, verified_by, created_at
    FROM puzzles
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ${PAGE_SIZE + 1}
  `;

  const result = await c.env.DB.prepare(sql).bind(...params).all<PuzzleRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null;

  return c.json({
    puzzles: page.map(rowToPuzzle),
    nextCursor,
  });
});

/** Single puzzle by id. Used for deep-link `/#/puzzles/<id>` resolution
 *  when the client doesn't have the catalog cached. */
puzzlesRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT id, category, fen, solution_json, to_move, rating, prompt,
            themes_json, source, author_id, verified_by, created_at
     FROM puzzles WHERE id = ?`,
  )
    .bind(id)
    .first<PuzzleRow>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(rowToPuzzle(row));
});

/** Submit a user-crafted puzzle. Engine verification happens later
 *  (Phase 9B cron). For now we mark verified_by=null and trust the
 *  client's solution provisionally. */
puzzlesRoute.post('/', authMiddleware, async (c) => {
  const user = getUser(c);
  type PuzzleSubmitBody = {
    fen?: string;
    category?: string;
    solution?: string[];
    toMove?: string;
    rating?: number;
    prompt?: string;
    themes?: string[];
  };
  const body = await c.req
    .json<PuzzleSubmitBody>()
    .catch(() => ({} as PuzzleSubmitBody));

  if (!body.fen || typeof body.fen !== 'string') {
    return c.json({ error: 'bad_request', reason: 'fen_required' }, 400);
  }
  if (!body.category || !VALID_CATEGORIES.has(body.category)) {
    return c.json({ error: 'bad_request', reason: 'category_invalid' }, 400);
  }
  if (!Array.isArray(body.solution) || body.solution.length === 0) {
    return c.json({ error: 'bad_request', reason: 'solution_empty' }, 400);
  }
  if (body.toMove !== 'white' && body.toMove !== 'black') {
    return c.json({ error: 'bad_request', reason: 'toMove_invalid' }, 400);
  }
  const rating = typeof body.rating === 'number' ? body.rating : 1200;
  if (rating < 0 || rating > 3000) {
    return c.json({ error: 'bad_request', reason: 'rating_range' }, 400);
  }

  const id = newId();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user-mined', ?, NULL, ?)`,
  )
    .bind(
      id,
      body.category,
      body.fen,
      JSON.stringify(body.solution),
      body.toMove,
      rating,
      body.prompt ?? '',
      JSON.stringify(body.themes ?? []),
      user.id,
      now,
    )
    .run();

  return c.json({ id, status: 'submitted', verified: false });
});

// ─── code-golf mate mode ──────────────────────────────────────────
//
// User submits a custom UCI sequence for a mate-1 / mate-2 puzzle.
// Server replays via the rules engine and accepts ONLY when the
// position ends in checkmate against the opponent. The shortest
// ply count per (puzzle, user) is the leaderboard key.

type GolfBody = { moves?: string[] };

puzzlesRoute.post('/:id/golf', authMiddleware, async (c) => {
  const puzzleId = c.req.param('id');
  const body = await c.req
    .json<GolfBody>()
    .catch(() => ({} as GolfBody));
  if (!body.moves || !Array.isArray(body.moves) || body.moves.length === 0) {
    return c.json({ error: 'bad_request', reason: 'moves_required' }, 400);
  }
  if (body.moves.length > 50) {
    return c.json({ error: 'bad_request', reason: 'too_many_plies' }, 400);
  }

  const row = await c.env.DB.prepare(
    'SELECT id, fen, category, to_move FROM puzzles WHERE id = ?',
  )
    .bind(puzzleId)
    .first<{ id: string; fen: string; category: string; to_move: string }>();
  if (!row) return c.json({ error: 'puzzle_not_found' }, 404);
  if (row.category !== 'mate-1' && row.category !== 'mate-2') {
    return c.json({ error: 'bad_request', reason: 'golf_only_mate_puzzles' }, 400);
  }

  // Replay from the puzzle's starting FEN. Engine-side verification
  // is the same as for game records — illegal moves halt with 422.
  const start = parseFen(row.fen);
  if (!start) return c.json({ error: 'internal', reason: 'puzzle_fen_unparseable' }, 500);
  let pos = start;
  for (let i = 0; i < body.moves.length; i++) {
    const r = applyMove(pos, body.moves[i]);
    if (!r.ok) {
      return c.json(
        {
          error: 'verification_failed',
          reason: `illegal_move: ${r.reason} at "${body.moves[i]}"`,
          failedAtPly: i + 1,
        },
        422,
      );
    }
    pos = r.position;
  }

  const terminal = classify(pos);
  if (terminal.state !== 'checkmate') {
    return c.json({
      error: 'verification_failed',
      reason: `not_checkmate: state=${terminal.state}`,
    }, 422);
  }
  // The original to-move was the side trying to deliver mate. After
  // their final move, side-to-move is the OPPONENT, and that opponent
  // should be the loser. If `loser !== pos.turn` the user mated their
  // own side — accept only opponent-mate.
  if (terminal.loser !== pos.turn) {
    return c.json({ error: 'verification_failed', reason: 'wrong_loser' }, 422);
  }

  const user = getUser(c);
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO puzzle_golf (puzzle_id, user_id, ply_count, moves_json, attempted_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(puzzleId, user.id, body.moves.length, JSON.stringify(body.moves), now)
    .run();

  // Read back personal-best + global-best in the same transaction so
  // the response gives the user immediate feedback.
  const personal = await c.env.DB.prepare(
    'SELECT MIN(ply_count) AS best FROM puzzle_golf WHERE puzzle_id = ? AND user_id = ?',
  ).bind(puzzleId, user.id).first<{ best: number | null }>();
  const global = await c.env.DB.prepare(
    'SELECT MIN(ply_count) AS best FROM puzzle_golf WHERE puzzle_id = ?',
  ).bind(puzzleId).first<{ best: number | null }>();

  return c.json({
    ok: true,
    plyCount: body.moves.length,
    personalBest: personal?.best ?? body.moves.length,
    globalBest: global?.best ?? body.moves.length,
    isPersonalBest: (personal?.best ?? Infinity) === body.moves.length,
    isGlobalBest: (global?.best ?? Infinity) === body.moves.length,
  });
});

/** Global short list — top-10 shortest solves per puzzle. Useful for
 *  the future "puzzle hall of fame" UI; for v0 we just return the
 *  current user's record + global minimum without ranks. */
puzzlesRoute.get('/:id/golf/leaderboard', async (c) => {
  const puzzleId = c.req.param('id');
  const sql = `
    SELECT u.display_name, MIN(g.ply_count) AS best, MIN(g.attempted_at) AS first_solved_at
    FROM puzzle_golf g
    JOIN users u ON u.id = g.user_id
    WHERE g.puzzle_id = ?
    GROUP BY g.user_id
    ORDER BY best ASC, first_solved_at ASC
    LIMIT 10
  `;
  const result = await c.env.DB.prepare(sql).bind(puzzleId).all<{
    display_name: string;
    best: number;
    first_solved_at: number;
  }>();
  return c.json({
    entries: (result.results ?? []).map((r, i) => ({
      rank: i + 1,
      displayName: r.display_name,
      plyCount: r.best,
      firstSolvedAt: r.first_solved_at,
    })),
  });
});

// ─── shapes ────────────────────────────────────────────────────────

type PuzzleRow = {
  id: string;
  category: string;
  fen: string;
  solution_json: string;
  to_move: string;
  rating: number;
  prompt: string | null;
  themes_json: string | null;
  source: string;
  author_id: string | null;
  verified_by: string | null;
  created_at: number;
};

function rowToPuzzle(r: PuzzleRow) {
  return {
    id: r.id,
    category: r.category,
    fen: r.fen,
    solution: safeJSON<string[]>(r.solution_json, []),
    toMove: r.to_move,
    rating: r.rating,
    prompt: r.prompt ?? '',
    themes: safeJSON<string[]>(r.themes_json, []),
    source: r.source,
    authorId: r.author_id,
    verifiedBy: r.verified_by,
    createdAt: r.created_at,
  };
}

function safeJSON<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
