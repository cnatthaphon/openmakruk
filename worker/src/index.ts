// OpenMakruk backend — Cloudflare Worker entry point.
//
// Architecture rationale:
//   - Hono for routing because the alternative (manual switch on
//     URL.pathname) gets unreadable past a handful of routes, and
//     Hono's bundle cost is ~12KB minified — trivial inside a Worker's
//     1MB script limit.
//   - Single-file entry so the request pipeline is grep-able. As the
//     route set grows past ~10 endpoints we'll split into a routes/
//     folder, but premature splitting hurts more than it helps.
//   - All write endpoints require an Authorization: Bearer <token>
//     header that maps to a row in `users` via SHA-256(token). We
//     intentionally do NOT use JWTs — they're overkill for anonymous
//     accounts and add libraries; plain opaque tokens stored hashed
//     in the DB are simpler and adequate.
//
// Boot path:
//   request → Hono → route handler → D1 (via env.DB) → JSON response

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { usersRoute } from './routes/users';
import { puzzlesRoute } from './routes/puzzles';
import { gamesRoute } from './routes/games';
import { leaderboardRoute } from './routes/leaderboard';

/** Cloudflare bindings configured in wrangler.toml. */
export type Env = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

// CORS: explicit allowlist rather than wildcard, since requests are
// authenticated. Dev frontend is Vite on :5174; production lives on
// openmakruk.com (and *.pages.dev preview deployments).
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5174',
      'http://localhost:5173',
      'https://openmakruk.com',
      'https://www.openmakruk.com',
    ],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 86400,
  }),
);

// ─── Routes ────────────────────────────────────────────────────────

/** Health check. No auth, no DB call — purely "is the worker reachable
 *  + did the deploy succeed". The CI smoke test will hit this. */
app.get('/api/health', (c) =>
  c.json({
    ok: true,
    name: 'openmakruk-api',
    version: '0.1.0',
    time: new Date().toISOString(),
  }),
);

// Mounted route modules. Each module exposes its own Hono instance
// so route handlers live next to their domain logic (auth, puzzles,
// games) instead of crowding this entry file.
app.route('/api/users', usersRoute);
app.route('/api/puzzles', puzzlesRoute);
app.route('/api/games', gamesRoute);
app.route('/api/leaderboard', leaderboardRoute);

/** DB readiness — separate from /health because hitting D1 costs a
 *  read and we don't want every monitoring probe to drive that bill. */
app.get('/api/db/ping', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT 1 as ok').first<{ ok: number }>();
    return c.json({ ok: result?.ok === 1, schema: 'pending' });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// 404 fallback — explicit JSON so the client adapter can branch on
// shape rather than HTML strings.
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

// Unhandled errors → 500 with a stable shape. Log to Cloudflare's
// observability so we can `wrangler tail` them in production.
app.onError((err, c) => {
  console.error('worker.error', err);
  return c.json({ error: 'internal', message: String(err) }, 500);
});

export default app;
