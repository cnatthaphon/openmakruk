// Shared client helpers — every test reaches the worker via these.
//
// Why a typed wrapper instead of raw fetch: integration tests get
// noisy fast if every assertion is around "did we send Content-Type",
// "did we parse JSON before assertion". The helpers below encode the
// repeated shape once and let tests read like specs.

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
}> {
  const ply = opts.plyCount ?? (opts.moves?.length ?? 30);
  const res = await fetch(`${baseUrl()}/api/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      opponent: opts.opponent,
      userSide: opts.userSide ?? 'white',
      outcome: opts.outcome,
      plyCount: ply,
      moves: opts.moves ?? fakeMoves(ply),
      finalFen: opts.finalFen ?? FAKE_FINAL_FEN,
      timeControlId: opts.timeControlId ?? null,
      mode: opts.mode ?? 'rated',
    }),
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

// Stand-in move sequences + final FEN so tests don't have to hand-craft
// a legal game just to exercise the write path. Engine verification is
// deferred (worker accepts moves_json as-is until the verification cron
// runs), so the content doesn't have to be playable today.
const FAKE_FINAL_FEN = '8/8/8/8/8/8/8/4K3 b - - 0 1';

function fakeMoves(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push('e2e4');
  return out;
}
