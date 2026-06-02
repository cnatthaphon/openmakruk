// Review → puzzle promotion pipeline — versioned contracts (issue #19).
//
// The pipeline turns a reviewed game into verified puzzle candidates
// through swappable, schema-driven boundaries:
//
//   GameLog
//     → ReviewRuntime.analyze(...)         (impure: engine-backed)
//     → AnnotatedGame
//     → extractPuzzleCandidates(..., spec) (PURE: policy only)
//     → PuzzleCandidate[]
//     → PuzzleRepository.promote(...)      (impure: verify + persist)
//     → Draft/Private/Public puzzle record
//
// Why contracts before wiring: the UI must never import a concrete
// analysis runtime or hardcode puzzle thresholds. Swapping the
// browser Fairy-Stockfish runtime for a Worker endpoint or a future
// AlphaZero engine must not touch UI or extraction code — only a new
// ReviewRuntime implementation. Extraction policy lives in a
// data-driven PuzzleQualitySpec, not in React components.
//
// Every cross-module import here is `import type` so this file (and
// the pure extractor/spec that depend on it) carry ZERO runtime
// dependencies — they run under `node --test --experimental-strip-types`
// without pulling ffish / chessground / engine code.

import type { AnnotatedMove, Classification } from '../review';
import type { CoachMotif, MotifKind } from '../coach/types';
import type { PuzzleCategory } from '../puzzleSchema';

/** Bumped only when a persisted shape (AnnotatedGame / PuzzleCandidate /
 *  PuzzleQualitySpec) changes incompatibly. Additive optional fields
 *  do NOT require a bump. */
export const REVIEW_PIPELINE_SCHEMA_VERSION = 1 as const;

// ── Inputs ──────────────────────────────────────────────────────────

/** Recorded game input. Compatible with both the local
 *  `GameRecord` (src/lib/stats.ts) and a future server game record —
 *  `sourceGameId` is the canonical clientGameId shared across local
 *  stats, the worker `games` row, and (now) the review pipeline. */
export type GameLog = {
  sourceGameId: string;
  /** UCI move sequence from the start position. */
  moves: string[];
  /** Start FEN. Omit for the standard Makruk opening. */
  startFen?: string;
  userSide?: 'white' | 'black' | null;
  /** ffish result string ('1-0' / '0-1' / '1/2-1/2' / '*'). */
  result?: string;
};

// ── Runtime metadata (provenance) ───────────────────────────────────

/** Which runtime + engine produced an AnnotatedGame. Travels onto
 *  every PuzzleCandidate so a promoted puzzle records exactly how its
 *  analysis was generated — essential when multiple runtimes
 *  (browser WASM, Worker, AlphaZero) coexist. */
export type RuntimeMeta = {
  /** Runtime implementation id — 'client' today; 'worker' / 'mcts'
   *  later. Distinct from engineId: one runtime can host many engines. */
  runtimeId: string;
  /** Engine id from the engine registry, e.g. 'fairy-stockfish'. */
  engineId: string;
  engineVersion?: string;
  /** Search depth the analysis targeted (best-effort). */
  depth?: number;
  /** Node budget, when the engine is node-bounded (MCTS). */
  nodes?: number;
  /** Makruk rules version the analysis ran against — so a future
   *  rules change can invalidate stale candidates. */
  rulesVersion: string;
};

// ── Annotated game (review output) ──────────────────────────────────

/** One analysed ply. Extends the existing client review shape
 *  (`AnnotatedMove`) with the two things candidate extraction needs
 *  that a plain review doesn't carry:
 *    - `motifs`: coach motifs of the BEST move (the teaching line),
 *      attached by the runtime (rules-level detection, no engine).
 *    - `bestLine`: the runtime's best continuation from `fenBefore`.
 *      At minimum `[bestMove]`; the repository may deepen it during
 *      promotion for multi-move (mate-in-N) puzzles. */
export type AnnotatedPly = AnnotatedMove & {
  motifs: CoachMotif[];
  bestLine: string[];
};

export type AnnotatedGame = {
  schemaVersion: typeof REVIEW_PIPELINE_SCHEMA_VERSION;
  sourceGameId: string;
  userSide: 'white' | 'black' | null;
  result: string;
  plies: AnnotatedPly[];
  runtime: RuntimeMeta;
};

// ── Puzzle candidate (extractor output) ─────────────────────────────

export type PuzzleVisibility = 'draft' | 'private' | 'public';

/** A position the extractor judged worth promoting. Carries full
 *  provenance + runtime metadata + schema version + visibility from
 *  the first implementation (issue #19 acceptance criteria).
 *
 *  `solution` is the runtime's best-known line at extraction time —
 *  for mate-in-1 and single-move tactics it is already complete; for
 *  mate-in-N the repository deepens + re-verifies it during promote.
 *  `qualityScore` (0..1) and `ratingEstimate` are spec-derived, so
 *  retuning thresholds is a config edit, never a code change. */
export type PuzzleCandidate = {
  schemaVersion: typeof REVIEW_PIPELINE_SCHEMA_VERSION;
  sourceGameId: string;
  sourcePly: number;
  fenBefore: string;
  sideToMove: 'white' | 'black';
  category: PuzzleCategory;
  solution: string[];
  motifs: MotifKind[];
  /** Classification that made this a candidate (mistake / blunder / …). */
  severity: Classification;
  ratingEstimate: number;
  qualityScore: number;
  runtime: RuntimeMeta;
  visibility: PuzzleVisibility;
  /** Optional pre-built Thai prompt seed; repository may override. */
  promptSeed?: string;
};

// ── Quality spec (extraction policy, data-driven) ───────────────────

/** Data/config-driven extraction rules. NO threshold lives in a React
 *  component or the extractor body — they all come from here, so the
 *  spec can be tuned, A/B'd, or loaded from JSON without code edits.
 *  Always run through `validatePuzzleQualitySpec` before use. */
export type PuzzleQualitySpec = {
  schemaVersion: number;
  /** Which move classifications are eligible to become puzzles. */
  includeClassifications: Classification[];
  /** Minimum centipawn swing (|delta|) for a non-mate candidate. */
  minEvalSwingCp: number;
  /** Accept mate-derived candidates whose |mateIn| falls in this
   *  inclusive band (plies-to-mate measured in moves). */
  mateDepthBand: { min: number; max: number };
  /** Hard cap on solution length the repository will store. */
  maxSolutionPlies: number;
  /** Base rating per category before motif bonuses. */
  baseRatingByCategory: Record<PuzzleCategory, number>;
  /** Additive rating bump when the best move carries a given motif. */
  motifRatingBonus: Partial<Record<MotifKind, number>>;
  /** Tactic rating bands — first band whose `minDeltaCp` is met wins.
   *  Must be sorted high→low `minDeltaCp` by the validator. */
  tacticRatingBands: { minDeltaCp: number; rating: number }[];
};

export type SpecValidation =
  | { ok: true; spec: PuzzleQualitySpec }
  | { ok: false; errors: string[] };

// ── Swappable boundaries ────────────────────────────────────────────

export type ReviewRuntimeCapabilities = {
  /** Reports mate scores (mateIn) in its evals. */
  mate: boolean;
  /** Can produce multiple principal variations. */
  multiPv: boolean;
  rulesVersion: string;
};

/** The analysis boundary the UI depends on. Concrete implementations
 *  (ClientReviewRuntime today; a Worker/AlphaZero runtime later) are
 *  resolved through the registry — the UI never imports them. */
export interface ReviewRuntime {
  readonly id: string;
  readonly engineId: string;
  readonly capabilities: ReviewRuntimeCapabilities;
  analyze(
    log: GameLog,
    onProgress?: (done: number, total: number) => void,
  ): Promise<AnnotatedGame>;
}

export type PromoteResult =
  | { ok: true; id: string; visibility: PuzzleVisibility }
  | { ok: false; reason: string };

/** The persistence boundary. `LocalPuzzleRepository` writes to the
 *  user puzzle store today; a server repository can implement the same
 *  interface later without touching callers. */
export interface PuzzleRepository {
  promote(
    candidate: PuzzleCandidate,
    opts?: { authorName?: string; visibility?: PuzzleVisibility },
  ): Promise<PromoteResult>;
}
