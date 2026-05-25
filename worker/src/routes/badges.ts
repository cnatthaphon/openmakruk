// Badge endpoints — catalog (public), user's badges (auth), public cert.
//
// GET  /api/badges            — full catalog (cached aggressively by browser)
// GET  /api/users/me/badges   — the authenticated user's unlocked badges
// GET  /api/cert/:slug        — public certificate page payload
//                               (badge def + user display name + unlocked timestamp).
// POST /api/users/me/badges/evaluate — force-re-evaluate (rare; called
//                                       after a content fetch that
//                                       might change puzzle count).

import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, getUser, type AuthVars } from '../auth';
import { BADGES, findBadge } from '../badges';
import { evaluateBadges } from '../badgeEvaluator';

export const badgesRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

/** Public badge catalog. Static — clients cache for 24h via _headers. */
badgesRoute.get('/', (c) => {
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json({ badges: BADGES });
});

type UserBadgeRow = {
  badge_id: string;
  unlocked_at: number;
  shareable_slug: string;
};

/** GET /api/users/me/badges — under the badges route mount for symmetry
 *  with the catalog endpoint. */
badgesRoute.get('/me', authMiddleware, async (c) => {
  const u = getUser(c);
  const res = await c.env.DB.prepare(
    `SELECT badge_id, unlocked_at, shareable_slug
     FROM user_badges WHERE user_id = ?
     ORDER BY unlocked_at DESC`,
  )
    .bind(u.id)
    .all<UserBadgeRow>();
  const rows = res.results ?? [];
  return c.json({
    badges: rows.map((r) => ({
      badgeId: r.badge_id,
      unlockedAt: r.unlocked_at,
      shareableSlug: r.shareable_slug,
      def: findBadge(r.badge_id),
    })),
  });
});

/** Force re-evaluation. Returns newly-unlocked ids. Useful when the
 *  client has reason to think the user just crossed a threshold
 *  (e.g. after they solved their 100th puzzle). */
badgesRoute.post('/me/evaluate', authMiddleware, async (c) => {
  const u = getUser(c);
  const newIds = await evaluateBadges(c.env.DB, u.id);
  return c.json({ newBadges: newIds });
});

// Public cert page payload — no auth. Anyone with the slug can view.
// Mounted as a top-level alias from index.ts so it's at /api/cert/:slug.
export const certRoute = new Hono<{ Bindings: Env }>();
certRoute.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!slug || slug.length > 60) return c.json({ error: 'bad_slug' }, 400);
  const row = await c.env.DB.prepare(
    `SELECT ub.badge_id, ub.unlocked_at, u.display_name, u.province
     FROM user_badges ub
     JOIN users u ON u.id = ub.user_id
     WHERE ub.shareable_slug = ?`,
  )
    .bind(slug)
    .first<{
      badge_id: string;
      unlocked_at: number;
      display_name: string;
      province: string | null;
    }>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({
    badge: findBadge(row.badge_id),
    displayName: row.display_name,
    province: row.province,
    unlockedAt: row.unlocked_at,
  });
});
