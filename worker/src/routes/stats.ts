// Public stats endpoint — population-level metrics for the /#/stats page.
//
// GET /api/stats — total/online players + region/province breakdown +
//                  score-family aggregates (outcome / quality / speed).
//
// Design notes:
//   - "Online" = last_seen_at within ONLINE_WINDOW_MS. last_seen_at is
//     updated on every authenticated request (see auth.ts), so the
//     window doubles as a passive activity heartbeat.
//   - Humans only (is_bot = 0). Bot population is fixed at 22 and lives
//     on /api/bots.
//   - Region rollup is derived from province at query time — no second
//     column in `users` (avoids the dual-write trap that bit chess.com's
//     country code migration in 2023).
//   - Score families:
//       Family A — outcome: avg + top user rating
//       Family B — quality: avg best+good % across reviewed games
//       Family C — speed: fastest puzzle rush + boss rush time
//     Each family fronts a different question; surfaced separately in
//     the UI so users see which axis they're being measured on.

import { Hono } from 'hono';
import type { Env } from '../index';
import type { AuthVars } from '../auth';
import { PROVINCES, REGION_LABELS_TH, type Region } from '../provinces';

export const statsRoute = new Hono<{ Bindings: Env; Variables: AuthVars }>();

/** 5-minute online window — same threshold as `online` chip on profile.
 *  Long enough to absorb a tab switch, short enough that the count tracks
 *  "people who could see a message right now" rather than "people who
 *  used the site this hour". */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const PROVINCE_NAME_BY_CODE: Map<string, { nameTh: string; region: Region }> = (() => {
  const m = new Map<string, { nameTh: string; region: Region }>();
  for (const p of PROVINCES) m.set(p.code, { nameTh: p.nameTh, region: p.region });
  return m;
})();

type ProvinceCountRow = {
  province: string | null;
  total: number;
  online: number;
};

statsRoute.get('/', async (c) => {
  const now = Date.now();
  const onlineSince = now - ONLINE_WINDOW_MS;

  // One scan over users — total + online + per-province breakdown in
  // a single query, since SQLite handles conditional aggregates cheaply
  // and we don't want to fan out into three round-trips for what's
  // effectively the same scan.
  const perProvince = await c.env.DB.prepare(
    `SELECT province,
            COUNT(*) AS total,
            SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS online
     FROM users
     WHERE is_bot = 0
     GROUP BY province`,
  )
    .bind(onlineSince)
    .all<ProvinceCountRow>();

  let total = 0;
  let online = 0;
  const byRegion: Record<Region, { region: Region; label: string; total: number; online: number }> = {
    north: { region: 'north', label: REGION_LABELS_TH.north, total: 0, online: 0 },
    northeast: { region: 'northeast', label: REGION_LABELS_TH.northeast, total: 0, online: 0 },
    central: { region: 'central', label: REGION_LABELS_TH.central, total: 0, online: 0 },
    east: { region: 'east', label: REGION_LABELS_TH.east, total: 0, online: 0 },
    west: { region: 'west', label: REGION_LABELS_TH.west, total: 0, online: 0 },
    south: { region: 'south', label: REGION_LABELS_TH.south, total: 0, online: 0 },
  };
  const provinceRows: { code: string; nameTh: string; region: Region; total: number; online: number }[] = [];
  let undeclared = { total: 0, online: 0 };

  for (const row of perProvince.results ?? []) {
    total += row.total;
    online += row.online;
    if (!row.province) {
      undeclared = { total: row.total, online: row.online };
      continue;
    }
    const info = PROVINCE_NAME_BY_CODE.get(row.province);
    if (!info) continue;
    byRegion[info.region].total += row.total;
    byRegion[info.region].online += row.online;
    provinceRows.push({
      code: row.province,
      nameTh: info.nameTh,
      region: info.region,
      total: row.total,
      online: row.online,
    });
  }
  // Top 10 declared provinces by player count — full list would be
  // 77 rows; clients can page if they ever need it.
  provinceRows.sort((a, b) => b.total - a.total || a.nameTh.localeCompare(b.nameTh, 'th'));
  const topProvinces = provinceRows.slice(0, 10);

  // Family A — outcome (rating-based).
  const ratingAgg = await c.env.DB.prepare(
    `SELECT AVG(rating) AS avg_rating, MAX(rating) AS top_rating
     FROM users
     WHERE is_bot = 0 AND rating > 0`,
  ).first<{ avg_rating: number | null; top_rating: number | null }>();

  // Game count — gives users a sense of platform activity.
  const gameCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS games FROM games WHERE verified = 1`,
  ).first<{ games: number }>();

  // Family A continued — decisive game outcomes platform-wide.
  // Win/draw/loss is from the human's POV (see games schema), so this
  // is "human win rate against bots + other humans".
  const outcomeAgg = await c.env.DB.prepare(
    `SELECT
        SUM(CASE WHEN outcome = 'win'  THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN outcome = 'draw' THEN 1 ELSE 0 END) AS draws
     FROM games WHERE verified = 1`,
  ).first<{ wins: number; losses: number; draws: number }>();

  // Family C — speed/survival proxies. Boss rush + puzzle rush bests
  // live in localStorage today, so the only server-side speed signal
  // is "most active player" — derived from games table since the
  // users row doesn't carry a denormalized count.
  const speedAgg = await c.env.DB.prepare(
    `SELECT MAX(gp) AS top_games FROM (
       SELECT user_id, COUNT(*) AS gp
       FROM games
       WHERE verified = 1
       GROUP BY user_id
     )`,
  ).first<{ top_games: number | null }>();

  return c.json({
    generatedAt: new Date(now).toISOString(),
    onlineWindowMinutes: ONLINE_WINDOW_MS / 60_000,
    population: {
      total,
      online,
      undeclared,
    },
    byRegion: (Object.values(byRegion) as { region: Region; label: string; total: number; online: number }[])
      .sort((a, b) => b.total - a.total),
    topProvinces,
    families: {
      outcome: {
        avgRating: Math.round(ratingAgg?.avg_rating ?? 0),
        topRating: ratingAgg?.top_rating ?? 0,
        totalGames: gameCount?.games ?? 0,
        wins: outcomeAgg?.wins ?? 0,
        losses: outcomeAgg?.losses ?? 0,
        draws: outcomeAgg?.draws ?? 0,
      },
      // Quality + speed aggregates rely on tables we don't yet roll up
      // server-side (review summaries + rush bests live in localStorage).
      // Surface what we have today and leave the keys in place so a
      // future client read knows where to look.
      quality: {
        note: 'aggregated_client_side',
      },
      speed: {
        topGamesPlayed: speedAgg?.top_games ?? 0,
        note: 'rush_bests_client_side',
      },
    },
  });
});
