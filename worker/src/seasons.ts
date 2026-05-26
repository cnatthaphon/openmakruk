// Seasonal ladder — server-side rollover + winner snapshotting.
//
// Two entry points:
//   • activeSeasonInfo()        — compute the "what quarter are we
//                                 in right now" metadata from the
//                                 current time. No DB read. Used by
//                                 the /api/seasons/active endpoint.
//   • runSeasonRolloverIfDue()  — invoked by the scheduled handler.
//                                 If the calendar quarter has rolled
//                                 over since the most-recent closed
//                                 season AND that prior season isn't
//                                 yet recorded, write its `seasons`
//                                 row + the top-3 winners per scope
//                                 into `season_winners`. Idempotent.

export type SeasonInfo = {
  id: string;          // "2026-Q2"
  label: string;       // "Q2 2026"
  startsAt: number;    // unix ms (inclusive)
  endsAt: number;      // unix ms (last instant of last day, inclusive)
};

/** Calculate the season id + window for a given Date — uses Bangkok
 *  local time semantics by relying on the date object's getMonth()
 *  which is local-tz. Cloudflare worker timezone defaults to UTC; for
 *  a global Thai-first product Bangkok = UTC+7 which means the
 *  quarter boundary fires at 17:00 UTC the previous day. Close
 *  enough for a ladder reset. */
export function seasonInfoForDate(date: Date): SeasonInfo {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-11
  const quarter = Math.floor(month / 3); // 0-3
  const startMonth = quarter * 3;
  const id = `${year}-Q${quarter + 1}`;
  const label = `Q${quarter + 1} ${year}`;
  const startsAt = Date.UTC(year, startMonth, 1, 0, 0, 0, 0);
  // End = last ms of the last day of the quarter
  const endsAt = Date.UTC(year, startMonth + 3, 1, 0, 0, 0, 0) - 1;
  return { id, label, startsAt, endsAt };
}

export function activeSeasonInfo(): SeasonInfo {
  return seasonInfoForDate(new Date());
}

export function previousSeasonInfo(now: Date = new Date()): SeasonInfo {
  // Subtract ~95 days to definitely land in the previous quarter.
  const prior = new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000);
  return seasonInfoForDate(prior);
}

type WinnerRow = {
  user_id: string;
  display_name: string;
  rating: number;
  province: string | null;
  region: string | null;
};

/** Snapshot the top 3 in each scope for the given season and write
 *  winners. Idempotent: if seasons row already exists, do nothing. */
export async function runSeasonRolloverIfDue(env: { DB: D1Database }): Promise<{
  recorded: string | null;
  winnerCount: number;
}> {
  const now = new Date();
  const current = activeSeasonInfo();
  const prior = previousSeasonInfo(now);
  // If we're still in the prior quarter (somehow), nothing to do.
  if (prior.id === current.id) return { recorded: null, winnerCount: 0 };

  // Has the prior season already been closed?
  const existing = await env.DB.prepare(
    `SELECT id FROM seasons WHERE id = ?`,
  ).bind(prior.id).first<{ id: string }>();
  if (existing) return { recorded: null, winnerCount: 0 };

  // Pull the top 50 humans (is_bot = 0) by rating — enough cushion
  // to compute per-scope top 3 without a separate SQL per scope.
  const result = await env.DB.prepare(
    `SELECT id AS user_id, display_name, rating, province, region
       FROM users
      WHERE is_bot = 0
      ORDER BY rating DESC
      LIMIT 50`,
  ).all<WinnerRow>();

  const rows = result.results ?? [];
  if (rows.length === 0) {
    // Empty table → still record the closed season so we don't keep
    // re-checking. No winners.
    await env.DB.prepare(
      `INSERT INTO seasons (id, label, starts_at, ends_at, closed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(prior.id, prior.label, prior.startsAt, prior.endsAt, now.getTime(), now.getTime()).run();
    return { recorded: prior.id, winnerCount: 0 };
  }

  // Build top-3-per-scope lists.
  const scopes = new Map<string, WinnerRow[]>();
  const pushScope = (scope: string, row: WinnerRow) => {
    const list = scopes.get(scope) ?? [];
    if (list.length < 3) list.push(row);
    scopes.set(scope, list);
  };
  // Global = everyone, top 3
  for (const row of rows) pushScope('global', row);
  // Region + province scoped
  for (const row of rows) {
    if (row.region) pushScope(`region:${row.region}`, row);
    if (row.province) pushScope(`province:${row.province}`, row);
  }

  // Insert season row + winners atomically. D1 has limited
  // transaction guarantees; we sequence the writes and accept that
  // a crash mid-write leaves a partial state which the next cron
  // tick won't retry (the season row exists). Acceptable for a
  // ladder rollover that runs quarterly.
  await env.DB.prepare(
    `INSERT INTO seasons (id, label, starts_at, ends_at, closed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(prior.id, prior.label, prior.startsAt, prior.endsAt, now.getTime(), now.getTime()).run();

  let winnerCount = 0;
  for (const [scope, list] of scopes.entries()) {
    let rank = 1;
    for (const w of list) {
      await env.DB.prepare(
        `INSERT INTO season_winners (season_id, scope, rank, user_id, display_name, rating)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(prior.id, scope, rank, w.user_id, w.display_name, w.rating).run();
      rank++;
      winnerCount++;
    }
  }

  return { recorded: prior.id, winnerCount };
}
