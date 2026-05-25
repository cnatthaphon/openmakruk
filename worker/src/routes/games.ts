// Game-record endpoints — write-heavy, history-light.
//
// POST /api/games        — record a finished game. Updates the user's
//                          rating server-side via Elo. Engine
//                          verification is deferred to a cron job
//                          (Phase 9B): we accept the moves_json as
//                          authoritative but mark `verified = 0` until
//                          replayed.
// GET  /api/games        — paginated history for the current user.
// GET  /api/games/me/totals — denormalized win/loss totals by opponent,
//                            used by the personal Match leaderboard
//                            without scanning the whole history.
//
// Why server-side Elo update: clients can't be trusted with rating
// math (cheating). The rating in the DB is the source of truth; the
// client mirrors it locally only for offline display.

import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, getUser, newId, type AuthVars } from '../auth';
import { applyElo, opponentRating, type Outcome } from '../elo';
import { verifyGame } from '../verifier';
import { evaluateBadges } from '../badgeEvaluator';

const PAGE_SIZE = 50;
const VALID_OUTCOMES = new Set<Outcome>(['win', 'loss', 'draw']);
const VALID_SIDES = new Set(['white', 'black']);

export const gamesRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

type GameSubmitBody = {
  opponent?: string;
  userSide?: 'white' | 'black';
  outcome?: Outcome;
  plyCount?: number;
  moves?: string[];
  finalFen?: string;
  timeControlId?: string | null;
  mode?: 'rated' | 'casual';
};

/** Record a finished game. Auth required.
 *
 *  Validation:
 *    - opponent is a string (no further check at write time; ratings
 *      are resolved through `opponentRating()` which defaults to 1000
 *      for unknown engines so abuse is bounded)
 *    - outcome in {win, loss, draw}
 *    - plyCount > 0 and < 500 (sanity bound)
 *    - moves array length matches plyCount when provided
 *    - mode defaults to 'rated' if absent
 *
 *  Side effects: row inserted into `games`; user's `rating` and
 *  `last_seen_at` updated in a single transaction. */
gamesRoute.post('/', authMiddleware, async (c) => {
  const user = getUser(c);
  const body = await c.req.json<GameSubmitBody>().catch(() => ({} as GameSubmitBody));

  // ── validate ─────────────────────────────────────────────────────
  if (!body.opponent || typeof body.opponent !== 'string') {
    return c.json({ error: 'bad_request', reason: 'opponent_required' }, 400);
  }
  if (!body.userSide || !VALID_SIDES.has(body.userSide)) {
    return c.json({ error: 'bad_request', reason: 'userSide_invalid' }, 400);
  }
  if (!body.outcome || !VALID_OUTCOMES.has(body.outcome)) {
    return c.json({ error: 'bad_request', reason: 'outcome_invalid' }, 400);
  }
  const plyCount = Number(body.plyCount);
  if (!Number.isFinite(plyCount) || plyCount <= 0 || plyCount > 500) {
    return c.json({ error: 'bad_request', reason: 'plyCount_range' }, 400);
  }
  if (body.moves && Array.isArray(body.moves) && body.moves.length !== plyCount) {
    return c.json({ error: 'bad_request', reason: 'moves_length_mismatch' }, 400);
  }
  if (!body.finalFen || typeof body.finalFen !== 'string') {
    return c.json({ error: 'bad_request', reason: 'finalFen_required' }, 400);
  }
  const mode = body.mode === 'casual' ? 'casual' : 'rated';

  // ── resolve bot opponent (if any) BEFORE verification, so an
  //    unknown-bot fast-fails with 400 instead of getting masked by
  //    a 422 from the verifier. ─────────────────────────────────────
  let botRow: { id: string; rating: number } | null = null;
  if (body.opponent.startsWith('bot:')) {
    botRow = await c.env.DB.prepare(
      'SELECT id, rating FROM users WHERE id = ? AND is_bot = 1',
    )
      .bind(body.opponent)
      .first<{ id: string; rating: number }>();
    if (!botRow) {
      return c.json({ error: 'bad_request', reason: 'unknown_bot' }, 400);
    }
  }

  // ── verify by replaying moves (rated only) ───────────────────────
  // Casual games skip verification — they don't affect the leaderboard
  // and the user is being honest with themselves. Rated games MUST
  // replay successfully or they're rejected outright; we'd rather
  // refuse a legitimate edge case than store a cheat.
  let verified = false;
  if (mode === 'rated') {
    if (!body.moves || !Array.isArray(body.moves) || body.moves.length === 0) {
      return c.json({ error: 'bad_request', reason: 'moves_required_for_rated' }, 400);
    }
    const v = verifyGame({
      moves: body.moves,
      finalFen: body.finalFen,
      outcome: body.outcome,
      userSide: body.userSide,
    });
    if (!v.ok) {
      return c.json(
        {
          error: 'verification_failed',
          reason: v.reason,
          failedAtPly: v.failedAtPly,
        },
        422,
      );
    }
    verified = true;
  }

  // ── compute rating change (rated only) ───────────────────────────
  //
  // Bot opponent: use the LIVE rating from users (looked up above),
  // so bot Elo moves dynamically with each human game.
  const opponentR = botRow ? botRow.rating : opponentRating(body.opponent);

  let newRating = user.rating;
  let delta = 0;
  let botNewRating: number | null = null;
  if (mode === 'rated') {
    const result = applyElo(user.rating, opponentR, body.outcome);
    newRating = result.newRating;
    delta = result.delta;
    if (botRow) {
      // Bot side: opposite outcome from the human's POV.
      const botOutcome: Outcome =
        body.outcome === 'win' ? 'loss' : body.outcome === 'loss' ? 'win' : 'draw';
      const botResult = applyElo(botRow.rating, user.rating, botOutcome);
      botNewRating = botResult.newRating;
    }
  }

  // ── persist ──────────────────────────────────────────────────────
  const id = newId();
  const now = Date.now();
  const movesJson = JSON.stringify(body.moves ?? []);

  // D1 doesn't have explicit BEGIN/COMMIT in the JS driver; we issue
  // batched statements via `batch()` which runs them as one
  // transaction at the storage layer.
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO games
         (id, user_id, opponent, user_side, outcome, ply_count, moves_json,
          final_fen, rating_before, rating_after, rating_delta,
          time_control_id, mode, created_at, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      user.id,
      body.opponent,
      body.userSide,
      body.outcome,
      plyCount,
      movesJson,
      body.finalFen,
      user.rating,
      newRating,
      delta,
      body.timeControlId ?? null,
      mode,
      now,
      verified ? 1 : 0,
    ),
    c.env.DB.prepare('UPDATE users SET rating = ?, last_seen_at = ? WHERE id = ?').bind(
      newRating,
      now,
      user.id,
    ),
  ];
  if (botRow && botNewRating !== null) {
    statements.push(
      c.env.DB.prepare('UPDATE users SET rating = ?, last_seen_at = ? WHERE id = ?').bind(
        botNewRating,
        now,
        botRow.id,
      ),
    );
  }
  await c.env.DB.batch(statements);

  // Server-side badge evaluation. Cheap (handful of aggregates) and
  // runs only after a successful game write. Newly-unlocked ids
  // surface in the response so the client can toast them.
  let newBadges: string[] = [];
  try {
    newBadges = await evaluateBadges(c.env.DB, user.id);
  } catch (err) {
    // Badge eval errors shouldn't break the game write. Log + swallow.
    console.warn('badge.evaluate.failed', { userId: user.id, error: String(err) });
  }

  return c.json({
    id,
    ratingBefore: user.rating,
    ratingAfter: newRating,
    ratingDelta: delta,
    verified,
    createdAt: now,
    newBadges,
  });
});

/** Paginated game history for the current user. */
gamesRoute.get('/', authMiddleware, async (c) => {
  const user = getUser(c);
  const limit = Math.min(Number(c.req.query('limit') ?? PAGE_SIZE), PAGE_SIZE);
  const cursor = c.req.query('cursor');

  const where: string[] = ['user_id = ?'];
  const params: unknown[] = [user.id];
  if (cursor) {
    const [createdAtStr, lastId] = cursor.split('|');
    const createdAt = Number(createdAtStr);
    if (!Number.isFinite(createdAt) || !lastId) {
      return c.json({ error: 'bad_request', reason: 'bad_cursor' }, 400);
    }
    where.push('(created_at < ? OR (created_at = ? AND id < ?))');
    params.push(createdAt, createdAt, lastId);
  }

  const sql = `
    SELECT id, opponent, user_side, outcome, ply_count, moves_json,
           final_fen, rating_before, rating_after, rating_delta,
           time_control_id, mode, created_at, verified
    FROM games
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit + 1}
  `;
  const result = await c.env.DB.prepare(sql).bind(...params).all<GameRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null;

  return c.json({
    games: page.map(rowToGame),
    nextCursor,
  });
});

/** Totals by opponent — used by the personal Match leaderboard.
 *  Returns one row per opponent with win/loss/draw counts. */
gamesRoute.get('/me/totals', authMiddleware, async (c) => {
  const user = getUser(c);
  const sql = `
    SELECT opponent,
           SUM(CASE WHEN outcome = 'win'  THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) AS losses,
           SUM(CASE WHEN outcome = 'draw' THEN 1 ELSE 0 END) AS draws,
           COUNT(*) AS total
    FROM games
    WHERE user_id = ? AND mode = 'rated'
    GROUP BY opponent
    ORDER BY opponent ASC
  `;
  const result = await c.env.DB.prepare(sql).bind(user.id).all<TotalsRow>();
  return c.json({ totals: result.results ?? [] });
});

// ─── row shapes ────────────────────────────────────────────────────

type GameRow = {
  id: string;
  opponent: string;
  user_side: string;
  outcome: string;
  ply_count: number;
  moves_json: string;
  final_fen: string;
  rating_before: number;
  rating_after: number;
  rating_delta: number;
  time_control_id: string | null;
  mode: string;
  created_at: number;
  verified: number;
};

type TotalsRow = {
  opponent: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
};

function rowToGame(r: GameRow) {
  return {
    id: r.id,
    opponent: r.opponent,
    userSide: r.user_side,
    outcome: r.outcome,
    plyCount: r.ply_count,
    moves: safeJSON<string[]>(r.moves_json, []),
    finalFen: r.final_fen,
    ratingBefore: r.rating_before,
    ratingAfter: r.rating_after,
    ratingDelta: r.rating_delta,
    timeControlId: r.time_control_id,
    mode: r.mode,
    createdAt: r.created_at,
    verified: r.verified === 1,
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
