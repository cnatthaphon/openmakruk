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
import { isValidProvinceCode, regionOf } from '../provinces';

const DEFAULT_NAME = 'ผู้เล่น';
const MAX_NAME_LENGTH = 24;

/** Accept and validate an optional province code from a request body.
 *  Returns the normalized value: null = explicit opt-out / not provided;
 *  string = canonical 2-digit code. Any code not in the catalog is
 *  rejected as 'invalid_province'. */
function normalizeProvince(raw: unknown): string | null | 'invalid_province' {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid_province';
  return isValidProvinceCode(raw) ? raw : 'invalid_province';
}

export const usersRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

/** Create a new anonymous user. No auth. Returns the bearer token in
 *  plaintext exactly once — the client MUST persist it. We do not
 *  expose any way to recover a lost token (it would defeat the purpose
 *  of stateless storage). Losing the token = losing the account. */
usersRoute.post('/anon', async (c) => {
  const body = await c.req
    .json<{ displayName?: string; province?: string | null }>()
    .catch(() => ({} as { displayName?: string; province?: string | null }));
  const name = sanitizeName(body.displayName);
  const province = normalizeProvince(body.province);
  if (province === 'invalid_province') {
    return c.json({ error: 'bad_request', reason: 'invalid_province' }, 400);
  }
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const id = newId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO users (id, display_name, token_hash, rating, province, created_at, last_seen_at)
     VALUES (?, ?, ?, 1000, ?, ?, ?)`,
  )
    .bind(id, name, tokenHash, province, now, now)
    .run();

  return c.json({
    id,
    displayName: name,
    token, // PLAINTEXT — returned ONCE
    rating: 1000,
    province,
    region: regionOf(province),
    createdAt: now,
  });
});

/** Profile read for the authenticated user. */
usersRoute.get('/me', authMiddleware, async (c) => {
  const u = getUser(c);
  // Province isn't in UserRow (auth middleware only loads core fields);
  // pull it separately so the response stays a single source of truth.
  const row = await c.env.DB.prepare('SELECT province FROM users WHERE id = ?')
    .bind(u.id)
    .first<{ province: string | null }>();
  const province = row?.province ?? null;
  return c.json({
    id: u.id,
    displayName: u.display_name,
    rating: u.rating,
    province,
    region: regionOf(province),
    createdAt: u.created_at,
    lastSeenAt: u.last_seen_at,
  });
});

/** Profile update — display_name + province are the only mutable
 *  fields. Any other field the client tries to set is silently ignored. */
usersRoute.patch('/me', authMiddleware, async (c) => {
  const body = await c.req
    .json<{ displayName?: string; province?: string | null }>()
    .catch(() => ({} as { displayName?: string; province?: string | null }));

  const fields: string[] = [];
  const params: unknown[] = [];
  let nameOut: string | null = null;
  let provinceOut: string | null | undefined = undefined;

  if (body.displayName !== undefined) {
    nameOut = sanitizeName(body.displayName);
    fields.push('display_name = ?');
    params.push(nameOut);
  }
  if ('province' in body) {
    const province = normalizeProvince(body.province);
    if (province === 'invalid_province') {
      return c.json({ error: 'bad_request', reason: 'invalid_province' }, 400);
    }
    provinceOut = province;
    fields.push('province = ?');
    params.push(province);
  }

  if (fields.length === 0) {
    return c.json({ error: 'bad_request', reason: 'no_fields_to_update' }, 400);
  }

  const u = getUser(c);
  params.push(u.id);
  await c.env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  // Read back the final state so the response reflects what's now
  // persisted (province may have been unchanged in this PATCH).
  const row = await c.env.DB.prepare(
    'SELECT display_name, province FROM users WHERE id = ?',
  )
    .bind(u.id)
    .first<{ display_name: string; province: string | null }>();
  return c.json({
    id: u.id,
    displayName: row?.display_name ?? nameOut ?? u.display_name,
    province: row?.province ?? provinceOut ?? null,
    region: regionOf(row?.province ?? provinceOut ?? null),
  });
});

function sanitizeName(input: string | undefined): string {
  if (!input || typeof input !== 'string') return DEFAULT_NAME;
  const trimmed = input.trim();
  if (trimmed.length === 0) return DEFAULT_NAME;
  return trimmed.slice(0, MAX_NAME_LENGTH);
}
