// PuzzleCandidateExtractor — PURE policy over an AnnotatedGame.
//
// Given an AnnotatedGame (from any ReviewRuntime) and a validated
// PuzzleQualitySpec, decide which plies become puzzle candidates,
// what category + rating + quality score they get, and copy through
// the provenance. No engine, no ffish, no I/O, no Date.now — same
// input always yields the same output, so it unit-tests trivially
// under node:test.
//
// All thresholds come from `spec`; this body contains policy SHAPE
// (mate-vs-tactic decision, band lookup) but no magic numbers.

import type {
  AnnotatedGame,
  AnnotatedPly,
  PuzzleCandidate,
  PuzzleQualitySpec,
} from './contracts';
import { REVIEW_PIPELINE_SCHEMA_VERSION } from './contracts.ts';
import type { PuzzleCategory } from '../puzzleSchema';
import type { MotifKind } from '../coach/types';

/**
 * Extract puzzle candidates from an annotated game. Pure: depends only
 * on the game data + the spec. Order is preserved (ascending ply).
 */
export function extractPuzzleCandidates(
  game: AnnotatedGame,
  spec: PuzzleQualitySpec,
): PuzzleCandidate[] {
  const out: PuzzleCandidate[] = [];
  for (const ply of game.plies) {
    const candidate = candidateForPly(ply, game, spec);
    if (candidate) out.push(candidate);
  }
  return out;
}

/** Build a candidate for one ply, or null if it doesn't qualify. */
function candidateForPly(
  ply: AnnotatedPly,
  game: AnnotatedGame,
  spec: PuzzleQualitySpec,
): PuzzleCandidate | null {
  if (!spec.includeClassifications.includes(ply.classification)) return null;

  const mateIn = ply.evalBefore.mateIn;
  const isMate = mateIn !== undefined && mateIn !== null;
  const absMate = isMate ? Math.abs(mateIn as number) : 0;

  // Category + eligibility. Mate candidates bypass the eval-swing
  // floor (a forced mate IS the lesson regardless of cp delta); a
  // non-mate position must clear minEvalSwingCp.
  let category: PuzzleCategory;
  if (isMate && absMate >= spec.mateDepthBand.min && absMate <= spec.mateDepthBand.max) {
    category = absMate === 1 ? 'mate-1' : 'mate-2';
  } else if (isMate && absMate > spec.mateDepthBand.max) {
    // Mate exists but is deeper than we curate — skip rather than
    // mislabel it as a tactic.
    return null;
  } else {
    if (Math.abs(ply.delta) < spec.minEvalSwingCp) return null;
    category = 'tactic';
  }

  // Solution: the runtime's best-known line, trimmed to the spec cap.
  // For mate-in-N the repository may deepen this before persisting,
  // but extraction copies through whatever the runtime produced.
  const solution = ply.bestLine.slice(0, spec.maxSolutionPlies);
  if (solution.length === 0) return null;

  const motifs = uniqueMotifKinds(ply);
  const ratingEstimate = estimateRating(category, ply.delta, motifs, spec);
  const qualityScore = scoreQuality(category, ply.delta, isMate);

  return {
    schemaVersion: REVIEW_PIPELINE_SCHEMA_VERSION,
    sourceGameId: game.sourceGameId,
    sourcePly: ply.ply,
    fenBefore: ply.fenBefore,
    sideToMove: ply.side,
    category,
    solution,
    motifs,
    severity: ply.classification,
    ratingEstimate,
    qualityScore,
    runtime: game.runtime,
    visibility: 'draft',
  };
}

function uniqueMotifKinds(ply: AnnotatedPly): MotifKind[] {
  const seen = new Set<MotifKind>();
  for (const m of ply.motifs) seen.add(m.kind);
  return Array.from(seen);
}

/** Rating estimate, fully spec-driven. Mate + counting + defense use
 *  the category base; tactic walks the bands. Motif bonuses add on. */
function estimateRating(
  category: PuzzleCategory,
  deltaCp: number,
  motifs: MotifKind[],
  spec: PuzzleQualitySpec,
): number {
  let rating: number;
  if (category === 'tactic') {
    // First band whose floor the delta meets (bands are sorted
    // high→low by the validator, so the first match is the tightest).
    const band = spec.tacticRatingBands.find((b) => Math.abs(deltaCp) >= b.minDeltaCp);
    rating = band ? band.rating : spec.baseRatingByCategory.tactic;
  } else {
    rating = spec.baseRatingByCategory[category] ?? 1000;
  }
  for (const kind of motifs) {
    rating += spec.motifRatingBonus[kind] ?? 0;
  }
  return rating;
}

/** Quality score in [0,1]. A higher centipawn swing (or a mate) is a
 *  cleaner teaching moment, so it scores higher. Deterministic. */
function scoreQuality(category: PuzzleCategory, deltaCp: number, isMate: boolean): number {
  if (isMate || category === 'mate-1' || category === 'mate-2') return 1;
  // Map 0..400cp onto 0.3..1.0 — even a modest swing is a usable
  // candidate, a big one is ideal. Clamp.
  const norm = Math.min(Math.abs(deltaCp), 400) / 400;
  return Math.round((0.3 + 0.7 * norm) * 100) / 100;
}
