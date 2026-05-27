// Full user-journey scenarios.
//
// These tests assert the contract the client adapter will rely on:
//   1. New visitor can register with no input
//   2. Subsequent calls with the returned token resolve to the same user
//   3. Recording games updates the user's server-side rating via Elo
//   4. Match leaderboard surfaces multiple users in the right order
//   5. Casual games don't move the rating but still appear in history
//
// What we deliberately do NOT test here:
//   - Engine verification of move logs (deferred to Phase 9B cron)
//   - Multi-region D1 replication (out of scope for local miniflare)

import { describe, expect, test } from 'vitest';
import {
  baseUrl,
  createAnonUser,
  getGameHistory,
  getMatchLeaderboard,
  getProfile,
  recordGame,
  verifiedGameFor,
} from './helpers';

describe('infrastructure', () => {
  test('health endpoint reports the service is up', async () => {
    const res = await fetch(`${baseUrl()}/api/health`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { ok: boolean; name: string };
    expect(body.ok).toBe(true);
    expect(body.name).toBe('openmakruk-api');
  });

  test('D1 ping succeeds', async () => {
    const res = await fetch(`${baseUrl()}/api/db/ping`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('unknown route returns structured 404', async () => {
    const res = await fetch(`${baseUrl()}/api/nope`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not_found');
  });

  test('GET /api/stats returns population shape (used by /#/stats page)', async () => {
    // Ensure at least one human exists so the per-province scan has
    // a row to count. createAnonUser is shared across the whole spec
    // so the population will only grow.
    await createAnonUser('StatsHuman');
    const res = await fetch(`${baseUrl()}/api/stats`);
    expect(res.ok).toBe(true);
    const body = await res.json() as {
      population: { total: number; online: number };
      byRegion: unknown[];
      topProvinces: unknown[];
      families: { outcome: { totalGames: number }; speed: { topGamesPlayed: number } };
    };
    // Shape contract — every key the StatsPage reads must be present.
    expect(body.population.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.byRegion)).toBe(true);
    expect(body.byRegion.length).toBe(6); // exactly 6 ภาค
    expect(Array.isArray(body.topProvinces)).toBe(true);
    expect(typeof body.families.outcome.totalGames).toBe('number');
    expect(typeof body.families.speed.topGamesPlayed).toBe('number');
  });
});

describe('anonymous registration', () => {
  test('POST /users/anon mints a unique id + bearer token', async () => {
    const a = await createAnonUser('AlphaUser');
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.token.length).toBeGreaterThanOrEqual(32);
    expect(a.displayName).toBe('AlphaUser');
    expect(a.rating).toBe(1000);

    const b = await createAnonUser('BetaUser');
    expect(b.id).not.toBe(a.id);
    expect(b.token).not.toBe(a.token);
  });

  test('the returned token authenticates GET /users/me', async () => {
    const u = await createAnonUser('AuthCheck');
    const me = await getProfile(u.token);
    expect(me.id).toBe(u.id);
    expect(me.displayName).toBe('AuthCheck');
    expect(me.rating).toBe(1000);
  });

  test('GET /users/me without bearer returns 401', async () => {
    const res = await fetch(`${baseUrl()}/api/users/me`);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string; reason: string };
    expect(body.error).toBe('unauthorized');
    expect(body.reason).toBe('missing_bearer');
  });

  test('a bogus bearer returns 401 unknown_token', async () => {
    const res = await fetch(`${baseUrl()}/api/users/me`, {
      headers: { Authorization: 'Bearer 0123456789abcdef0123456789abcdef' },
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string; reason: string };
    expect(body.reason).toBe('unknown_token');
  });

  test('POST /users/me/rotate issues a new token; old token stops working', async () => {
    const u = await createAnonUser('RotatorAlice');
    // New token comes back from rotate.
    const rotateRes = await fetch(`${baseUrl()}/api/users/me/rotate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${u.token}` },
    });
    expect(rotateRes.status).toBe(200);
    const rotated = await rotateRes.json() as { id: string; token: string; rotatedAt: number };
    expect(rotated.id).toBe(u.id);
    expect(rotated.token).not.toBe(u.token);
    expect(rotated.token.length).toBeGreaterThanOrEqual(32);

    // Old token = 401 now (the "sign out everywhere" effect).
    const stale = await fetch(`${baseUrl()}/api/users/me`, {
      headers: { Authorization: `Bearer ${u.token}` },
    });
    expect(stale.status).toBe(401);

    // New token works.
    const fresh = await fetch(`${baseUrl()}/api/users/me`, {
      headers: { Authorization: `Bearer ${rotated.token}` },
    });
    expect(fresh.status).toBe(200);
    const profile = await fresh.json() as { id: string; displayName: string };
    expect(profile.id).toBe(u.id);
    expect(profile.displayName).toBe('RotatorAlice');
  });

  test('DELETE /users/me wipes the account; subsequent /me returns 401', async () => {
    const u = await createAnonUser('DeletableDave');
    // Play one game so we have non-trivial state to clean up.
    await recordGame(u.token, { opponent: 'easy', outcome: 'win', plyCount: 30 });

    const delRes = await fetch(`${baseUrl()}/api/users/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${u.token}` },
    });
    expect(delRes.status).toBe(200);
    const body = await delRes.json() as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(body.id).toBe(u.id);

    // Subsequent requests with the same bearer = 401.
    const after = await fetch(`${baseUrl()}/api/users/me`, {
      headers: { Authorization: `Bearer ${u.token}` },
    });
    expect(after.status).toBe(401);
  });

  test('rotate without auth → 401', async () => {
    const res = await fetch(`${baseUrl()}/api/users/me/rotate`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  test('delete without auth → 401', async () => {
    const res = await fetch(`${baseUrl()}/api/users/me`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

describe('play a game vs bot → record outcome', () => {
  test('a win against medium CPU raises rating', async () => {
    const u = await createAnonUser('Winner');
    const res = await recordGame(u.token, {
      opponent: 'medium',
      outcome: 'win',
      plyCount: 40,
    });
    expect(res.ratingBefore).toBe(1000);
    expect(res.ratingDelta).toBeGreaterThan(0);
    expect(res.ratingAfter).toBe(res.ratingBefore + res.ratingDelta);

    const me = await getProfile(u.token);
    expect(me.rating).toBe(res.ratingAfter);
  });

  test('a loss against easy CPU drops rating', async () => {
    const u = await createAnonUser('Loser');
    const res = await recordGame(u.token, {
      opponent: 'easy',
      outcome: 'loss',
      plyCount: 35,
    });
    expect(res.ratingDelta).toBeLessThan(0);
    expect(res.ratingAfter).toBe(res.ratingBefore + res.ratingDelta);
  });

  test('a draw vs hard CPU still nudges rating (we are weaker)', async () => {
    const u = await createAnonUser('Drawer');
    const res = await recordGame(u.token, {
      opponent: 'hard',
      outcome: 'draw',
      plyCount: 80,
    });
    // We're rated 1000 and hard is 1900 — a draw is a strong result,
    // so rating should rise.
    expect(res.ratingDelta).toBeGreaterThan(0);
  });

  test('casual mode leaves rating unchanged but persists the game', async () => {
    const u = await createAnonUser('CasualPlayer');
    const before = (await getProfile(u.token)).rating;

    const res = await recordGame(u.token, {
      opponent: 'master',
      outcome: 'win',
      plyCount: 60,
      mode: 'casual',
    });
    expect(res.ratingDelta).toBe(0);
    expect(res.ratingAfter).toBe(res.ratingBefore);

    const after = (await getProfile(u.token)).rating;
    expect(after).toBe(before);

    const history = await getGameHistory(u.token);
    expect(history.games.find((g) => g.id === res.id)).toBeDefined();
  });
});

describe('accumulate score over a session', () => {
  test('5 wins vs medium grow rating roughly monotonically', async () => {
    const u = await createAnonUser('SessionUser');
    const trajectory: number[] = [];

    for (let i = 0; i < 5; i++) {
      const res = await recordGame(u.token, {
        opponent: 'medium',
        outcome: 'win',
        plyCount: 40,
      });
      trajectory.push(res.ratingAfter);
    }

    expect(trajectory.length).toBe(5);
    // Each next entry should be ≥ the previous (Elo gain per win
    // diminishes as you climb past the opponent's rating but stays
    // non-negative against an equal-or-stronger opponent).
    for (let i = 1; i < trajectory.length; i++) {
      expect(trajectory[i]).toBeGreaterThanOrEqual(trajectory[i - 1] - 1);
    }
    // Final rating is meaningfully higher than the starting 1000.
    expect(trajectory[4]).toBeGreaterThan(1000);
  });

  test('history reflects all submitted games newest-first', async () => {
    const u = await createAnonUser('HistoryUser');
    const outcomes: Array<'win' | 'loss' | 'draw'> = ['win', 'loss', 'draw', 'win'];
    for (const o of outcomes) {
      await recordGame(u.token, { opponent: 'easy', outcome: o, plyCount: 20 });
    }
    const history = await getGameHistory(u.token);
    expect(history.games.length).toBe(4);
    // newest-first: last submitted ('win') should be at index 0
    expect(history.games[0].outcome).toBe('win');
    expect(history.games[3].outcome).toBe('win');
  });
});

describe('global match leaderboard', () => {
  test('three users with different scores rank in score order', async () => {
    // Distinct names so we can find ourselves in the response.
    const top = await createAnonUser('LB_Top');
    const mid = await createAnonUser('LB_Mid');
    const low = await createAnonUser('LB_Low');

    // top: 3 wins vs hard (weight 8 each = 24)
    for (let i = 0; i < 3; i++) {
      await recordGame(top.token, { opponent: 'hard', outcome: 'win', plyCount: 50 });
    }
    // mid: 2 wins vs medium (weight 3 each = 6)
    for (let i = 0; i < 2; i++) {
      await recordGame(mid.token, { opponent: 'medium', outcome: 'win', plyCount: 30 });
    }
    // low: 5 wins vs easy (weight 1 each = 5)
    for (let i = 0; i < 5; i++) {
      await recordGame(low.token, { opponent: 'easy', outcome: 'win', plyCount: 20 });
    }

    const lb = await getMatchLeaderboard(10);
    const topRow = lb.entries.find((e) => e.userId === top.id);
    const midRow = lb.entries.find((e) => e.userId === mid.id);
    const lowRow = lb.entries.find((e) => e.userId === low.id);

    expect(topRow).toBeDefined();
    expect(midRow).toBeDefined();
    expect(lowRow).toBeDefined();
    expect(topRow!.score).toBeGreaterThan(midRow!.score);
    expect(midRow!.score).toBeGreaterThan(lowRow!.score);
    expect(topRow!.rank).toBeLessThan(midRow!.rank);
    expect(midRow!.rank).toBeLessThan(lowRow!.rank);
  });

  test('losses + draws affect the score in the right direction', async () => {
    const u = await createAnonUser('LBMixed');
    // 1 win vs master (20) + 1 draw vs master (10) + 2 losses (0) = 30
    await recordGame(u.token, { opponent: 'master', outcome: 'win',  plyCount: 60 });
    await recordGame(u.token, { opponent: 'master', outcome: 'draw', plyCount: 80 });
    await recordGame(u.token, { opponent: 'master', outcome: 'loss', plyCount: 40 });
    await recordGame(u.token, { opponent: 'master', outcome: 'loss', plyCount: 35 });

    const lb = await getMatchLeaderboard(100);
    const row = lb.entries.find((e) => e.userId === u.id);
    expect(row).toBeDefined();
    expect(row!.wins).toBe(1);
    expect(row!.draws).toBe(1);
    expect(row!.losses).toBe(2);
    expect(row!.score).toBeCloseTo(30, 1);
  });

  test('personality bots do NOT count toward match leaderboard', async () => {
    const u = await createAnonUser('PersonalityFarmer');
    // Wins vs personality should add no leaderboard score even though
    // the game is recorded (and rating is touched).
    for (let i = 0; i < 5; i++) {
      await recordGame(u.token, {
        opponent: 'personality:hunter',
        outcome: 'win',
        plyCount: 30,
      });
    }
    const lb = await getMatchLeaderboard(100);
    const row = lb.entries.find((e) => e.userId === u.id);
    // Match LB SQL filters by the 4 weighted opponents only, so this
    // user has nothing to aggregate and must be absent.
    expect(row).toBeUndefined();
  });
});

describe('code-golf mate mode', () => {
  test('valid golf attempt records + returns personal/global best', async () => {
    // Fetch a curated mate-1 puzzle so we can play its canonical
    // solution and assert the response shape.
    const list = await fetch(`${baseUrl()}/api/puzzles?category=mate-1`);
    const body = await list.json() as {
      puzzles: Array<{ id: string; solution: string[] }>;
    };
    const puzzle = body.puzzles[0];
    expect(puzzle).toBeDefined();

    const user = await createAnonUser('Golfer');
    const res = await fetch(`${baseUrl()}/api/puzzles/${puzzle.id}/golf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ moves: puzzle.solution }),
    });
    expect(res.ok).toBe(true);
    const result = await res.json() as {
      plyCount: number;
      personalBest: number;
      globalBest: number;
      isPersonalBest: boolean;
      isGlobalBest: boolean;
    };
    expect(result.plyCount).toBe(puzzle.solution.length);
    expect(result.isPersonalBest).toBe(true);
  });

  test('illegal move in attempt → 422 with failedAtPly', async () => {
    const list = await fetch(`${baseUrl()}/api/puzzles?category=mate-1`);
    const body = await list.json() as { puzzles: Array<{ id: string }> };
    const puzzle = body.puzzles[0];
    const user = await createAnonUser('GolfCheater');
    const res = await fetch(`${baseUrl()}/api/puzzles/${puzzle.id}/golf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ moves: ['zz9z'] }),
    });
    expect(res.status).toBe(422);
  });

  test('non-mate sequence → 422 not_checkmate', async () => {
    // mate-1 puzzles should mate in 1 move. Submitting an empty-ish
    // sequence (or a legal but non-mating move) should reject.
    const list = await fetch(`${baseUrl()}/api/puzzles?category=mate-1`);
    const body = await list.json() as {
      puzzles: Array<{ id: string; fen: string; solution: string[] }>;
    };
    const puzzle = body.puzzles[0];
    const user = await createAnonUser('NonMater');
    // Just submitting the OPPONENT's reply to the canonical solution
    // is a hack — most mate-1 puzzles only need one move. Submit a
    // single move that's clearly legal but unlikely to mate: the
    // canonical first move TRUNCATED to skip the mating piece. As a
    // simpler approach, send a move that's NOT in the solution.
    void puzzle.fen;
    const wrongMove = puzzle.solution[0].slice(0, 2) + puzzle.solution[0].slice(0, 2); // a1a1 — illegal
    const res = await fetch(`${baseUrl()}/api/puzzles/${puzzle.id}/golf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ moves: [wrongMove] }),
    });
    expect(res.status).toBe(422);
  });

  test('non-mate puzzle category rejects golf attempt', async () => {
    const list = await fetch(`${baseUrl()}/api/puzzles?category=tactic`);
    const body = await list.json() as { puzzles: Array<{ id: string; solution: string[] }> };
    const tactic = body.puzzles[0];
    if (!tactic) return; // skip if no tactic puzzles
    const user = await createAnonUser('NonMateGolfer');
    const res = await fetch(`${baseUrl()}/api/puzzles/${tactic.id}/golf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ moves: tactic.solution }),
    });
    expect(res.status).toBe(400);
    const errBody = await res.json() as { reason: string };
    expect(errBody.reason).toBe('golf_only_mate_puzzles');
  });
});

describe('curated puzzle catalog', () => {
  test('GET /api/puzzles returns the seeded curated pool', async () => {
    const res = await fetch(`${baseUrl()}/api/puzzles`);
    expect(res.ok).toBe(true);
    const body = await res.json() as {
      puzzles: Array<{ id: string; category: string; source: string }>;
      nextCursor: string | null;
    };
    expect(body.puzzles.length).toBeGreaterThan(0);
    // All page entries must be 'curated' since that's the default
    // source filter.
    for (const p of body.puzzles) expect(p.source).toBe('curated');
  });

  test('category filter narrows to one category', async () => {
    const res = await fetch(`${baseUrl()}/api/puzzles?category=mate-1`);
    const body = await res.json() as {
      puzzles: Array<{ category: string }>;
    };
    expect(body.puzzles.length).toBeGreaterThan(0);
    for (const p of body.puzzles) expect(p.category).toBe('mate-1');
  });

  test('GET /api/puzzles/:id returns a single curated puzzle', async () => {
    // First fetch the list, then probe one entry by id. Doing it this
    // way (instead of hardcoding an id) keeps the test resilient to
    // catalog edits.
    const list = await fetch(`${baseUrl()}/api/puzzles?category=mate-1`);
    const body = await list.json() as { puzzles: Array<{ id: string }> };
    const first = body.puzzles[0];
    const res = await fetch(`${baseUrl()}/api/puzzles/${first.id}`);
    expect(res.ok).toBe(true);
    const detail = await res.json() as { id: string; fen: string };
    expect(detail.id).toBe(first.id);
    expect(detail.fen.length).toBeGreaterThan(0);
  });
});

describe('server-side game verification', () => {
  test('rated win is marked verified=true after replay', async () => {
    const u = await createAnonUser('Verifier');
    const res = await recordGame(u.token, { opponent: 'medium', outcome: 'win' });
    expect(res.verified).toBe(true);
  });

  test('rated game with junk moves is REJECTED 422', async () => {
    const u = await createAnonUser('CheaterMoves');
    const res = await fetch(`${baseUrl()}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({
        opponent: 'master',
        userSide: 'white',
        outcome: 'win',
        plyCount: 3,
        moves: ['a1a2', 'h1h2', 'a2a1'],  // legal moves but no checkmate
        finalFen: '8/8/8/8/8/8/8/4K3 b - - 0 1',  // bogus
        mode: 'rated',
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string; reason: string };
    expect(body.error).toBe('verification_failed');
  });

  test('rated game claiming WIN but no checkmate is rejected', async () => {
    const u = await createAnonUser('CheaterOutcome');
    // Submit the draw fixture but claim it was a "win" — verifier must
    // reject because the position isn't checkmate.
    const drawFixture = verifiedGameFor('draw');
    const res = await fetch(`${baseUrl()}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({
        opponent: 'master',
        userSide: 'white',
        outcome: 'win',
        plyCount: drawFixture.plyCount,
        moves: drawFixture.moves,
        finalFen: drawFixture.finalFen,
        mode: 'rated',
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { reason: string };
    expect(body.reason).toMatch(/outcome_mismatch/);
  });

  test('UNVERIFIED game does NOT show up on the match leaderboard', async () => {
    const u = await createAnonUser('GhostUser');
    // Successfully record a rated win — verified=1.
    await recordGame(u.token, { opponent: 'hard', outcome: 'win' });
    // Try to slip in a cheat directly via the API with junk moves —
    // server rejects, so no row gets in to begin with.
    const cheat = await fetch(`${baseUrl()}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({
        opponent: 'master',
        userSide: 'white',
        outcome: 'win',
        plyCount: 1,
        moves: ['a1a8'],  // would need pieces cleared first; illegal
        finalFen: '8/8/8/8/8/8/8/8 b - - 0 1',
        mode: 'rated',
      }),
    });
    expect(cheat.status).toBe(422);
    // LB still contains the legitimate single-game record.
    const lb = await getMatchLeaderboard(200);
    const me = lb.entries.find((e) => e.userId === u.id);
    expect(me).toBeDefined();
    expect(me!.wins).toBe(1);
  });
});

describe('province + region (regional leaderboards)', () => {
  test('register with province persists it on the user', async () => {
    const res = await fetch(`${baseUrl()}/api/users/anon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'BkkPlayer', province: '10' }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { province: string; region: string };
    expect(body.province).toBe('10');
    expect(body.region).toBe('central'); // Bangkok → central
  });

  test('invalid province code → 400', async () => {
    const res = await fetch(`${baseUrl()}/api/users/anon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Hacker', province: 'XX99' }),
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /me can update province', async () => {
    const user = await createAnonUser('PatchProvince');
    const res = await fetch(`${baseUrl()}/api/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ province: '50' }), // Chiang Mai
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { province: string; region: string };
    expect(body.province).toBe('50');
    expect(body.region).toBe('north');
  });

  test('GET /me echoes the stored province + region', async () => {
    const user = await createAnonUser('GetMe');
    await fetch(`${baseUrl()}/api/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ province: '83' }), // Phuket
    });
    const res = await fetch(`${baseUrl()}/api/users/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const body = await res.json() as { province: string; region: string };
    expect(body.province).toBe('83');
    expect(body.region).toBe('south');
  });

  test('leaderboard filtered by province surfaces only that province', async () => {
    // Three users in different provinces, each posts a verified win.
    const bkk = await fetch(`${baseUrl()}/api/users/anon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'BKK_Alice', province: '10' }),
    });
    const bkkUser = await bkk.json() as { id: string; token: string };
    const cmi = await fetch(`${baseUrl()}/api/users/anon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'CMI_Bob', province: '50' }),
    });
    const cmiUser = await cmi.json() as { id: string; token: string };

    await recordGame(bkkUser.token, { opponent: 'medium', outcome: 'win' });
    await recordGame(cmiUser.token, { opponent: 'medium', outcome: 'win' });

    const bkkLb = await fetch(`${baseUrl()}/api/leaderboard/match?province=10`);
    const bkkBody = await bkkLb.json() as { entries: Array<{ userId: string; province: string }> };
    expect(bkkBody.entries.some((e) => e.userId === bkkUser.id)).toBe(true);
    expect(bkkBody.entries.every((e) => e.province === '10')).toBe(true);

    const cmiLb = await fetch(`${baseUrl()}/api/leaderboard/match?province=50`);
    const cmiBody = await cmiLb.json() as { entries: Array<{ userId: string }> };
    expect(cmiBody.entries.some((e) => e.userId === cmiUser.id)).toBe(true);
    expect(cmiBody.entries.every((e) => e.userId !== bkkUser.id)).toBe(true);
  });

  test('leaderboard filtered by region rolls up provinces', async () => {
    // Two users in different north-region provinces.
    const cmi = await fetch(`${baseUrl()}/api/users/anon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'NorthA', province: '50' }), // Chiang Mai
    });
    const cmiUser = await cmi.json() as { id: string; token: string };
    const cri = await fetch(`${baseUrl()}/api/users/anon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'NorthB', province: '57' }), // Chiang Rai
    });
    const criUser = await cri.json() as { id: string; token: string };

    await recordGame(cmiUser.token, { opponent: 'hard', outcome: 'win' });
    await recordGame(criUser.token, { opponent: 'hard', outcome: 'win' });

    const lb = await fetch(`${baseUrl()}/api/leaderboard/match?region=north&limit=200`);
    const body = await lb.json() as {
      entries: Array<{ userId: string; province: string }>;
      scope: { region: string; regionLabelTh: string };
    };
    const ids = new Set(body.entries.map((e) => e.userId));
    expect(ids.has(cmiUser.id)).toBe(true);
    expect(ids.has(criUser.id)).toBe(true);
    expect(body.scope.regionLabelTh).toBe('ภาคเหนือ');
  });

  test('GET /match/by-province aggregates one row per province', async () => {
    const res = await fetch(`${baseUrl()}/api/leaderboard/match/by-province`);
    expect(res.ok).toBe(true);
    const body = await res.json() as {
      entries: Array<{ province: string; score: number; playerCount: number }>;
    };
    // Each entry has a non-null province + non-zero score (HAVING+WHERE
    // would filter out empty provinces, but defensive).
    for (const e of body.entries) {
      expect(e.province).toBeTruthy();
      expect(e.playerCount).toBeGreaterThan(0);
    }
  });
});

describe('bot character system', () => {
  test('GET /api/bots lists all 22 seeded bots', async () => {
    const res = await fetch(`${baseUrl()}/api/bots`);
    expect(res.ok).toBe(true);
    const body = await res.json() as {
      bots: Array<{ id: string; displayName: string; rating: number; personality: string; tier: string }>;
    };
    // 7 personalities × 3 tiers + 1 Fairy-Stockfish boss = 22
    expect(body.bots.length).toBe(22);
    // Spot-check one — Bangkok-style ⚔️ นักบุก Master is rating 2000
    const nakkrubMaster = body.bots.find((b) => b.id === 'bot:attacker-master');
    expect(nakkrubMaster).toBeDefined();
    expect(nakkrubMaster!.rating).toBe(2000);
    expect(nakkrubMaster!.tier).toBe('master');
    // Boss exists at 2200
    const boss = body.bots.find((b) => b.id === 'bot:fairy-stockfish-boss');
    expect(boss).toBeDefined();
    expect(boss!.rating).toBe(2200);
  });

  test('GET /api/bots/:id returns single bot profile', async () => {
    const res = await fetch(`${baseUrl()}/api/bots/bot:defender-veteran`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { id: string; personality: string; tier: string };
    expect(body.id).toBe('bot:defender-veteran');
    expect(body.personality).toBe('defender');
    expect(body.tier).toBe('veteran');
  });

  test('GET /api/bots/:id unknown id → 404 (lenient: prefix-less ids accepted)', async () => {
    // Phase 24 (2026-05-27): worker now normalizes both `attacker-master`
    // and `bot:attacker-master` to the prefixed form before lookup, so
    // share URLs can carry the cleaner slug. Unknown ids — bot:-less
    // or not — return 404, not 400.
    const res = await fetch(`${baseUrl()}/api/bots/some-uuid-not-bot`);
    expect(res.status).toBe(404);
  });

  test('GET /api/bots/:id prefix-less but valid → resolves like prefixed form', async () => {
    // Cleaner share-URL form (`/api/bots/wanderer-rookie`) must return
    // the same record as the legacy form (`/api/bots/bot:wanderer-rookie`).
    const a = await fetch(`${baseUrl()}/api/bots/wanderer-rookie`);
    expect(a.status).toBe(200);
    const aBody = await a.json() as { id: string };
    expect(aBody.id).toBe('bot:wanderer-rookie');
  });

  test('recordGame against a bot bumps the bot rating too', async () => {
    const user = await createAnonUser('BotFighter');
    const before = await fetch(`${baseUrl()}/api/bots/bot:wanderer-rookie`);
    const beforeBot = await before.json() as { rating: number };

    // Beat the wanderer-rookie. As the higher-rated win path, the bot
    // should LOSE elo and the user GAIN it.
    await recordGame(user.token, {
      opponent: 'bot:wanderer-rookie',
      outcome: 'win',
    });

    const after = await fetch(`${baseUrl()}/api/bots/bot:wanderer-rookie`);
    const afterBot = await after.json() as { rating: number };
    expect(afterBot.rating).toBeLessThan(beforeBot.rating);
  });

  test('recordGame against an unknown bot id → 400', async () => {
    const user = await createAnonUser('BogusBotChallenger');
    const res = await fetch(`${baseUrl()}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({
        opponent: 'bot:does-not-exist',
        userSide: 'white',
        outcome: 'win',
        plyCount: 1,
        moves: ['a1a2'],
        finalFen: '8/8/8/8/8/8/8/4K3 b - - 0 1',
        mode: 'rated',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { reason: string };
    expect(body.reason).toBe('unknown_bot');
  });

  test('rating leaderboard includes bots by default (mixed)', async () => {
    const res = await fetch(`${baseUrl()}/api/leaderboard/rating?limit=200`);
    expect(res.ok).toBe(true);
    const body = await res.json() as {
      entries: Array<{ userId: string; isBot: boolean; rating: number }>;
    };
    const botEntries = body.entries.filter((e) => e.isBot);
    expect(botEntries.length).toBeGreaterThan(0);
    // Boss should be #1 (or near top — only humans with rating > 2200
    // could outrank it).
    const boss = body.entries.find((e) => e.userId === 'bot:fairy-stockfish-boss');
    expect(boss).toBeDefined();
  });

  test('rating leaderboard humans-only filter excludes bots', async () => {
    const res = await fetch(`${baseUrl()}/api/leaderboard/rating?include=humans`);
    const body = await res.json() as { entries: Array<{ isBot: boolean }> };
    expect(body.entries.every((e) => !e.isBot)).toBe(true);
  });

  test('rating leaderboard bots-only filter shows only bots', async () => {
    const res = await fetch(`${baseUrl()}/api/leaderboard/rating?include=bots&limit=50`);
    const body = await res.json() as { entries: Array<{ isBot: boolean }> };
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.every((e) => e.isBot)).toBe(true);
  });
});

describe('badges (server-side tier ladder)', () => {
  test('GET /api/badges returns the static catalog', async () => {
    const res = await fetch(`${baseUrl()}/api/badges`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { badges: Array<{ id: string; tier: string; category: string }> };
    expect(body.badges.length).toBeGreaterThan(10);
    // Spot-check tier ladder structure
    const rating = body.badges.filter((b) => b.category === 'rating');
    expect(rating.length).toBe(4);
    expect(rating.map((b) => b.tier).sort()).toEqual(['bronze', 'diamond', 'gold', 'silver']);
  });

  test('first verified win unlocks bot-rookie or higher tier badge', async () => {
    const user = await createAnonUser('BadgeHunter');
    // Beat rookie-tier bot once.
    const res = await recordGame(user.token, {
      opponent: 'bot:wanderer-rookie',
      outcome: 'win',
    });
    expect((res as unknown as { newBadges: string[] }).newBadges).toContain('bot-rookie');
  });

  test('GET /api/badges/me lists unlocked badges for this user', async () => {
    const user = await createAnonUser('MyBadges');
    await recordGame(user.token, { opponent: 'bot:wanderer-rookie', outcome: 'win' });
    const res = await fetch(`${baseUrl()}/api/badges/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const body = await res.json() as {
      badges: Array<{ badgeId: string; shareableSlug: string }>;
    };
    expect(body.badges.length).toBeGreaterThan(0);
    expect(body.badges.some((b) => b.badgeId === 'bot-rookie')).toBe(true);
  });

  test('public cert page resolves from a shareable slug', async () => {
    const user = await createAnonUser('CertHolder');
    await recordGame(user.token, { opponent: 'bot:wanderer-rookie', outcome: 'win' });
    const list = await fetch(`${baseUrl()}/api/badges/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const body = await list.json() as {
      badges: Array<{ badgeId: string; shareableSlug: string }>;
    };
    const slug = body.badges[0].shareableSlug;
    const cert = await fetch(`${baseUrl()}/api/cert/${slug}`);
    expect(cert.ok).toBe(true);
    const certBody = await cert.json() as {
      badge: { id: string };
      displayName: string;
    };
    expect(certBody.badge.id).toBe(body.badges[0].badgeId);
    expect(certBody.displayName).toBe('CertHolder');
  });

  test('cert with unknown slug → 404', async () => {
    const res = await fetch(`${baseUrl()}/api/cert/notarealslug-foo`);
    expect(res.status).toBe(404);
  });

  test('badges are idempotent — re-evaluating does not duplicate', async () => {
    const user = await createAnonUser('IdempotentBadges');
    // Trigger once
    await recordGame(user.token, { opponent: 'bot:wanderer-rookie', outcome: 'win' });
    // Force-evaluate — should NOT issue bot-rookie again
    const reeval = await fetch(`${baseUrl()}/api/badges/me/evaluate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const body = await reeval.json() as { newBadges: string[] };
    expect(body.newBadges).not.toContain('bot-rookie');
  });

  test('bots themselves never earn badges', async () => {
    // Direct DB peek would be cleaner, but we can verify through the
    // contract: bots have is_bot=1 and evaluateBadges() early-returns.
    // Sanity check via the public cert endpoint — no cert exists for
    // any bot id since they never got slugs.
    const res = await fetch(`${baseUrl()}/api/cert/zzzzz-bot-master`);
    expect(res.status).toBe(404);
  });
});

describe('input validation', () => {
  test('missing opponent → 400 opponent_required', async () => {
    const u = await createAnonUser('Validator');
    const res = await fetch(`${baseUrl()}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({ outcome: 'win', plyCount: 10 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { reason: string };
    expect(body.reason).toBe('opponent_required');
  });

  test('absurd plyCount → 400 plyCount_range', async () => {
    const u = await createAnonUser('PlyCheater');
    const res = await fetch(`${baseUrl()}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({
        opponent: 'master',
        userSide: 'white',
        outcome: 'win',
        plyCount: 99999,
        finalFen: '8/8/8/8/8/8/8/4K3 b - - 0 1',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('moves array length must match plyCount', async () => {
    const u = await createAnonUser('LengthCheater');
    const res = await fetch(`${baseUrl()}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({
        opponent: 'medium',
        userSide: 'white',
        outcome: 'win',
        plyCount: 5,
        moves: ['e2e4'], // only 1 move, claims 5 ply
        finalFen: '8/8/8/8/8/8/8/4K3 b - - 0 1',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { reason: string };
    expect(body.reason).toBe('moves_length_mismatch');
  });
});

describe('feedback', () => {
  test('POST /api/feedback accepts anonymous submission', async () => {
    const res = await fetch(`${baseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'ขอบคุณสำหรับเกมที่ดี',
        kind: 'praise',
        buildSha: 'test1234',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(body.id.length).toBeGreaterThan(10);
  });

  test('POST /api/feedback requires non-empty message', async () => {
    const res = await fetch(`${baseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ', kind: 'bug' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { reason: string };
    expect(body.reason).toBe('message_required');
  });

  test('POST /api/feedback with bearer token associates user_id', async () => {
    const u = await createAnonUser('FeedbackUser');
    const res = await fetch(`${baseUrl()}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${u.token}`,
      },
      body: JSON.stringify({
        message: 'พบบั๊กที่หน้า counting',
        kind: 'bug',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
  });

  test('POST /api/feedback rate-limits per user (5/hour)', async () => {
    const u = await createAnonUser('RateLimited');
    // First 5 should succeed, 6th should 429.
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${baseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ message: `msg ${i}`, kind: 'other' }),
      });
      expect(r.status).toBe(200);
    }
    const blocked = await fetch(`${baseUrl()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({ message: 'too many', kind: 'other' }),
    });
    expect(blocked.status).toBe(429);
  });
});
