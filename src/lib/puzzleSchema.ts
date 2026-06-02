// Data schema for puzzles served from /content/puzzles/all.json.
//
// One Puzzle = a starting FEN + a forced sequence of correct moves
// (alternating user / opponent in UCI form). The player presents the
// user's first move, validates, plays the canned opponent reply,
// repeats until the user has played every odd-indexed move correctly.
//
// Adding a puzzle = appending a JSON entry. No code change required.

export type PuzzleCategory =
  | 'mate-1'   // single-move mate
  | 'mate-2'   // 2-3 move forced mate
  | 'tactic'   // material gain / positional motif
  | 'counting' // counting-rule (นับศักดิ์) constrained mate
  | 'defense'  // user must defend / escape / block — find the ONLY move that survives
  ;

export type Puzzle = {
  id: string;
  fen: string;                  // starting position
  category: PuzzleCategory;
  rating: number;               // Elo target — used for category ordering
  toMove: 'white' | 'black';    // whose move it is at fen
  solution: string[];           // UCI moves: [user0, opp1, user2, opp3, ...]
  prompt: string;               // "ขาวเดิน — รุกจน 1 ตา"
  hint?: string;                // shown after 2 wrong attempts
  themes: string[];             // ["back-rank", "fork"] etc.
  source?: string;              // attribution if applicable
  /** Explicit user-facing goal in Thai for puzzles where the solution
   * length isn't self-explanatory. e.g. "ชนะตัวภายใน 3 ตา",
   * "ไล่นับให้ทันก่อน count 8". Rendered prominently above the board
   * when set. Falls back to category meta otherwise. */
  goal?: string;
  /** Detailed post-solve explanation — the WHY behind the solution.
   * Shown after the user wins so they walk away with a lesson. */
  explanation?: string;
};

export const PUZZLE_CATEGORY_META: Record<
  PuzzleCategory,
  { title: string; description: string; emoji: string }
> = {
  'mate-1': {
    title: 'รุกจนใน 1 ตา',
    description: 'ฝึกสายตา — หาตาเดียวที่ปิดเกม',
    emoji: '♚',
  },
  'mate-2': {
    title: 'รุกจนใน 2 ตา',
    description: 'รู้จักลำดับ — ขั้นแรกผูก ขั้นสองรุกจน',
    emoji: '♛',
  },
  tactic: {
    title: 'ยุทธวิธี (Tactics)',
    description: 'fork, pin, skewer ที่เกิดบ่อยใน Makruk',
    emoji: '⚔️',
  },
  counting: {
    title: 'ปลายเกมนับศักดิ์',
    description: 'ไล่จนทันก่อน count limit',
    emoji: '⏱️',
  },
  defense: {
    title: 'ป้องกัน (หนีให้รอด)',
    description: 'หาตาเดียวที่กันรุก / บล็อก / หนีตาย',
    emoji: '🛡️',
  },
};

export const PUZZLE_CATEGORY_ORDER: PuzzleCategory[] = [
  'mate-1',
  'mate-2',
  'tactic',
  'counting',
  'defense',
];

// ─── User-generated puzzles ───────────────────────────────────────
//
// Same shape as a system puzzle, plus authorship + engine-verification
// metadata. Stored in `openmakruk_user_puzzles` localStorage (not in
// /content/puzzles/all.json). The two pools are MERGED at read time so
// the Puzzles tab shows both side-by-side; the `source` field tells
// the UI which is which (system pool gets a 🌳 badge, user pool gets
// 👤 with author name).
//
// Why a separate store rather than appending to all.json:
//   1. Content version bumps for the curated pool shouldn't churn
//      every user's localStorage.
//   2. User puzzles never sync to the manifest server (they're local
//      until a future Phase 9 backend offers community submission).
//   3. Privacy: a user's drafts stay on their device unless they
//      explicitly share.
//
// `verifiedBy: 'engine'` is a SOFT promise — the verification happens
// at creation time but the engine could have a bug or the user could
// have hand-edited localStorage. Treat user puzzles as best-effort,
// not as authoritative ground truth.

/** Provenance stamped on a puzzle promoted through the review→puzzle
 *  pipeline (issue #19). Additive + optional — hand-authored puzzles
 *  from the Custom tab simply omit it. Kept structural (no import from
 *  reviewPipeline) so this low-level schema stays dependency-free and
 *  there's no module cycle. */
export type ReviewPuzzleProvenance = {
  /** Canonical source game id (GameRecord.id) the position came from. */
  sourceGameId: string;
  /** Ply within that game. */
  sourcePly: number;
  /** Which runtime + engine produced the analysis. */
  runtime: {
    runtimeId: string;
    engineId: string;
    engineVersion?: string;
    depth?: number;
    nodes?: number;
    rulesVersion: string;
  };
  /** Pipeline schema version the candidate was built under. */
  schemaVersion: number;
  visibility: 'draft' | 'private' | 'public';
  qualityScore: number;
  ratingEstimate: number;
  /** Move classification that made the position a candidate. */
  severity: string;
  /** Coach motif kinds detected on the best move. */
  motifs: string[];
};

export type UserPuzzle = Puzzle & {
  /** Always 'user-created' for puzzles in the user store. */
  source: 'user-created';
  /** Display name from stats at creation time. May be blank if the
   *  user didn't set one yet — UI falls back to "ไม่ระบุชื่อ". */
  authorName: string;
  /** When this puzzle was first saved. */
  createdAt: number;
  /** Verification provenance — set to 'engine' after a successful
   *  ffish-validated solution check. */
  verifiedBy: 'engine' | 'unverified';
  /** Engine search depth used to verify (so future re-verification
   *  can decide whether to re-run at higher depth). */
  verifiedAtDepth?: number;
  /** Timestamp of last verification pass. */
  verifiedAt?: number;
  /** Set when the puzzle was promoted from a reviewed game. Absent for
   *  hand-authored Custom-tab puzzles. */
  reviewProvenance?: ReviewPuzzleProvenance;
};

export type UserPuzzleStore = {
  puzzles: UserPuzzle[];
};
