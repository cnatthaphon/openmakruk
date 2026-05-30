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
 *  (pin / fork / discovered attack etc.) are normalized to this
 *  enum so journey progress can talk about them without quoting
 *  raw strings throughout the codebase. */
export type Concept =
  | 'piece-movement'
  | 'check-detection'
  | 'mate-recognition'
  | 'tactical-pin'
  | 'tactical-fork'
  | 'tactical-skewer'
  | 'tactical-discovered'
  | 'tactical-double-attack'
  | 'endgame-counting'
  | 'endgame-bare-king'
  | 'opening-development'
  | 'opening-center-control';

/** Mastery score for a single concept, 0..1. Conceptually:
 *    0.00 — not introduced
 *    0.25 — encountered once
 *    0.50 — applied correctly in a non-trivial situation
 *    0.75 — applied correctly across multiple instances
 *    1.00 — consistent + recent successful application
 *  How the score is computed from the contributing inputs is the
 *  reducer's business; the contract just says scores live in [0, 1]. */
export type MasteryScore = number;

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
 *  own shape so the reducer can pattern-match exhaustively. */
export type CheckpointRequirement =
  | { kind: 'lesson-completed'; lessonId: LessonId }
  | { kind: 'puzzle-solved'; puzzleId: PuzzleId }
  | { kind: 'puzzle-category-solved'; category: string; count: number }
  | { kind: 'drill-passed'; drillId: DrillId; minScore?: number }
  | { kind: 'concept-mastered'; concept: Concept; minScore: MasteryScore }
  | { kind: 'games-played'; minCount: number; rated?: boolean }
  | { kind: 'rating-reached'; minRating: number }
  | { kind: 'challenge-completed'; code?: ChallengeCode };

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
      stars: 1 | 2 | 3;
      concepts?: Concept[];
    }
  | {
      kind: 'review-summary';
      gameId: string;
      at: number;
      /** Per-concept counts from the post-game analysis (motif totals,
       *  blunders avoided, mate-recognition wins). */
      conceptDeltas: Partial<Record<Concept, number>>;
    }
  | {
      kind: 'challenge-completed';
      code: ChallengeCode;
      at: number;
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
