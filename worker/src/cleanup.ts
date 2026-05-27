// Idle test-account cleanup.
//
// Why this exists:
//   The E2E suite (tests/e2e/cloud-sync.spec.ts) calls /api/users/anon
//   on most runs, leaving anonymous accounts in production D1 that
//   never play a verified game. Over time these pollute /api/stats
//   ("11 players, 0 games") and look like ghost users to a casual
//   visitor.
//
//   This module identifies and wipes accounts that:
//     1. Are human (is_bot = 0)
//     2. Have NEVER played a verified game
//     3. Have not been seen for > THRESHOLD_MS
//
//   Anything that touched a real game stays — the bar is "this account
//   has ever existed beyond an automated touch." Province + display name
//   alone don't save an account; the user has to have played.
//
// Safety:
//   - Threshold is 24h: gives a CI run a full day to come back if it
//     needs to (it never does in practice, but generous default).
//   - Deletes the user row + per-user state in one batch — same path
//     as DELETE /api/users/me, so behavior matches what a real user
//     deletion does.
//   - Bot rows (is_bot = 1) are excluded; their last_seen_at is the
//     last time they exhibited or got recorded against, which is
//     unrelated.
//
// Runs from the scheduled handler (every 30 min cron) — idempotent
// and cheap (one indexed scan).

import type { Env } from './index';

/** Accounts older than this with no verified games are removed. */
export const IDLE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

export type CleanupResult = {
  scanned: number;
  removed: number;
  removedIds: string[];
};

export async function runIdleCleanup(env: Env): Promise<CleanupResult> {
  const cutoff = Date.now() - IDLE_THRESHOLD_MS;

  // Find ghost humans: is_bot=0, never won/lost/drew a verified game,
  // last_seen older than cutoff. Created_at also older than cutoff so
  // we don't accidentally nuke an account someone literally registered
  // 2 minutes ago and hasn't loaded the page since (would be rare but
  // possible if their tab crashed during onboarding).
  const ghosts = await env.DB.prepare(
    `SELECT u.id
       FROM users u
       LEFT JOIN games g ON g.user_id = u.id AND g.verified = 1
      WHERE u.is_bot = 0
        AND u.last_seen_at < ?
        AND u.created_at < ?
        AND g.id IS NULL
      GROUP BY u.id`,
  )
    .bind(cutoff, cutoff)
    .all<{ id: string }>();

  const rows = ghosts.results ?? [];
  if (rows.length === 0) {
    return { scanned: 0, removed: 0, removedIds: [] };
  }

  // Same cascade order as the user-initiated DELETE /api/users/me — we
  // wipe per-user side tables first, then the row itself. A ghost
  // shouldn't have games (that's the filter), but the other tables
  // (cosmetics future, puzzle_solves if someone solved a puzzle but
  // never played) might still have rows.
  const statements: D1PreparedStatement[] = [];
  for (const r of rows) {
    statements.push(
      env.DB.prepare('DELETE FROM games WHERE user_id = ?').bind(r.id),
      env.DB.prepare('DELETE FROM user_badges WHERE user_id = ?').bind(r.id),
      env.DB.prepare('DELETE FROM puzzle_solves WHERE user_id = ?').bind(r.id),
      env.DB.prepare('DELETE FROM puzzle_golf WHERE user_id = ?').bind(r.id),
      env.DB.prepare('DELETE FROM leaderboard_cache WHERE user_id = ?').bind(r.id),
      env.DB.prepare('DELETE FROM season_winners WHERE user_id = ?').bind(r.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(r.id),
    );
  }
  await env.DB.batch(statements);

  return {
    scanned: rows.length,
    removed: rows.length,
    removedIds: rows.map((r) => r.id),
  };
}
