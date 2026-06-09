// Client-side crash reports.
//
// POST /api/errors  — anonymous OK, auth optional
//
// Sink for the browser crash-reporting channel (src/lib/errorReporter.ts
// + ErrorBoundary). Mirrors the feedback route's shape: narrow surface,
// D1 storage, no notification fan-out. The owner reads via
// `wrangler d1 execute --command "SELECT message, COUNT(*) ..."`.
//
// Privacy: we store ONLY the fields the client chose to send. No IP, no
// user-agent (see migration 0010). user_id is resolved from an optional
// bearer, but the client reports anonymously by design so it's normally
// null.

import { Hono } from 'hono';
import type { Env } from '../index';
import type { AuthVars } from '../auth';
import { hashToken, newId } from '../auth';

export const errorsRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;
const MAX_COMPONENT_STACK = 2000;
const MAX_SCOPE = 64;
const MAX_PATH = 256;

// Crashes can cascade (one bad render fires the boundary repeatedly), so
// the cap is more generous than feedback but still bounded. Anonymous
// traffic is uncapped here for the same reason feedback is — a real
// abuse layer (turnstile / ip rate) is a separate concern; this is a
// best-effort telemetry sink, not a trusted store.
const MAX_PER_USER_PER_HOUR = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000;

errorsRoute.post('/', async (c) => {
  type ErrorBody = {
    scope?: string;
    message?: string;
    stack?: string;
    componentStack?: string;
    buildSha?: string;
    locale?: string;
    urlPath?: string;
  };
  const body: ErrorBody = await c.req.json<ErrorBody>().catch(() => ({} as ErrorBody));

  const message = sanitize(body.message, MAX_MESSAGE);
  if (!message) {
    return c.json({ error: 'bad_request', reason: 'message_required' }, 400);
  }
  const scope = sanitize(body.scope, MAX_SCOPE) || null;
  const stack = sanitize(body.stack, MAX_STACK) || null;
  const componentStack = sanitize(body.componentStack, MAX_COMPONENT_STACK) || null;
  const buildSha = sanitize(body.buildSha, 40) || null;
  const locale = sanitize(body.locale, 32) || null;
  // Defensive: strip any query/hash that slipped through so we never
  // persist potentially-identifying params, even if the client missed it.
  const urlPath = stripQueryHash(sanitize(body.urlPath, MAX_PATH)) || null;

  // Optional bearer → user_id, same as feedback. No authMiddleware
  // because anonymous reports are the norm.
  let userId: string | null = null;
  const header = c.req.header('Authorization');
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token.length >= 32) {
      const tokenHash = await hashToken(token);
      const row = await c.env.DB.prepare('SELECT id FROM users WHERE token_hash = ?')
        .bind(tokenHash)
        .first<{ id: string }>();
      if (row) userId = row.id;
    }
  }

  if (userId) {
    const recent = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM client_errors WHERE user_id = ? AND created_at > ?',
    )
      .bind(userId, Date.now() - RATE_WINDOW_MS)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_PER_USER_PER_HOUR) {
      return c.json(
        { error: 'rate_limited', reason: 'per_user_hourly_cap', retryAfter: 3600 },
        429,
      );
    }
  }

  const id = newId();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO client_errors
       (id, user_id, scope, message, stack, component_stack, build_sha, locale, url_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, scope, message, stack, componentStack, buildSha, locale, urlPath, now)
    .run();

  return c.json({ ok: true, id, receivedAt: now });
});

function sanitize(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, max);
}

function stripQueryHash(path: string): string {
  return path.split(/[?#]/, 1)[0];
}
