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
  province: string | null;
  isBot: boolean;
  score: number;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  lastActiveAt: number;
};

/** Province-rollup entry for the macro "ภาคเหนือ vs ภาคกลาง" view. */
export type ProvinceLeaderboardEntry = {
  rank: number;
  province: string;
  score: number;
  playerCount: number;
  gamesPlayed: number;
};

/** Badge catalog entry. Mirrors worker/src/badges.ts BadgeDef. */
export type BadgeDef = {
  id: string;
  category: 'rating' | 'puzzles' | 'streak' | 'bot-conqueror' | 'region';
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';
  icon: string;
  nameTh: string;
  descTh: string;
  threshold: number;
};

/** A badge the current user has unlocked. */
export type UserBadge = {
  badgeId: string;
  unlockedAt: number;
  shareableSlug: string;
  def: BadgeDef | null;
};

/** Public cert page payload — no auth required to fetch. */
export type CertView = {
  badge: BadgeDef;
  displayName: string;
  province: string | null;
  unlockedAt: number;
};

/** Tournament window — recurring (e.g. Sunday Showdown) or one-off. */
export type TournamentInfo = {
  id: string;
  nameTh: string;
  descTh: string;
  icon: string;
  multiplier: number;
  active: boolean;
  activeUntil: number | null;
  upcomingStartsAt: number | null;
  upcomingEndsAt: number | null;
};

/** One row in the public exhibition feed — meta only, no moves array. */
export type ExhibitionSummary = {
  id: string;
  whiteBotId: string;
  blackBotId: string;
  whiteName: string | null;
  blackName: string | null;
  whiteAvatar: string | null;
  blackAvatar: string | null;
  /** Tier comes from users.bot_tier directly — exposed in the API so
   *  the client can filter without parsing bot-id slugs. 'boss' is
   *  the special case for Fairy-Stockfish; rookie/veteran/master for
   *  personality tiers; null only if the bot row predates Phase 4. */
  whiteTier: string | null;
  blackTier: string | null;
  outcome: 'white-wins' | 'black-wins' | 'draw' | 'truncated' | string;
  plyCount: number;
  finalFen: string;
  createdAt: number;
};

/** Full exhibition game — what /api/exhibition/:id returns. */
export type ExhibitionGame = ExhibitionSummary & {
  moves: string[];
};

/** Active season — what /api/seasons/active returns. */
export type SeasonInfo = {
  id: string;
  label: string;
  startsAt: number;
  endsAt: number;
};

/** Closed season summary — list view shape. */
export type SeasonSummary = SeasonInfo & {
  closedAt: number | null;
};

export type SeasonWinner = {
  scope: string; // 'global' | 'region:<id>' | 'province:<code>'
  rank: number;
  userId: string;
  displayName: string;
  rating: number;
};

export type SeasonDetail = SeasonSummary & {
  winners: SeasonWinner[];
};

/** Real engagement signals — every number comes from a DB count. */
export type ActivitySignals = {
  gamesToday: number;
  puzzlesToday: number;
  lastGame: { at: number; displayName: string } | null;
  lastPuzzle: { at: number; displayName: string } | null;
};

/** Population-level stats for the public /#/stats page. Shape mirrors
 *  the worker's /api/stats payload — humans only, region rollup derived
 *  from province at query time. */
export type PopulationStats = {
  generatedAt: string;
  onlineWindowMinutes: number;
  population: {
    total: number;
    online: number;
    undeclared: { total: number; online: number };
  };
  byRegion: Array<{
    region: 'north' | 'northeast' | 'central' | 'east' | 'west' | 'south';
    label: string;
    total: number;
    online: number;
  }>;
  topProvinces: Array<{
    code: string;
    nameTh: string;
    region: string;
    total: number;
    online: number;
  }>;
  families: {
    outcome: {
      avgRating: number;
      topRating: number;
      totalGames: number;
      wins: number;
      losses: number;
      draws: number;
    };
    quality: { note: string };
    speed: { topGamesPlayed: number; note: string };
  };
};

/** Server-computed journey state for the authenticated user. Each
 *  checkpoint carries its own progress numbers so the UI can render
 *  a progress bar without re-running the logic locally. */
export type JourneyView = {
  currentLevel: 'beginner' | 'apprentice' | 'player' | 'veteran' | 'champion' | 'master';
  currentNameTh: string;
  currentIcon: string;
  nextLevel: string | null;
  nextNameTh: string | null;
  nextIcon: string | null;
  nextRatingFloor: number | null;
  checkpoints: Array<{
    id: string;
    kind: string;
    value: string;
    labelTh: string;
    complete: boolean;
    doneCount: number;
    neededCount: number;
  }>;
  levelLadder: Array<{ id: string; nameTh: string; icon: string; ratingFloor: number }>;
  rating: number;
};

/** Bot character profile + denormalized stats from games vs humans. */
export type BotCharacter = {
  id: string;
  displayName: string;
  rating: number;
  personality: string;
  tier: 'rookie' | 'veteran' | 'master';
  lore: string;
  avatar: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
};

/** Rating-leaderboard row — mixes humans + bots, sorted by users.rating. */
export type RatingLeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  province: string | null;
  isBot: boolean;
  rating: number;
  lastSeenAt: number;
};

/** Anonymous user account returned by registerAnon. `token` is the
 *  bearer credential — caller MUST persist it locally to keep the
 *  account beyond the current session (server cannot reissue it). */
export type AnonUser = {
  id: string;
  displayName: string;
  token: string;
  rating: number;
  province: string | null;
  region: string | null;
  createdAt: number;
};

/** Profile fetched via getProfile (no token in the response — the
 *  token never leaves the client after registration). */
export type UserProfile = {
  id: string;
  displayName: string;
  rating: number;
  province: string | null;
  region: string | null;
  createdAt: number;
  lastSeenAt: number;
};

/** Game-record submission. Server computes Elo update. */
export type GameSubmit = {
  /**
   * Caller-supplied id. The worker uses it verbatim as the row's
   * primary key (validated against `^[A-Za-z0-9_-]{1,64}$`). Sending
   * the same id twice is idempotent — the server returns the
   * existing row's rating result without re-applying Elo.
   *
   * Optional only to keep older callers compiling; production code
   * MUST set this so local and server agree on identity for
   * sync / delete / review joins.
   */
  clientGameId?: string;
  /** Canonical opponent id — e.g. 'medium', 'bot:attacker-master',
   *  'personality:hunter'. Stored verbatim. */
  opponent: string;
  /** Optional explicit Elo bucket for non-Difficulty opponents (bots
   *  / personality engines). When the opponent IS a Difficulty the
   *  server can derive this; for bot games the client must send it. */
  ratingBucket?: 'easy' | 'medium' | 'hard' | 'master';
  /** Optional human-readable display label (e.g. 'ผู้พิชิต Master').
   *  Echoed back on history reads so the receiving device can render
   *  the bot's nickname without round-tripping the bot registry. */
  opponentLabel?: string;
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
  /** Badge ids the server unlocked as a side-effect of this game.
   *  Empty array when nothing new triggered. */
  newBadges?: string[];
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
  registerAnon?(opts?: { displayName?: string; province?: string | null }): Promise<AnonUser>;

  /** Resolve an existing token to its profile. Returns null if the
   *  token is invalid / unknown (caller should re-register). */
  getProfile?(token: string): Promise<UserProfile | null>;

  /** Update mutable profile fields (displayName, province). */
  updateProfile?(
    token: string,
    changes: { displayName?: string; province?: string | null },
  ): Promise<UserProfile>;

  /** "Sign out everywhere" — rotate the server-side token_hash so all
   *  other devices holding the previous token start getting 401. The
   *  new plaintext token is returned ONCE. */
  rotateToken?(token: string): Promise<{ id: string; token: string; rotatedAt: number }>;

  /** Permanent account erase. Wipes user row + per-user records. */
  deleteAccount?(token: string): Promise<{ ok: boolean; id: string; deletedAt: number }>;

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

  /** Delete one of the caller's own games by id. The route is
   *  idempotent on the server: deleting a missing id returns
   *  `{ ok: true, deleted: false }` so the client can retry after a
   *  partial-failure without the second call surfacing an error. */
  deleteGame?(token: string, id: string): Promise<{ ok: boolean; deleted: boolean }>;

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

  /** Global match leaderboard — weighted by CPU difficulty. Optional
   *  province/region filters narrow the scope. Only one of the two
   *  filters takes effect; province wins if both are supplied. */
  fetchMatchLeaderboard?(opts?: {
    limit?: number;
    province?: string;
    region?: string;
  }): Promise<MatchLeaderboardEntry[]>;

  /** Province-vs-province summary (rank by aggregate score). */
  fetchProvinceLeaderboard?(): Promise<ProvinceLeaderboardEntry[]>;

  /** Rating leaderboard — humans + bots mixed by users.rating column.
   *  Supports the same province/region filters as match LB plus an
   *  `include` filter ('mixed' | 'humans' | 'bots'). */
  fetchRatingLeaderboard?(opts?: {
    limit?: number;
    province?: string;
    region?: string;
    include?: 'mixed' | 'humans' | 'bots';
  }): Promise<RatingLeaderboardEntry[]>;

  /** Bot Hall of Fame — every bot character with their lore + stats. */
  fetchBots?(): Promise<BotCharacter[]>;

  /** Single bot by id (e.g. 'bot:attacker-master'). */
  fetchBot?(id: string): Promise<BotCharacter | null>;

  // ----- Badges (Phase 9H-3) ---------------------------------------

  /** Public badge catalog. Cached aggressively by the browser. */
  fetchBadgeCatalog?(): Promise<BadgeDef[]>;

  /** The current user's unlocked badges, newest first. */
  fetchMyBadges?(token: string): Promise<UserBadge[]>;

  /** Force-re-evaluate (rare; used after solving a puzzle to surface
   *  the just-earned badge without waiting for the next game). */
  evaluateMyBadges?(token: string): Promise<string[]>;

  /** Public cert page lookup. No auth required. */
  fetchCert?(slug: string): Promise<CertView | null>;

  // ----- Journey (Phase 9H-4) --------------------------------------

  /** The user's level + next-level checkpoints. Cheap aggregate read. */
  fetchJourney?(token: string): Promise<JourneyView>;

  // ----- Tournaments + activity signals (Phase 9H-6/7) -------------

  /** Active + upcoming tournament windows. */
  fetchTournaments?(): Promise<TournamentInfo[]>;
  fetchExhibitionRecent?(): Promise<ExhibitionSummary[]>;
  fetchExhibitionGame?(id: string): Promise<ExhibitionGame | null>;
  fetchActiveSeason?(): Promise<SeasonInfo>;
  fetchClosedSeasons?(): Promise<SeasonSummary[]>;
  fetchSeasonWinners?(id: string): Promise<SeasonDetail | null>;

  /** Honest engagement signals — games/puzzles played today + last
   *  player display name. All from real DB counts, no fakes. */
  fetchSignals?(): Promise<ActivitySignals>;

  /** Population-level stats for the public /#/stats page. */
  fetchStats?(): Promise<PopulationStats>;

  /** Submit beta feedback. Auth is optional — anonymous OK. */
  submitFeedback?(
    body: {
      message: string;
      contact?: string;
      kind: 'bug' | 'feature' | 'praise' | 'other';
      buildSha?: string;
      locale?: string;
    },
    token?: string,
  ): Promise<{ ok: boolean; id: string; receivedAt: number }>;

  /** Report a client-side crash. Fire-and-forget; the caller never
   *  awaits this on a hot path. Sent anonymously (no token) — crash
   *  telemetry carries no identity. NoOpBackend omits it (no-op). */
  reportError?(body: {
    scope?: string;
    message: string;
    stack?: string;
    componentStack?: string;
    buildSha?: string;
    locale?: string;
    urlPath?: string;
  }): Promise<void>;

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
