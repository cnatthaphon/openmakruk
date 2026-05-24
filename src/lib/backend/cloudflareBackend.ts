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
} from './types';

const DEV_API_BASE = 'http://localhost:8788';

/** Resolve the API base URL. Lookup order:
 *    1. localStorage `openmakruk_api_base` — test/dev overrides.
 *       Useful so an E2E suite can point the browser app at a
 *       wrangler dev port without rebuilding Vite.
 *    2. Vite's VITE_API_BASE env (baked in at build time).
 *    3. DEV_API_BASE — the default that matches the worker's
 *       development port. */
function resolveApiBase(): string {
  try {
    if (typeof window !== 'undefined') {
      const fromStorage = window.localStorage?.getItem('openmakruk_api_base');
      if (fromStorage) return fromStorage.replace(/\/$/, '');
    }
  } catch {
    // ignore storage errors (private mode, etc.)
  }
  try {
    const env = (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env;
    const fromEnv = env?.VITE_API_BASE ?? null;
    if (fromEnv) return fromEnv.replace(/\/$/, '');
  } catch {
    // not a Vite context — fall through
  }
  return DEV_API_BASE;
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

  async registerAnon(displayName?: string): Promise<AnonUser> {
    const res = await this.request('/api/users/anon', {
      method: 'POST',
      body: JSON.stringify(displayName ? { displayName } : {}),
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
    changes: { displayName: string },
  ): Promise<UserProfile> {
    const res = await this.request('/api/users/me', {
      method: 'PATCH',
      token,
      body: JSON.stringify(changes),
    });
    return (await res.json()) as UserProfile;
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

  // ─── leaderboards ─────────────────────────────────────────────────

  async fetchMatchLeaderboard(limit = 100): Promise<MatchLeaderboardEntry[]> {
    const res = await this.request(`/api/leaderboard/match?limit=${limit}`);
    const body = (await res.json()) as { entries: MatchLeaderboardEntry[] };
    return body.entries;
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
