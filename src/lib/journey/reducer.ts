// Journey reducer (issue #7) — the pure engine that folds every
// training surface's ProgressInput into one JourneyState.
//
// Design notes:
//  • PURE: (state, input) => state'. No I/O, no Date.now (the caller
//    stamps `at` on inputs and `updatedAt` from the input). Same
//    inputs in any order → same state. Runs under node:test.
//  • IDEMPOTENT: every mutating path is gated on an evidence id-set or
//    a delta-replacement, so re-emitting an event (cloud-sync replay,
//    startup backfill) never double-counts. This is a hard contract
//    requirement (see JourneyEvidence comments).
//  • mastery is DERIVED, never mutated in place:
//      mastery[c] = clamp01(practiceScore[c] + Σ reviewContributions[*][c])
//    practiceScore grows monotonically (gated by the id-sets);
//    reviewContributions are replaceable per gameId. Deriving mastery
//    fresh after each input avoids any subtract-after-clamp hazard.
//
// The reducer needs the checkpoint set to decide what's cleared, but
// the contract's JourneyReducer signature is (state, input) => state.
// So we expose `createJourneyReducer(checkpoints)` and bind the real
// set in store.ts; tests pass fixture checkpoints.

import type {
  Checkpoint,
  CheckpointRequirement,
  Concept,
  JourneyEvidence,
  JourneyReducer,
  JourneyState,
  MasteryScore,
  ProgressInput,
} from './contract';
import { conceptForCoachMotif } from './contract.ts';

// ── tuning constants (all in mastery [0,1] units) ──────────────────
const LESSON_BUMP = 0.25; // first completion of a lesson teaching a concept
const PUZZLE_BUMP_OPTIMAL = 0.12; // first solve, no hint / first try
const PUZZLE_BUMP = 0.06; // first solve with a hint / retries
const DRILL_BUMP_PER_STAR = 0.08; // × stars, applied on improvement
/** Practice alone saturates below 1 so review evidence still has room
 *  to push a concept to mastery. */
const PRACTICE_CAP = 0.8;
/** A single game's review contribution per concept is capped so one
 *  lucky game can't max a concept. */
const REVIEW_PER_GAME_CAP = 0.4;
const REVIEW_PER_MOTIF = 0.08; // × motif count, before the per-game cap

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// ── small immutable helpers ────────────────────────────────────────

function addToSet(arr: string[] | undefined, id: string): { next: string[]; added: boolean } {
  const cur = arr ?? [];
  if (cur.includes(id)) return { next: cur, added: false };
  return { next: [...cur, id], added: true };
}

function bumpPractice(
  practice: Partial<Record<Concept, MasteryScore>>,
  concepts: Concept[] | undefined,
  amount: number,
): Partial<Record<Concept, MasteryScore>> {
  if (!concepts || concepts.length === 0 || amount === 0) return practice;
  const next = { ...practice };
  for (const c of concepts) {
    next[c] = Math.min(PRACTICE_CAP, (next[c] ?? 0) + amount);
  }
  return next;
}

/** Per-concept contribution a single review game makes, derived from
 *  raw coach-motif totals. Pure + bounded by REVIEW_PER_GAME_CAP. */
function reviewContribution(
  motifTotals: Record<string, number>,
): Partial<Record<Concept, MasteryScore>> {
  const out: Partial<Record<Concept, MasteryScore>> = {};
  for (const [motif, count] of Object.entries(motifTotals)) {
    const concept = conceptForCoachMotif(motif);
    if (!concept || !Number.isFinite(count) || count <= 0) continue;
    const add = Math.min(REVIEW_PER_GAME_CAP, count * REVIEW_PER_MOTIF);
    out[concept] = Math.min(REVIEW_PER_GAME_CAP, (out[concept] ?? 0) + add);
  }
  return out;
}

/** Derive state.mastery as a pure projection of the evidence. */
function deriveMastery(evidence: JourneyEvidence): Partial<Record<Concept, MasteryScore>> {
  const totals: Partial<Record<Concept, number>> = { ...(evidence.practiceScore ?? {}) };
  const reviews = evidence.reviewContributionsByGameId ?? {};
  for (const contrib of Object.values(reviews)) {
    for (const [c, v] of Object.entries(contrib) as [Concept, number][]) {
      totals[c] = (totals[c] ?? 0) + v;
    }
  }
  const mastery: Partial<Record<Concept, MasteryScore>> = {};
  for (const [c, v] of Object.entries(totals) as [Concept, number][]) {
    mastery[c] = clamp01(v);
  }
  return mastery;
}

// ── requirement evaluation (pure, reads state only) ────────────────

function requirementMet(state: JourneyState, req: CheckpointRequirement): boolean {
  const ev = state.evidence;
  switch (req.kind) {
    case 'lesson-completed':
      return (ev.completedLessons ?? []).includes(req.lessonId);
    case 'puzzle-solved':
      return (ev.solvedPuzzles ?? []).includes(req.puzzleId);
    case 'puzzle-category-solved':
      return (ev.puzzleCountsByCategory?.[req.category] ?? 0) >= req.count;
    case 'drill-passed': {
      const best = ev.drillBestStars?.[req.drillId] ?? 0;
      return best >= (req.minStars ?? 1);
    }
    case 'concept-mastered':
      return (state.mastery[req.concept] ?? 0) >= req.minScore;
    case 'games-played': {
      const rated = ev.gamesPlayedRated ?? 0;
      const casual = ev.gamesPlayedCasual ?? 0;
      const count = req.rated ? rated : rated + casual;
      return count >= req.minCount;
    }
    case 'rating-reached':
      return (ev.rating ?? 0) >= req.minRating;
    case 'challenge-completed':
      return req.code
        ? (ev.completedChallenges ?? []).includes(req.code)
        : (ev.completedChallenges ?? []).length > 0;
    default: {
      // Exhaustiveness guard — a new requirement kind must be handled.
      const _never: never = req;
      return Boolean(_never);
    }
  }
}

function checkpointCleared(state: JourneyState, cp: Checkpoint): boolean {
  return cp.requirements.every((r) => requirementMet(state, r));
}

/** Re-evaluate every checkpoint and add newly-cleared ids. Clearing is
 *  monotonic — a checkpoint never un-clears (matches "you earned it"
 *  semantics + keeps replay stable). */
function recomputeCleared(state: JourneyState, checkpoints: readonly Checkpoint[]): string[] {
  const cleared = new Set(state.cleared);
  for (const cp of checkpoints) {
    if (!cleared.has(cp.id) && checkpointCleared(state, cp)) cleared.add(cp.id);
  }
  // Preserve insertion order: existing first (display = "recently
  // unlocked" appends), then any newly added in checkpoint order.
  if (cleared.size === state.cleared.length) return state.cleared;
  const added = checkpoints.map((c) => c.id).filter((id) => cleared.has(id) && !state.cleared.includes(id));
  return [...state.cleared, ...added];
}

// ── the reducer ────────────────────────────────────────────────────

/**
 * Build a reducer bound to a checkpoint set. The returned function is
 * the pure JourneyReducer the contract specifies.
 */
export function createJourneyReducer(checkpoints: readonly Checkpoint[]): JourneyReducer {
  return (state: JourneyState, input: ProgressInput): JourneyState => {
    const ev = state.evidence;
    // Assigned by every non-returning switch branch below.
    let evidence: JourneyEvidence;

    switch (input.kind) {
      case 'lesson-completed': {
        const { next, added } = addToSet(ev.completedLessons, input.lessonId);
        if (!added) return touch(state, input.at); // already counted
        evidence = {
          ...ev,
          completedLessons: next,
          practiceScore: bumpPractice(ev.practiceScore ?? {}, input.concepts, LESSON_BUMP),
        };
        break;
      }
      case 'puzzle-solved': {
        const { next, added } = addToSet(ev.solvedPuzzles, input.puzzleId);
        if (!added) return touch(state, input.at);
        const counts = { ...(ev.puzzleCountsByCategory ?? {}) };
        counts[input.category] = (counts[input.category] ?? 0) + 1;
        evidence = {
          ...ev,
          solvedPuzzles: next,
          puzzleCountsByCategory: counts,
          practiceScore: bumpPractice(
            ev.practiceScore ?? {},
            input.concepts,
            input.optimal ? PUZZLE_BUMP_OPTIMAL : PUZZLE_BUMP,
          ),
        };
        break;
      }
      case 'drill-passed': {
        const prevStars = ev.drillBestStars?.[input.drillId] ?? 0;
        if (input.stars <= prevStars) return touch(state, input.at); // no improvement
        const improvement = input.stars - prevStars;
        evidence = {
          ...ev,
          drillBestStars: { ...(ev.drillBestStars ?? {}), [input.drillId]: input.stars },
          practiceScore: bumpPractice(
            ev.practiceScore ?? {},
            input.concepts,
            DRILL_BUMP_PER_STAR * improvement,
          ),
        };
        break;
      }
      case 'review-summary': {
        // Replace this game's contribution (idempotent on replay).
        const contrib = reviewContribution(input.motifTotals);
        const prev = ev.reviewContributionsByGameId?.[input.gameId];
        // Skip the write if the contribution is unchanged — keeps
        // replay a true no-op (stable updatedAt + identity).
        if (prev && sameContribution(prev, contrib)) return touch(state, input.at);
        evidence = {
          ...ev,
          reviewContributionsByGameId: {
            ...(ev.reviewContributionsByGameId ?? {}),
            [input.gameId]: contrib,
          },
        };
        break;
      }
      case 'game-recorded': {
        const { next, added } = addToSet(ev.recordedGameIds, input.gameId);
        if (!added) return touch(state, input.at); // already counted
        evidence = {
          ...ev,
          recordedGameIds: next,
          gamesPlayedRated:
            (ev.gamesPlayedRated ?? 0) + (input.mode === 'rated' ? 1 : 0),
          gamesPlayedCasual:
            (ev.gamesPlayedCasual ?? 0) + (input.mode === 'casual' ? 1 : 0),
        };
        break;
      }
      case 'challenge-completed': {
        const { next, added } = addToSet(ev.completedChallenges, input.code);
        if (!added) return touch(state, input.at);
        evidence = { ...ev, completedChallenges: next };
        break;
      }
      case 'rating-changed': {
        if (ev.rating === input.rating) return touch(state, input.at);
        evidence = { ...ev, rating: input.rating };
        break;
      }
      default: {
        const _never: never = input;
        return _never;
      }
    }

    const withMastery: JourneyState = {
      ...state,
      evidence,
      mastery: deriveMastery(evidence),
      updatedAt: input.at,
    };
    return {
      ...withMastery,
      cleared: recomputeCleared(withMastery, checkpoints),
    };
  };
}

/** A no-op input still advances updatedAt (so sync picks the latest
 *  copy) but changes nothing else. */
function touch(state: JourneyState, at: number): JourneyState {
  if (at <= state.updatedAt) return state;
  return { ...state, updatedAt: at };
}

function sameContribution(
  a: Partial<Record<Concept, MasteryScore>>,
  b: Partial<Record<Concept, MasteryScore>>,
): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k as Concept] !== b[k as Concept]) return false;
  }
  return true;
}
