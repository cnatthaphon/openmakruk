// Backend adapter contract.
//
// OpenMakruk is pure client-side today: no server, no API calls, all
// state in localStorage. The contract here is FORWARD-LOOKING — it
// pins down the shape of the future server-shaped features so that
// when a backend ships (Phase 9: Cloudflare Workers + D1), it slots
// in as a new module that implements `BackendAdapter`. Callers only
// know the contract; they don't import a concrete backend.
//
// The active adapter is fetched via `getBackend()`. When no real
// backend is registered (the default), `NoOpBackend` returns sane
// "you're offline" responses so all callers can be written the
// same way regardless of whether a backend is wired up.
//
// What goes in the contract (and what does NOT)
// ----------------------------------------------
// IN: features that can plausibly require a server — cloud sync,
//     leaderboards, user-submitted puzzles, multiplayer.
// OUT: features that work fine on-device only (engine search, lesson
//      progress, local stats). Those stay in their existing modules.
//
// This means every PR that wants to introduce a server-dependent
// feature goes through:
//   1. Add method signature here
//   2. NoOpBackend gets a reasonable offline stub
//   3. Caller talks to `getBackend().theMethod(...)` — never to a
//      concrete adapter
//   4. When the real backend ships, it just implements the method
//      and gets registered via `setBackend()`.

import type { UserStats } from '../stats';
import type { PuzzleCategory } from '../puzzleSchema';
import type { Puzzle } from '../puzzleSchema';

/** Sync result for stats reconciliation between local + remote. */
export type StatsSyncResult = {
  /** The merged stats that the local app should now use. */
  merged: UserStats;
  /** Was remote authoritative (i.e. local was stale)? */
  remoteWins: boolean;
};

/** One leaderboard entry. */
export type LeaderboardEntry = {
  rank: number;
  displayName: string;
  rating: number;
  /** Per-category counts of solved puzzles, for puzzles boards. */
  solved?: number;
  /** Server time of last activity for tie-breaking. */
  lastActiveAt: number;
};

/** Match-leaderboard row — weighted by CPU level on the server. */
export type MatchLeaderboardEntry = {
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
};

/** Anonymous user account returned by registerAnon. `token` is the
 *  bearer credential — caller MUST persist it locally to keep the
 *  account beyond the current session (server cannot reissue it). */
export type AnonUser = {
  id: string;
  displayName: string;
  token: string;
  rating: number;
  createdAt: number;
};

/** Profile fetched via getProfile (no token in the response — the
 *  token never leaves the client after registration). */
export type UserProfile = {
  id: string;
  displayName: string;
  rating: number;
  createdAt: number;
  lastSeenAt: number;
};

/** Game-record submission. Server computes Elo update. */
export type GameSubmit = {
  opponent: string;
  userSide: 'white' | 'black';
  outcome: 'win' | 'loss' | 'draw';
  plyCount: number;
  moves?: string[];
  finalFen: string;
  timeControlId?: string | null;
  mode?: 'rated' | 'casual';
};

export type GameSubmitResult = {
  id: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  verified: boolean;
  createdAt: number;
};

/** Draft of a puzzle the user wants to submit for community review. */
export type PuzzleDraft = Omit<
  Puzzle,
  'id' | 'createdAt' | 'rating'
> & {
  /** Free-text rationale shown to reviewers. */
  rationale?: string;
};

/**
 * The contract. Every backend implementation provides this shape.
 * Methods that the implementation does NOT support yet return
 * a structured `{ supported: false }` reply rather than throwing,
 * so the UI can hide the corresponding button gracefully.
 */
export type BackendAdapter = {
  /** Stable identifier for telemetry / about-page display. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /**
   * Cheap synchronous "is this adapter currently usable?" check.
   * Returns false for NoOp, and for real adapters when the device
   * is offline or the user is signed out.
   */
  isOnline(): boolean;

  // ----- User identity / sync ----------------------------------------

  /** Mint a new anonymous account. Returns id + bearer token. Token
   *  is returned ONCE — caller must persist it. */
  registerAnon?(displayName?: string): Promise<AnonUser>;

  /** Resolve an existing token to its profile. Returns null if the
   *  token is invalid / unknown (caller should re-register). */
  getProfile?(token: string): Promise<UserProfile | null>;

  /** Update display name (only mutable field for anon accounts). */
  updateProfile?(token: string, changes: { displayName: string }): Promise<UserProfile>;

  /**
   * Reconcile local stats against the server's copy. Caller hands in
   * the freshly-loaded local stats; receives the merged result they
   * should now persist. Implementations are responsible for not
   * losing user data — when in doubt, prefer the higher rating /
   * larger history.
   */
  syncStats?(local: UserStats): Promise<StatsSyncResult>;

  // ----- Game records ------------------------------------------------

  /** Record a completed game. Server returns the new rating. */
  recordGame?(token: string, game: GameSubmit): Promise<GameSubmitResult>;

  /** Fetch the user's recent games (server-authoritative history). */
  fetchGameHistory?(
    token: string,
    opts?: { limit?: number; cursor?: string | null },
  ): Promise<{
    games: Array<GameSubmit & {
      id: string;
      ratingBefore: number;
      ratingAfter: number;
      ratingDelta: number;
      createdAt: number;
      verified: boolean;
    }>;
    nextCursor: string | null;
  }>;

  // ----- Leaderboards ------------------------------------------------
  /**
   * Fetch the top N entries for a puzzle category. `null` category
   * means the overall puzzle leaderboard.
   */
  fetchLeaderboard?(
    category: PuzzleCategory | null,
    limit?: number,
  ): Promise<LeaderboardEntry[]>;

  /** Global match leaderboard — weighted by CPU difficulty. */
  fetchMatchLeaderboard?(limit?: number): Promise<MatchLeaderboardEntry[]>;

  // ----- Puzzle catalog ---------------------------------------------

  /** Server puzzle list. When `source` omitted, defaults to 'curated'
   *  on the server. The returned shape mirrors the on-disk
   *  /content/puzzles/all.json so existing UI code can render either
   *  source uniformly. */
  fetchPuzzles?(opts?: {
    source?: 'curated' | 'user-mined' | 'auto-mined';
    category?: string;
    cursor?: string | null;
  }): Promise<{
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
  }>;

  // ----- User-submitted content --------------------------------------
  /** Submit a puzzle the user crafted. Returns the server-assigned id. */
  submitPuzzle?(draft: PuzzleDraft): Promise<string>;

  /** Submit a code-golf attempt for a mate puzzle. Server replays the
   *  move sequence; accepts only if it ends in checkmate. Returns the
   *  user's personal best + the global best after this attempt. */
  postGolfAttempt?(
    token: string,
    puzzleId: string,
    moves: string[],
  ): Promise<{
    ok: true;
    plyCount: number;
    personalBest: number;
    globalBest: number;
    isPersonalBest: boolean;
    isGlobalBest: boolean;
  }>;

  /** Submit a puzzle by raw shape (no schema wrapper) — used by the
   *  auto-miner and the user-puzzle author UI when they already have
   *  the canonical fields ready. Returns the server id. */
  postPuzzle?(
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
  ): Promise<{ id: string; verified: boolean }>;

  // ----- Multiplayer (Phase 10+) -------------------------------------
  /** Create a new multiplayer game lobby; returns a join id. */
  createGame?(opts: { timeControlId: string; rated: boolean }): Promise<string>;
  /** Join an existing lobby by id. */
  joinGame?(joinId: string): Promise<void>;
};

/**
 * The no-op adapter — used when no real backend is registered. Every
 * method that returns data resolves to an empty/null result so the UI
 * can fail gracefully ("ดูเซิฟเวอร์ไม่ได้ในตอนนี้") without crashing.
 *
 * isOnline() returns false so callers branching on that hide their
 * cloud-only UI by default.
 */
export const NoOpBackend: BackendAdapter = {
  id: 'no-op',
  name: 'Offline (no backend)',
  isOnline: () => false,
  // The remaining methods are deliberately undefined — callers MUST
  // gate cloud features on `getBackend().syncStats !== undefined`,
  // etc. This is how we keep adding methods without breaking callers
  // that pre-dated the new capability.
};
