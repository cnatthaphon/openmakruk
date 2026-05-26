// /api/seasons — public-read endpoints.
//
//   GET /api/seasons/active   → metadata for the currently-active quarter
//   GET /api/seasons          → list of closed seasons (most recent first)
//   GET /api/seasons/:id      → winners for that closed season

import { Hono } from 'hono';
import type { Env } from '../index';
import { activeSeasonInfo } from '../seasons';

export const seasonsRoute = new Hono<{ Bindings: Env }>();

seasonsRoute.get('/active', (c) => {
  return c.json({ season: activeSeasonInfo() });
});

seasonsRoute.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, label, starts_at, ends_at, closed_at
       FROM seasons
      ORDER BY id DESC
      LIMIT 24`,
  ).all<{ id: string; label: string; starts_at: number; ends_at: number; closed_at: number | null }>();
  return c.json({
    seasons: (rows.results ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      closedAt: r.closed_at,
    })),
  });
});

seasonsRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const seasonRow = await c.env.DB.prepare(
    `SELECT id, label, starts_at, ends_at, closed_at FROM seasons WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; label: string; starts_at: number; ends_at: number; closed_at: number | null }>();
  if (!seasonRow) return c.json({ error: 'not_found' }, 404);
  const winners = await c.env.DB.prepare(
    `SELECT scope, rank, user_id, display_name, rating
       FROM season_winners
      WHERE season_id = ?
      ORDER BY scope ASC, rank ASC`,
  )
    .bind(id)
    .all<{ scope: string; rank: number; user_id: string; display_name: string; rating: number }>();
  return c.json({
    id: seasonRow.id,
    label: seasonRow.label,
    startsAt: seasonRow.starts_at,
    endsAt: seasonRow.ends_at,
    closedAt: seasonRow.closed_at,
    winners: (winners.results ?? []).map((w) => ({
      scope: w.scope,
      rank: w.rank,
      userId: w.user_id,
      displayName: w.display_name,
      rating: w.rating,
    })),
  });
});
