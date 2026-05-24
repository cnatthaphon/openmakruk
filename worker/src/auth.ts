// Bearer-token auth for anonymous accounts.
//
// Flow:
//   1. Client calls POST /api/users/anon (no auth). Worker:
//      - generates 32 bytes of random → token (returned ONCE in plain)
//      - hashes token with SHA-256 → token_hash (stored in DB)
//      - creates users row with new UUID, default name, default rating
//   2. Client persists `token` in localStorage. Every subsequent
//      request sends `Authorization: Bearer <token>`.
//   3. authMiddleware re-hashes the bearer token and looks it up by
//      token_hash. Hit → attach user to context. Miss → 401.
//
// Why opaque tokens, not JWT:
//   - JWT adds a library (~30KB) for an anonymous app where the only
//     claim is "you are user X". Stateful tokens are simpler.
//   - Token revocation is trivial: DELETE the user row. With JWT we'd
//     need a separate revocation list.
//   - Token rotation = new POST /api/users/anon (rare event).
//
// Constant-time comparisons are NOT needed here because we look up by
// hash equality (DB-level, single row WHERE token_hash = ?), which is
// already a constant-time operation from the API surface.

import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from './index';

export type UserRow = {
  id: string;
  display_name: string;
  rating: number;
  created_at: number;
  last_seen_at: number;
};

/** Variables Hono carries through the request after auth succeeds. */
export type AuthVars = {
  user: UserRow;
};

/** Generate a 32-byte url-safe random token. Returned to the client
 *  ONCE — server stores only the hash. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** SHA-256(token) → hex. Workers ship Web Crypto natively, no polyfill. */
export async function hashToken(token: string): Promise<string> {
  const buf = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Generate a v4 UUID. crypto.randomUUID() is available in Workers
 *  runtime; this wrapper exists so callers can be mocked in tests. */
export function newId(): string {
  return crypto.randomUUID();
}

/** Auth middleware. Reads `Authorization: Bearer <token>`, hashes it,
 *  looks up the user, and attaches them to context vars under `user`.
 *  Updates `last_seen_at` opportunistically. */
export const authMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AuthVars }> = async (
  c,
  next,
) => {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized', reason: 'missing_bearer' }, 401);
  }
  const token = header.slice(7).trim();
  if (token.length < 32) {
    return c.json({ error: 'unauthorized', reason: 'short_token' }, 401);
  }
  const tokenHash = await hashToken(token);
  const row = await c.env.DB.prepare(
    'SELECT id, display_name, rating, created_at, last_seen_at FROM users WHERE token_hash = ?',
  )
    .bind(tokenHash)
    .first<UserRow>();
  if (!row) {
    return c.json({ error: 'unauthorized', reason: 'unknown_token' }, 401);
  }
  // Fire-and-forget heartbeat. Errors are swallowed because losing a
  // heartbeat update is preferable to failing the request.
  c.env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?')
    .bind(Date.now(), row.id)
    .run()
    .catch(() => undefined);
  c.set('user', row);
  await next();
};

/** Convenience accessor for handlers that ran through authMiddleware. */
export function getUser(c: Context<{ Bindings: Env; Variables: AuthVars }>): UserRow {
  return c.get('user');
}

// ─── helpers ───────────────────────────────────────────────────────

function base64url(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
