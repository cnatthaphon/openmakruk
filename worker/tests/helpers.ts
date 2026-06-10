// Shared client helpers — every test reaches the worker via these.
//
// Why a typed wrapper instead of raw fetch: integration tests get
// noisy fast if every assertion is around "did we send Content-Type",
// "did we parse JSON before assertion". The helpers below encode the
// repeated shape once and let tests read like specs.

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const WORKER_DIR = resolve(__dirname, '..');

export function baseUrl(): string {
  const u = process.env.WORKER_BASE_URL;
  if (!u) throw new Error('WORKER_BASE_URL not set — global setup did not run');
  return u;
}

export type AnonUser = {
  id: string;
  displayName: string;
  token: string;
  rating: number;
  createdAt: number;
};

export async function createAnonUser(displayName?: string): Promise<AnonUser> {
  const res = await fetch(`${baseUrl()}/api/users/anon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(displayName ? { displayName } : {}),
  });
  if (!res.ok) throw new Error(`createAnonUser failed: ${res.status}`);
  return (await res.json()) as AnonUser;
}

export async function queryLocalD1<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  const out = await runWranglerOutput([
    'd1',
    'execute',
    'openmakruk-db',
    '--local',
    '--command',
    sql,
  ]);
  const start = out.lastIndexOf('\n[');
  const json = start >= 0 ? out.slice(start + 1) : out.slice(out.indexOf('['));
  const parsed = JSON.parse(json) as Array<{ results?: T[]; success: boolean }>;
  return parsed[0]?.results ?? [];
}

function runWranglerOutput(args: string[]): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(
      'node',
      [resolve(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js'), ...args],
      {
        cwd: WORKER_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      },
    );
    const out: string[] = [];
    const err: string[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b.toString()));
    child.stderr.on('data', (b: Buffer) => err.push(b.toString()));
    child.on('close', (code) => {
      const stdout = out.join('');
      if (code === 0) {
        resolveP(stdout);
        return;
      }
      rejectP(new Error(`wrangler ${args.join(' ')} failed: ${err.join('')}${stdout}`));
    });
    child.on('error', (e) => rejectP(e));
  });
}

export function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export async function recordGame(
  token: string,
  opts: {
    opponent: string;
    userSide?: 'white' | 'black';
    outcome: 'win' | 'loss' | 'draw';
    plyCount?: number;
    moves?: string[];
    finalFen?: string;
    timeControlId?: string | null;
    mode?: 'rated' | 'casual';
  },
): Promise<{
  id: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  verified: boolean;
}> {
  // For rated games the server replays moves — caller's `moves` /
  // `finalFen` / `userSide` must be internally consistent or the write
  // fails with 422. Helpers pick the right fixture per outcome unless
  // the caller passes their own moves explicitly.
  const mode = opts.mode ?? 'rated';
  const fixture = !opts.moves && mode === 'rated' ? verifiedGameFor(opts.outcome) : null;
  const moves = opts.moves ?? fixture?.moves ?? [];
  const finalFen = opts.finalFen ?? fixture?.finalFen ?? FAKE_FINAL_FEN;
  const userSide = opts.userSide ?? fixture?.userSide ?? 'white';
  // When a fixture provides moves, ALWAYS use the fixture's ply count
  // — the server-side verifier requires moves.length === plyCount and
  // the caller's hint about "I played 40 moves" is irrelevant once we
  // substitute a real game in. Without this override, every legacy
  // test that hard-codes plyCount fails verification with
  // moves_length_mismatch.
  const plyCount = fixture ? moves.length : (opts.plyCount ?? moves.length);

  const body: Record<string, unknown> = {
    opponent: opts.opponent,
    userSide,
    outcome: opts.outcome,
    plyCount,
    finalFen,
    timeControlId: opts.timeControlId ?? null,
    mode,
  };
  // Only include `moves` when we actually have a sequence — the server
  // tolerates absent moves for casual writes (verification is skipped),
  // but an empty array trips the length-mismatch check.
  if (moves.length > 0) body.moves = moves;

  const res = await fetch(`${baseUrl()}/api/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`recordGame failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    id: string;
    ratingBefore: number;
    ratingAfter: number;
    ratingDelta: number;
    verified: boolean;
  };
}

export async function getProfile(token: string) {
  const res = await fetch(`${baseUrl()}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`getProfile failed: ${res.status}`);
  return res.json() as Promise<{
    id: string;
    displayName: string;
    rating: number;
    createdAt: number;
    lastSeenAt: number;
  }>;
}

export async function getMatchLeaderboard(limit = 100) {
  const res = await fetch(`${baseUrl()}/api/leaderboard/match?limit=${limit}`);
  if (!res.ok) throw new Error(`leaderboard failed: ${res.status}`);
  return res.json() as Promise<{
    entries: {
      rank: number;
      userId: string;
      displayName: string;
      rating: number;
      score: number;
      wins: number;
      losses: number;
      draws: number;
      gamesPlayed: number;
      lastActiveAt: number;
    }[];
  }>;
}

export async function getGameHistory(token: string) {
  const res = await fetch(`${baseUrl()}/api/games`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`history failed: ${res.status}`);
  return res.json() as Promise<{
    games: Array<{
      id: string;
      opponent: string;
      outcome: string;
      ratingDelta: number;
      ratingBefore: number;
      ratingAfter: number;
      createdAt: number;
    }>;
    nextCursor: string | null;
  }>;
}

// Pre-computed verified game sequences. Generated by
// scripts/generate-fixtures.mjs using the same rules engine the worker
// uses to verify writes — so these games pass verification by
// construction. Helpers below pick the right fixture per claimed
// outcome:
//   - 'win' / 'loss' → MATE fixture (terminal: checkmate)
//   - 'draw'         → DRAW fixture (halfmove >= 100)
//
// One fixture per outcome keeps the test set deterministic. If you
// need more variety, regenerate with different seeds.

import fixtures from './game-fixtures.json' with { type: 'json' };

const MATE = fixtures.mate;
const DRAW = fixtures.draw;
const FAKE_FINAL_FEN = MATE.finalFen;

/** Pick the right move log + final FEN + userSide for the desired
 *  outcome. The mate fixture has a fixed `loser` color; we map the
 *  user's claim onto that:
 *    - 'win'   → user is the side that ISN'T the loser
 *    - 'loss'  → user IS the loser
 *    - 'draw'  → user side doesn't matter; halfmove counter triggers */
export function verifiedGameFor(outcome: 'win' | 'loss' | 'draw'): {
  moves: string[];
  finalFen: string;
  plyCount: number;
  userSide: 'white' | 'black';
} {
  if (outcome === 'draw') {
    return {
      moves: DRAW.moves,
      finalFen: DRAW.finalFen,
      plyCount: DRAW.moves.length,
      userSide: 'white',
    };
  }
  const userSide = outcome === 'win' ? (MATE.loser === 'white' ? 'black' : 'white') : MATE.loser;
  return {
    moves: MATE.moves,
    finalFen: MATE.finalFen,
    plyCount: MATE.moves.length,
    userSide: userSide as 'white' | 'black',
  };
}
