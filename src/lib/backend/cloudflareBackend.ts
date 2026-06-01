// Cloudflare-backed adapter — implements BackendAdapter against the
// worker at API_BASE.
//
// Lifecycle:
//   1. Module-load: instantiate ONE adapter pointing at the configured
//      API base. Configuration is read from Vite env (VITE_API_BASE)
//      with localhost:8788 as the dev fallback so `npm run dev` +
//      `wrangler dev` work out of the box.
//   2. `setBackend(cloudflareBackend)` is called only when the user
//      enables cloud sync via Settings. Until then the registry holds
//      NoOp and no network calls are made.
//   3. On enable: load token from localStorage. If absent, this adapter
//      stays `isOnline() = false` and registerAnon must be called by
//      the UI as a separate explicit step.
//
// Design rule: the adapter is a thin HTTP client. No business logic
// here — that's in the worker. The adapter only knows how to speak
// the API, not what the answers mean.

import type {
  BackendAdapter,
  AnonUser,
  UserProfile,
  GameSubmit,
  GameSubmitResult,
  MatchLeaderboardEntry,
  ProvinceLeaderboardEntry,
  RatingLeaderboardEntry,
  BotCharacter,
  BadgeDef,
  UserBadge,
  CertView,
  JourneyView,
  TournamentInfo,
  ExhibitionSummary,
  ExhibitionGame,
  SeasonInfo,
  SeasonSummary,
  SeasonDetail,
  ActivitySignals,
  PopulationStats,
} from './types';

/** Resolve the API base URL. Lookup order:
 *    1. localStorage `openmakruk_api_base` — test/dev overrides.
 *       Useful so an E2E suite can point the browser app at a
 *       wrangler dev port without rebuilding Vite.
 *    2. Vite's VITE_API_BASE env (baked in at build time).
 *    3. Dev fallback — the default that matches the worker's
 *       `wrangler dev` port. Constructed at runtime (not as a
 *       module-level constant) so the literal doesn't leak into
 *       production bundles where dev mode is impossible. */
function resolveApiBase(): string {
  try {
    if (typeof window !== 'undefined') {
      const fromStorage = window.localStorage?.getItem('openmakruk_api_base');
      if (fromStorage) return fromStorage.replace(/\/$/, '');
    }
  } catch {
    // ignore storage errors (private mode, etc.)
  }
  let isProd = false;
  try {
    const env = (import.meta as unknown as { env?: { VITE_API_BASE?: string; PROD?: boolean } }).env;
    isProd = env?.PROD === true;
    const fromEnv = env?.VITE_API_BASE ?? null;
    if (fromEnv) return fromEnv.replace(/\/$/, '');
  } catch {
    // not a Vite context — fall through
  }
  // Dev fallback gated behind import.meta.env.DEV — Vite statically
  // replaces THIS EXACT identifier pattern with the literal boolean
  // before bundling, so the whole `if` block is dead-code-eliminated
  // in production. Aliasing or optional chaining defeats the static
  // replacement, so don't touch the form below. Verified via
  // deploy-check (it greps the built bundle for the literal).
  if ((import.meta as { env: { DEV: boolean } }).env.DEV) {
    return 'http://localhost:8788';
  }
  if (isProd) {
    // No env override + production bundle = misconfiguration. Returning
    // an empty string makes every request fail loudly (URL parse error)
    // instead of silently calling some unrelated host.
    return '';
  }
  return '';
}

export type CloudflareBackendOpts = {
  apiBase?: string;
};

export class CloudflareBackend implements BackendAdapter {
  readonly id = 'cloudflare';
  readonly name = 'Cloudflare Workers + D1';

  private readonly apiBase: string;
  /** Cached token (set by setToken on enable). Used by isOnline() so we
   *  can report offline before the user has a session. */
  private currentToken: string | null = null;

  constructor(opts: CloudflareBackendOpts = {}) {
    this.apiBase = (opts.apiBase ?? resolveApiBase()).replace(/\/$/, '');
  }

  /** Inform the adapter which token to consider active. Pass null on
   *  sign-out / token rotation. Adapter does NOT persist this — that's
   *  the caller's job (see auth.ts client-side). */
  setToken(token: string | null): void {
    this.currentToken = token;
  }

  isOnline(): boolean {
    // We treat "configured + token present" as online. A network probe
    // would be more accurate but adds latency to every isOnline() call;
    // the cloud-feature UI tolerates eventual offline (failed fetch
    // surfaces as a toast in the caller).
    return Boolean(this.apiBase) && Boolean(this.currentToken);
  }

  // ─── auth / profile ────────────────────────────────────────────────

  async registerAnon(
    opts: { displayName?: string; province?: string | null } = {},
  ): Promise<AnonUser> {
    const body: Record<string, unknown> = {};
    if (opts.displayName) body.displayName = opts.displayName;
    if (opts.province !== undefined) body.province = opts.province;
    const res = await this.request('/api/users/anon', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return (await res.json()) as AnonUser;
  }

  async getProfile(token: string): Promise<UserProfile | null> {
    const res = await this.request('/api/users/me', { token, allow401: true });
    if (res.status === 401) return null;
    return (await res.json()) as UserProfile;
  }

  async updateProfile(
    token: string,
    changes: { displayName?: string; province?: string | null },
  ): Promise<UserProfile> {
    const res = await this.request('/api/users/me', {
      method: 'PATCH',
      token,
      body: JSON.stringify(changes),
    });
    return (await res.json()) as UserProfile;
  }

  /** "Sign out everywhere" — server rotates token_hash so every device
   *  holding the old token starts getting 401. The new plaintext token
   *  is returned ONCE; caller must persist it. Rating, history, badges
   *  are untouched. */
  async rotateToken(token: string): Promise<{ id: string; token: string; rotatedAt: number }> {
    const res = await this.request('/api/users/me/rotate', {
      method: 'POST',
      token,
    });
    return (await res.json()) as { id: string; token: string; rotatedAt: number };
  }

  /** Permanent account deletion. Wipes the user row + every per-user
   *  record (games, badges, puzzle solves, golf, leaderboard cache,
   *  season winner snapshots). Irreversible. */
  async deleteAccount(token: string): Promise<{ ok: boolean; id: string; deletedAt: number }> {
    const res = await this.request('/api/users/me', {
      method: 'DELETE',
      token,
    });
    return (await res.json()) as { ok: boolean; id: string; deletedAt: number };
  }

  // ─── games ────────────────────────────────────────────────────────

  async recordGame(token: string, game: GameSubmit): Promise<GameSubmitResult> {
    const res = await this.request('/api/games', {
      method: 'POST',
      token,
      body: JSON.stringify(game),
    });
    return (await res.json()) as GameSubmitResult;
  }

  async deleteGame(token: string, id: string): Promise<{ ok: boolean; deleted: boolean }> {
    const res = await this.request(`/api/games/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token,
    });
    return (await res.json()) as { ok: boolean; deleted: boolean };
  }

  async fetchGameHistory(
    token: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ) {
    const q = new URLSearchParams();
    if (opts.limit) q.set('limit', String(opts.limit));
    if (opts.cursor) q.set('cursor', opts.cursor);
    const path = `/api/games${q.toString() ? `?${q}` : ''}`;
    const res = await this.request(path, { token });
    return (await res.json()) as {
      games: Array<GameSubmit & {
        id: string;
        ratingBefore: number;
        ratingAfter: number;
        ratingDelta: number;
        createdAt: number;
        verified: boolean;
      }>;
      nextCursor: string | null;
    };
  }

  async postGolfAttempt(token: string, puzzleId: string, moves: string[]) {
    const res = await this.request(
      `/api/puzzles/${encodeURIComponent(puzzleId)}/golf`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ moves }),
      },
    );
    return (await res.json()) as {
      ok: true;
      plyCount: number;
      personalBest: number;
      globalBest: number;
      isPersonalBest: boolean;
      isGlobalBest: boolean;
    };
  }

  async postPuzzle(
    token: string,
    puzzle: {
      fen: string;
      category: string;
      solution: string[];
      toMove: 'white' | 'black';
      rating?: number;
      prompt?: string;
      themes?: string[];
    },
  ): Promise<{ id: string; verified: boolean }> {
    const res = await this.request('/api/puzzles', {
      method: 'POST',
      token,
      body: JSON.stringify(puzzle),
    });
    const body = (await res.json()) as { id: string; status?: string; verified?: boolean };
    return { id: body.id, verified: Boolean(body.verified) };
  }

  // ─── leaderboards ─────────────────────────────────────────────────

  async fetchMatchLeaderboard(
    opts: { limit?: number; province?: string; region?: string } = {},
  ): Promise<MatchLeaderboardEntry[]> {
    const q = new URLSearchParams();
    q.set('limit', String(opts.limit ?? 100));
    if (opts.province) q.set('province', opts.province);
    if (opts.region) q.set('region', opts.region);
    const res = await this.request(`/api/leaderboard/match?${q}`);
    const body = (await res.json()) as { entries: MatchLeaderboardEntry[] };
    return body.entries;
  }

  async fetchProvinceLeaderboard(): Promise<ProvinceLeaderboardEntry[]> {
    const res = await this.request('/api/leaderboard/match/by-province');
    const body = (await res.json()) as { entries: ProvinceLeaderboardEntry[] };
    return body.entries;
  }

  async fetchRatingLeaderboard(
    opts: {
      limit?: number;
      province?: string;
      region?: string;
      include?: 'mixed' | 'humans' | 'bots';
    } = {},
  ): Promise<RatingLeaderboardEntry[]> {
    const q = new URLSearchParams();
    q.set('limit', String(opts.limit ?? 100));
    if (opts.province) q.set('province', opts.province);
    if (opts.region) q.set('region', opts.region);
    if (opts.include) q.set('include', opts.include);
    const res = await this.request(`/api/leaderboard/rating?${q}`);
    const body = (await res.json()) as { entries: RatingLeaderboardEntry[] };
    return body.entries;
  }

  async fetchBots(): Promise<BotCharacter[]> {
    const res = await this.request('/api/bots');
    const body = (await res.json()) as { bots: BotCharacter[] };
    return body.bots;
  }

  async fetchBot(id: string): Promise<BotCharacter | null> {
    try {
      const res = await this.request(`/api/bots/${encodeURIComponent(id)}`, { allow401: true });
      if (res.status === 404 || res.status === 400) return null;
      return (await res.json()) as BotCharacter;
    } catch (err) {
      if (err instanceof BackendError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
  }

  // ─── Badges ─────────────────────────────────────────────────────

  async fetchBadgeCatalog(): Promise<BadgeDef[]> {
    const res = await this.request('/api/badges');
    const body = (await res.json()) as { badges: BadgeDef[] };
    return body.badges;
  }

  async fetchMyBadges(token: string): Promise<UserBadge[]> {
    const res = await this.request('/api/badges/me', { token });
    const body = (await res.json()) as { badges: UserBadge[] };
    return body.badges;
  }

  async evaluateMyBadges(token: string): Promise<string[]> {
    const res = await this.request('/api/badges/me/evaluate', { method: 'POST', token });
    const body = (await res.json()) as { newBadges: string[] };
    return body.newBadges;
  }

  async fetchJourney(token: string): Promise<JourneyView> {
    const res = await this.request('/api/journey/me', { token });
    return (await res.json()) as JourneyView;
  }

  async fetchTournaments(): Promise<TournamentInfo[]> {
    const res = await this.request('/api/tournaments');
    const body = (await res.json()) as { tournaments: TournamentInfo[] };
    return body.tournaments;
  }

  async fetchSignals(): Promise<ActivitySignals> {
    const res = await this.request('/api/signals');
    return (await res.json()) as ActivitySignals;
  }

  async fetchStats(): Promise<PopulationStats> {
    const res = await this.request('/api/stats');
    return (await res.json()) as PopulationStats;
  }

  async submitFeedback(
    body: {
      message: string;
      contact?: string;
      kind: 'bug' | 'feature' | 'praise' | 'other';
      buildSha?: string;
      locale?: string;
    },
    token?: string,
  ): Promise<{ ok: boolean; id: string; receivedAt: number }> {
    const res = await this.request('/api/feedback', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ok: boolean; id: string; receivedAt: number };
  }

  async fetchExhibitionRecent(): Promise<ExhibitionSummary[]> {
    const res = await this.request('/api/exhibition/recent');
    const body = (await res.json()) as { games: ExhibitionSummary[] };
    return body.games;
  }

  async fetchExhibitionGame(id: string): Promise<ExhibitionGame | null> {
    try {
      const res = await this.request(
        `/api/exhibition/${encodeURIComponent(id)}`,
        { allow401: true },
      );
      if (res.status === 404) return null;
      return (await res.json()) as ExhibitionGame;
    } catch (err) {
      if (err instanceof BackendError && err.status === 404) return null;
      throw err;
    }
  }

  async fetchActiveSeason(): Promise<SeasonInfo> {
    const res = await this.request('/api/seasons/active');
    const body = (await res.json()) as { season: SeasonInfo };
    return body.season;
  }

  async fetchClosedSeasons(): Promise<SeasonSummary[]> {
    const res = await this.request('/api/seasons');
    const body = (await res.json()) as { seasons: SeasonSummary[] };
    return body.seasons;
  }

  async fetchSeasonWinners(id: string): Promise<SeasonDetail | null> {
    try {
      const res = await this.request(
        `/api/seasons/${encodeURIComponent(id)}`,
        { allow401: true },
      );
      if (res.status === 404) return null;
      return (await res.json()) as SeasonDetail;
    } catch (err) {
      if (err instanceof BackendError && err.status === 404) return null;
      throw err;
    }
  }

  async fetchCert(slug: string): Promise<CertView | null> {
    try {
      const res = await this.request(`/api/cert/${encodeURIComponent(slug)}`, { allow401: true });
      if (res.status === 404 || res.status === 400) return null;
      return (await res.json()) as CertView;
    } catch (err) {
      if (err instanceof BackendError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
  }

  // ─── puzzles ─────────────────────────────────────────────────────

  async fetchPuzzles(opts: {
    source?: 'curated' | 'user-mined' | 'auto-mined';
    category?: string;
    cursor?: string | null;
  } = {}) {
    const q = new URLSearchParams();
    if (opts.source) q.set('source', opts.source);
    if (opts.category) q.set('category', opts.category);
    if (opts.cursor) q.set('cursor', opts.cursor);
    const path = `/api/puzzles${q.toString() ? `?${q}` : ''}`;
    const res = await this.request(path);
    return (await res.json()) as {
      puzzles: Array<{
        id: string;
        category: string;
        fen: string;
        solution: string[];
        toMove: 'white' | 'black';
        rating: number;
        prompt?: string;
        themes?: string[];
        source?: string;
      }>;
      nextCursor: string | null;
    };
  }

  // ─── internals ────────────────────────────────────────────────────

  /** Common request wrapper: builds the URL, injects bearer token,
   *  throws on non-2xx unless `allow401` is set (used by getProfile).
   *
   *  Returns the raw Response so the caller can decide whether to
   *  call .json(), .text(), or branch on status. */
  private async request(
    path: string,
    opts: {
      method?: string;
      token?: string;
      body?: string;
      allow401?: boolean;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    const res = await fetch(`${this.apiBase}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body,
    });
    if (!res.ok && !(opts.allow401 && res.status === 401)) {
      const detail = await safeReadBody(res);
      throw new BackendError(res.status, detail, path);
    }
    return res;
  }
}

export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly path: string,
  ) {
    super(`backend ${status} on ${path}: ${body}`);
    this.name = 'BackendError';
  }
}

async function safeReadBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/** Singleton — only ONE instance per app. Created at module load with
 *  the resolved API base; token is attached later via setToken(). */
export const cloudflareBackend = new CloudflareBackend();
