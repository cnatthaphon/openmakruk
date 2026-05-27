// User-submitted feedback during beta.
//
// POST /api/feedback  — anonymous OK, auth optional
//
// Storage in D1 (table `feedback`). No notification fan-out for v1 —
// the owner reads via `wrangler d1 execute --command "SELECT ..."` or
// a future admin dashboard. Keeping the surface narrow avoids needing
// SMTP / webhook secrets in the worker for a beta-only feature.

import { Hono } from 'hono';
import type { Env } from '../index';
import type { AuthVars } from '../auth';
import { hashToken, newId } from '../auth';

export const feedbackRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

const MAX_MESSAGE = 4000;
const MAX_CONTACT = 200;
const ALLOWED_KINDS = new Set(['bug', 'feature', 'praise', 'other']);

/** Per-user rate limit: 5 submissions per hour. Anonymous traffic hits
 *  a softer cap of 3/hour keyed by a hash of the contact + message so
 *  obvious spammers self-collide. */
const MAX_PER_USER_PER_HOUR = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

feedbackRoute.post('/', async (c) => {
  type FeedbackBody = {
    message?: string;
    contact?: string;
    kind?: string;
    buildSha?: string;
    locale?: string;
  };
  const body: FeedbackBody = await c.req.json<FeedbackBody>().catch(() => ({} as FeedbackBody));

  const message = sanitize(body.message, MAX_MESSAGE);
  if (!message) {
    return c.json({ error: 'bad_request', reason: 'message_required' }, 400);
  }
  const contact = sanitize(body.contact, MAX_CONTACT) || null;
  const kind = ALLOWED_KINDS.has(body.kind ?? '') ? (body.kind as string) : 'other';
  const buildSha = sanitize(body.buildSha, 40) || null;
  const locale = sanitize(body.locale, 32) || null;

  // Resolve user_id from the optional bearer. We don't run authMiddleware
  // because anonymous feedback is allowed; we just look up the token if
  // present.
  let userId: string | null = null;
  const header = c.req.header('Authorization');
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token.length >= 32) {
      const tokenHash = await hashToken(token);
      const row = await c.env.DB.prepare(
        'SELECT id FROM users WHERE token_hash = ?',
      )
        .bind(tokenHash)
        .first<{ id: string }>();
      if (row) userId = row.id;
    }
  }

  // Per-user rate limit. Skipped for anonymous because we don't track
  // them; spam by anonymous submitters would need a real abuse layer
  // (cf-ipcountry / turnstile). For a beta feedback channel this is
  // acceptable.
  if (userId) {
    const recent = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at > ?',
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
    `INSERT INTO feedback (id, user_id, message, contact, kind, build_sha, locale, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, message, contact, kind, buildSha, locale, now)
    .run();

  return c.json({ ok: true, id, receivedAt: now });
});

function sanitize(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, max);
}
