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
  /**
   * Reconcile local stats against the server's copy. Caller hands in
   * the freshly-loaded local stats; receives the merged result they
   * should now persist. Implementations are responsible for not
   * losing user data — when in doubt, prefer the higher rating /
   * larger history.
   */
  syncStats?(local: UserStats): Promise<StatsSyncResult>;

  // ----- Leaderboards ------------------------------------------------
  /**
   * Fetch the top N entries for a puzzle category. `null` category
   * means the overall puzzle leaderboard.
   */
  fetchLeaderboard?(
    category: PuzzleCategory | null,
    limit?: number,
  ): Promise<LeaderboardEntry[]>;

  // ----- User-submitted content --------------------------------------
  /** Submit a puzzle the user crafted. Returns the server-assigned id. */
  submitPuzzle?(draft: PuzzleDraft): Promise<string>;

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
