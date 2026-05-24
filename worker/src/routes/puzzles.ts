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
