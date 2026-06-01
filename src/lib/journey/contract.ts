// Journey / learning-path contract.
//
// Issue #7 — every training surface (lessons, puzzles, drills,
// review) should contribute to one progress model. Today each
// surface has its own progress store:
//   • learnProgress.ts   — completed lesson ids
//   • puzzleProgress.ts  — solved puzzle ids
//   • reviewMastery.ts   — per-game review summaries + motif totals
//   • conceptMastery.ts  — motif counts derived from game annotations
//   • countingDrill.ts   — drill scores
//
// They don't share a feed. There's no place a future journey-page
// can ask "which checkpoint should this player work on next?"
// without hard-coding which store to read.
//
// This module defines the SHAPE of that feed (the contract), not
// its implementation. The contract is intentionally additive —
// existing stores keep working unchanged. A follow-up PR will
// write a `feed.ts` that subscribes to each store and emits
// `ProgressInput` events into a single reducer.

/** Schema version. Bump when the persisted JourneyState shape
 *  changes in a way migration code needs to handle. */
export const JOURNEY_SCHEMA_VERSION = 1;

/** Stable content identifiers. The values must match the IDs used
 *  by their owning store — we type the union loosely as `string`
 *  because we don't want a journey-contract change to force every
 *  content file to recompile. The owning store remains the source
 *  of truth for the ID. */
export type LessonId = string;
export type PuzzleId = string;
export type DrillId = string;
export type ChallengeCode = string;

/** Skill / concept taxonomy. Motifs we already detect in review
 *  (`src/lib/coach/types.ts CoachMotif`) are normalized to this
 *  enum so journey progress can talk about them without quoting
 *  raw strings throughout the codebase. The mapping from existing
 *  coach motif kinds lives in `COACH_MOTIF_TO_CONCEPT` below. */
export type Concept =
  | 'piece-movement'
  | 'capture-trade'
  | 'check-detection'
  | 'mate-recognition'
  | 'mate-threat-awareness'
  | 'tactical-pin'
  | 'tactical-fork'
  | 'tactical-skewer'
  | 'tactical-discovered'
  | 'tactical-double-attack'
  | 'tactical-hanging-piece'
  | 'endgame-counting'
  | 'endgame-bare-king'
  | 'endgame-promotion'
  | 'opening-development'
  | 'opening-center-control';

/** Mapping from existing coach-motif kinds (the runtime emits these
 *  from review.ts) to canonical Concept ids. Codex review on PR #14:
 *  without this mapping, the review-summary input loses every motif
 *  that doesn't already match a Concept name. The reducer reads this
 *  table when consuming `kind: 'review-summary'` events. Adding a
 *  new coach motif = one line here, no schema bump. */
export const COACH_MOTIF_TO_CONCEPT: Readonly<Record<string, Concept>> = {
  capture:        'capture-trade',
  check:          'check-detection',
  mate:           'mate-recognition',
  mateThreat:     'mate-threat-awareness',
  fork:           'tactical-fork',
  hangingTarget:  'tactical-hanging-piece',
  develop:        'opening-development',
  promotion:      'endgame-promotion',
};

/** Mastery score for a single concept, 0..1. Conceptually:
 *    0.00 — not introduced
 *    0.25 — encountered once
 *    0.50 — applied correctly in a non-trivial situation
 *    0.75 — applied correctly across multiple instances
 *    1.00 — consistent + recent successful application
 *  How the score is computed from the contributing inputs is the
 *  reducer's business; the contract just says scores live in [0, 1]. */
export type MasteryScore = number;

/** Star rating from a drill clear: 1 = passed, 2 = good, 3 = optimal.
 *  Aligns with the trainer scoreboard in countingDrill.ts. */
export type DrillStars = 1 | 2 | 3;

/** A checkpoint is a milestone in the journey: a labeled goal the
 *  player can be working toward. Checkpoints reference content
 *  IDs + concept thresholds, NOT specific UI tabs — that way the
 *  same checkpoint can be displayed on Profile, Journey, or a
 *  future Path view without rewrite. */
export type Checkpoint = {
  /** Stable id (e.g. 'cp-basic-pieces', 'cp-mate-in-1'). Persist
   *  this; never rename. */
  id: string;
  /** Localized title for display. */
  title: string;
  /** Short subtitle / objective in player language. */
  subtitle?: string;
  /** Requirements that must ALL be satisfied to clear the checkpoint.
   *  Order is meaningful for display only — the reducer doesn't care. */
  requirements: CheckpointRequirement[];
  /** Optional follow-up checkpoint id. The journey is a DAG, not a
   *  linked list — a checkpoint can have multiple successors via
   *  the reverse `prerequisites` field on the successors. */
  unlocks?: string[];
  /** Concept tags for the player-facing "what does this teach?"
   *  label. Doesn't affect the reducer. */
  tags?: Concept[];
};

/** One requirement clause. Discriminated union — each kind has its
 *  own shape so the reducer can pattern-match exhaustively.
 *
 *  Codex review on PR #14: the `drill-passed` requirement and the
 *  `drill-passed` input MUST share a comparison unit. Both use
 *  stars (DrillStars) — the previous mismatch (`minScore: number`
 *  in the requirement but `stars` in the input) meant the reducer
 *  couldn't evaluate the requirement at all. */
export type CheckpointRequirement =
  | { kind: 'lesson-completed'; lessonId: LessonId }
  | { kind: 'puzzle-solved'; puzzleId: PuzzleId }
  | { kind: 'puzzle-category-solved'; category: string; count: number }
  | { kind: 'drill-passed'; drillId: DrillId; minStars?: DrillStars }
  | { kind: 'concept-mastered'; concept: Concept; minScore: MasteryScore }
  | { kind: 'games-played'; minCount: number; rated?: boolean }
  | { kind: 'rating-reached'; minRating: number }
  | { kind: 'challenge-completed'; code?: ChallengeCode };

/** Evidence the reducer needs to evaluate combined-requirement
 *  checkpoints purely from JourneyState (no re-fetching events).
 *
 *  Codex review on PR #14: the previous JourneyState only carried
 *  cleared-checkpoint ids and a sparse mastery map, so a requirement
 *  like "solved 5 mate-in-1 puzzles" couldn't be answered from
 *  state alone. The evidence section keeps the minimum set of
 *  raw counters / id sets a pure reducer would need.
 *
 *  Every field is OPTIONAL on read (missing → "not yet recorded")
 *  so the schema can grow additively without bumping
 *  JOURNEY_SCHEMA_VERSION. */
export type JourneyEvidence = {
  /** Lesson ids the player has completed at least once. Stored as
   *  array (not Set) so it serialises to JSON cleanly. The reducer
   *  treats it as a set: duplicate completions don't compound. */
  completedLessons?: LessonId[];
  /** Puzzle ids the player has solved at least once. */
  solvedPuzzles?: PuzzleId[];
  /** Per-category puzzle-solved counts (e.g. { 'mate-1': 5, ... }).
   *  Lets `puzzle-category-solved` requirements be evaluated without
   *  walking the full solvedPuzzles list. */
  puzzleCountsByCategory?: Record<string, number>;
  /** Best star result per drill id. Lets `drill-passed { minStars }`
   *  be evaluated; reducer keeps the MAX over re-attempts. */
  drillBestStars?: Record<DrillId, DrillStars>;
  /** Challenge codes the player has completed (any outcome). */
  completedChallenges?: ChallengeCode[];
  /** Lifetime games-played counters split by rated/casual. Either
   *  one of `gamesPlayedRated`/`gamesPlayedCasual` may be missing
   *  on older journeys. */
  gamesPlayedRated?: number;
  gamesPlayedCasual?: number;
  /** Ids of game-recorded events the reducer has already counted.
   *  Required so a re-emission of the same game (cloud sync replay,
   *  startup backfill from stats.history) does NOT double-increment
   *  gamesPlayedRated/Casual. Without this ledger, games-played
   *  checkpoints would unlock on duplicate events rather than real
   *  games (PR #14 review: Codex flagged the missing stable id).
   *
   *  Growth: one entry per game-recorded event. The same id appears
   *  at most once. Implementations MAY clamp to a sliding window
   *  (e.g. most recent 1000 ids) IF they also stop incrementing
   *  counters for evicted ids — never lose the counter-id pairing.
   *  In practice 99th-percentile users finish < 5000 games, so a
   *  flat array stays small. */
  recordedGameIds?: string[];
  /** Latest known rating. The rating-changed input simply overwrites
   *  this; the reducer does no smoothing. */
  rating?: number;
};

/** Versioned aggregate state for the journey. A consumer reads this
 *  and decides what to render (next-checkpoint card, mastery chart,
 *  unlocked-rewards list). Persistence layer is responsible for
 *  migrating between versions; the schema version travels with the
 *  data so a stale local copy is detectable. */
export type JourneyState = {
  v: typeof JOURNEY_SCHEMA_VERSION;
  /** Checkpoint ids the player has cleared. Order is insertion-time
   *  for display ("recently unlocked"); the reducer never depends on
   *  order. */
  cleared: string[];
  /** Per-concept mastery scores. Keys are Concept identifiers; missing
   *  keys default to 0. */
  mastery: Partial<Record<Concept, MasteryScore>>;
  /** Explicit evidence the reducer keeps for combined-requirement
   *  evaluation. See JourneyEvidence for the per-field rationale. */
  evidence: JourneyEvidence;
  /** When the journey state was last touched. Used by sync logic to
   *  pick the freshest copy when local + cloud disagree. */
  updatedAt: number;
};

/** A single contribution to journey progress, emitted by whichever
 *  store actually owns the underlying event. The reducer is pure:
 *  `(state, input) → state'`. Multiple inputs may be batched in any
 *  order without changing the resulting state. */
export type ProgressInput =
  | {
      kind: 'lesson-completed';
      lessonId: LessonId;
      at: number;
      /** Concepts this lesson introduces. The reducer bumps each
       *  concept's mastery by a small increment on first completion. */
      concepts?: Concept[];
    }
  | {
      kind: 'puzzle-solved';
      puzzleId: PuzzleId;
      /** Category id from the puzzle's content row (mate-1, defense,
       *  counting, etc.). Lets the reducer maintain
       *  evidence.puzzleCountsByCategory without re-loading content. */
      category: string;
      at: number;
      /** Did the player solve on the first attempt without a hint? */
      optimal: boolean;
      /** Motifs the puzzle exercises, derived from puzzle metadata. */
      concepts?: Concept[];
    }
  | {
      kind: 'drill-passed';
      drillId: DrillId;
      at: number;
      stars: DrillStars;
      concepts?: Concept[];
    }
  | {
      kind: 'review-summary';
      gameId: string;
      at: number;
      /** Raw motif totals from the post-game review pipeline. Keys
       *  are CoachMotif `kind` strings (capture / check / mate /
       *  mateThreat / fork / hangingTarget / develop / promotion).
       *  The reducer translates each key through
       *  COACH_MOTIF_TO_CONCEPT before bumping
       *  state.mastery, so adding a new motif is a one-line table
       *  edit, not a contract change. */
      motifTotals: Record<string, number>;
    }
  | {
      kind: 'challenge-completed';
      code: ChallengeCode;
      at: number;
      outcome: 'win' | 'draw' | 'loss';
    }
  | {
      kind: 'game-recorded';
      /**
       * Stable game id (matches GameRecord.id from src/lib/stats.ts,
       * which is the canonical clientGameId shared with the cloud
       * backend — see PR #22 for the identity contract).
       *
       * Required so the reducer can DEDUPE: this event is the only
       * source for `evidence.gamesPlayedRated` + `gamesPlayedCasual`,
       * and the future feed will re-emit history on startup and on
       * each cloud sync. Without an id, a duplicate emission would
       * inflate the counters and unlock games-played checkpoints on
       * games the user never actually played twice.
       *
       * Reducer implementations MUST treat a `game-recorded` event
       * whose id is already counted (see `evidence.recordedGameIds`)
       * as a no-op.
       */
      gameId: string;
      at: number;
      mode: 'rated' | 'casual';
      outcome: 'win' | 'draw' | 'loss';
    }
  | {
      kind: 'rating-changed';
      at: number;
      rating: number;
    };

/** Reducer contract. Implementations live elsewhere; this is the
 *  signature consumers depend on. The reducer must be pure — no
 *  side effects, no I/O. Persistence is the caller's responsibility. */
export type JourneyReducer = (
  state: JourneyState,
  input: ProgressInput,
) => JourneyState;

/** Helper: an empty journey state. Useful for first-time users and
 *  for tests. */
export function emptyJourney(now: number = Date.now()): JourneyState {
  return {
    v: JOURNEY_SCHEMA_VERSION,
    cleared: [],
    mastery: {},
    evidence: {},
    updatedAt: now,
  };
}

/** Helper: extract the concept score safely. Missing concepts read
 *  as 0 rather than `undefined`. */
export function masteryFor(state: JourneyState, concept: Concept): MasteryScore {
  return state.mastery[concept] ?? 0;
}

/** Helper: did the player clear this checkpoint? */
export function isCheckpointCleared(state: JourneyState, id: string): boolean {
  return state.cleared.includes(id);
}

/** Helper: translate a coach-motif kind into a Concept. Returns null
 *  for unknown motifs so the reducer can decide whether to ignore
 *  silently or log. */
export function conceptForCoachMotif(motifKind: string): Concept | null {
  return COACH_MOTIF_TO_CONCEPT[motifKind] ?? null;
}
