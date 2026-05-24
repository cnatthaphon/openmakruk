// User identity endpoints.
//
// POST /api/users/anon — create a fresh anonymous user, return id +
//   token. Token is the bearer credential the client uses for every
//   subsequent authenticated call.
// GET  /api/users/me   — fetch the authenticated user's profile.
// PATCH /api/users/me  — update display_name (only field worth changing
//   for anon accounts; rating is server-controlled).

import { Hono } from 'hono';
import type { Env } from '../index';
import {
  authMiddleware,
  generateToken,
  getUser,
  hashToken,
  newId,
  type AuthVars,
} from '../auth';

const DEFAULT_NAME = 'ผู้เล่น';
const MAX_NAME_LENGTH = 24;

export const usersRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

/** Create a new anonymous user. No auth. Returns the bearer token in
 *  plaintext exactly once — the client MUST persist it. We do not
 *  expose any way to recover a lost token (it would defeat the purpose
 *  of stateless storage). Losing the token = losing the account. */
usersRoute.post('/anon', async (c) => {
  const body = await c.req
    .json<{ displayName?: string }>()
    .catch(() => ({} as { displayName?: string }));
  const name = sanitizeName(body.displayName);
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const id = newId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO users (id, display_name, token_hash, rating, created_at, last_seen_at)
     VALUES (?, ?, ?, 1000, ?, ?)`,
  )
    .bind(id, name, tokenHash, now, now)
    .run();

  return c.json({
    id,
    displayName: name,
    token, // PLAINTEXT — returned ONCE
    rating: 1000,
    createdAt: now,
  });
});

/** Profile read for the authenticated user. */
usersRoute.get('/me', authMiddleware, (c) => {
  const u = getUser(c);
  return c.json({
    id: u.id,
    displayName: u.display_name,
    rating: u.rating,
    createdAt: u.created_at,
    lastSeenAt: u.last_seen_at,
  });
});

/** Profile update — only display_name is mutable. Any other field
 *  the client tries to set is silently ignored. */
usersRoute.patch('/me', authMiddleware, async (c) => {
  const body = await c.req
    .json<{ displayName?: string }>()
    .catch(() => ({} as { displayName?: string }));
  if (!body.displayName) {
    return c.json({ error: 'bad_request', reason: 'displayName_required' }, 400);
  }
  const name = sanitizeName(body.displayName);
  const u = getUser(c);
  await c.env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?')
    .bind(name, u.id)
    .run();
  return c.json({ id: u.id, displayName: name });
});

function sanitizeName(input: string | undefined): string {
  if (!input || typeof input !== 'string') return DEFAULT_NAME;
  const trimmed = input.trim();
  if (trimmed.length === 0) return DEFAULT_NAME;
  return trimmed.slice(0, MAX_NAME_LENGTH);
}
