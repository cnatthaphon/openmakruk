// PuzzleQualitySpec — the data-driven extraction policy + its validator.
//
// Everything the extractor uses to decide "is this position a puzzle,
// what category, what rating" lives in a spec value (not in code).
// The default below reproduces the thresholds that were previously
// hardcoded inside puzzleMiner.ts, so behaviour is preserved while the
// knobs become tunable config.
//
// Pure module — only `import type` from contracts (erased at runtime),
// so it runs under `node --test --experimental-strip-types`.

import type { PuzzleQualitySpec, SpecValidation } from './contracts';
import { REVIEW_PIPELINE_SCHEMA_VERSION } from './contracts.ts';

/** Reproduces the legacy puzzleMiner thresholds as data:
 *    - mistakes / blunders / inaccuracies are mine-worthy
 *    - mate within 3 → mate-1/mate-2; else tactic
 *    - tactic rating scales by centipawn loss
 *  Tune here, not in the extractor. */
export const DEFAULT_PUZZLE_QUALITY_SPEC: PuzzleQualitySpec = {
  schemaVersion: REVIEW_PIPELINE_SCHEMA_VERSION,
  includeClassifications: ['inaccuracy', 'mistake', 'blunder'],
  // 50cp = the floor of the 'inaccuracy' band (review.ts classifies
  // 51-150cp as inaccuracy). Keeping the spec floor at/below that means
  // every move the Game Report SHOWS as a key moment is promotable —
  // the classification gate above already does the meaningful
  // selection. Raise this to be stricter than the classifier.
  minEvalSwingCp: 50,
  mateDepthBand: { min: 1, max: 3 },
  maxSolutionPlies: 5,
  baseRatingByCategory: {
    'mate-1': 800,
    'mate-2': 1100,
    tactic: 1000,
    counting: 1100,
    defense: 1200,
  },
  motifRatingBonus: {
    fork: 100,
    hangingTarget: 0,
    mateThreat: 150,
    promotion: 50,
  },
  // First band whose minDeltaCp is satisfied wins (validator enforces
  // high→low ordering). Mirrors puzzleMiner.estimateRating.
  tacticRatingBands: [
    { minDeltaCp: 300, rating: 700 },
    { minDeltaCp: 150, rating: 900 },
    { minDeltaCp: 75, rating: 1100 },
    { minDeltaCp: 0, rating: 1300 },
  ],
};

const VALID_CLASSIFICATIONS = new Set([
  'best',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
]);
const VALID_CATEGORIES = new Set([
  'mate-1',
  'mate-2',
  'tactic',
  'counting',
  'defense',
]);

/**
 * Validate a (possibly JSON-loaded) spec. Returns the spec on success
 * or a list of human-readable errors. Callers MUST validate before
 * passing a spec to the extractor — the extractor assumes a valid
 * spec and does no defensive checking of its own.
 *
 * Checks: required numeric fields are finite and in range,
 * classification + category keys are known, tactic bands are non-empty
 * and sorted high→low by minDeltaCp (so first-match semantics hold).
 */
export function validatePuzzleQualitySpec(raw: unknown): SpecValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['spec must be an object'] };
  }
  const s = raw as Partial<PuzzleQualitySpec>;

  if (
    !Array.isArray(s.includeClassifications) ||
    s.includeClassifications.length === 0
  ) {
    errors.push('includeClassifications must be a non-empty array');
  } else {
    for (const c of s.includeClassifications) {
      if (!VALID_CLASSIFICATIONS.has(c)) {
        errors.push(`unknown classification: ${String(c)}`);
      }
    }
  }

  if (typeof s.minEvalSwingCp !== 'number' || !Number.isFinite(s.minEvalSwingCp) || s.minEvalSwingCp < 0) {
    errors.push('minEvalSwingCp must be a finite number >= 0');
  }

  if (
    !s.mateDepthBand ||
    typeof s.mateDepthBand.min !== 'number' ||
    typeof s.mateDepthBand.max !== 'number' ||
    s.mateDepthBand.min < 1 ||
    s.mateDepthBand.max < s.mateDepthBand.min
  ) {
    errors.push('mateDepthBand must have 1 <= min <= max');
  }

  if (
    typeof s.maxSolutionPlies !== 'number' ||
    !Number.isInteger(s.maxSolutionPlies) ||
    s.maxSolutionPlies < 1
  ) {
    errors.push('maxSolutionPlies must be an integer >= 1');
  }

  if (!s.baseRatingByCategory || typeof s.baseRatingByCategory !== 'object') {
    errors.push('baseRatingByCategory must be an object');
  } else {
    for (const [cat, rating] of Object.entries(s.baseRatingByCategory)) {
      if (!VALID_CATEGORIES.has(cat)) errors.push(`unknown category in baseRatingByCategory: ${cat}`);
      if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0) {
        errors.push(`baseRatingByCategory.${cat} must be a finite number >= 0`);
      }
    }
  }

  if (s.motifRatingBonus !== undefined && (typeof s.motifRatingBonus !== 'object' || s.motifRatingBonus === null)) {
    errors.push('motifRatingBonus must be an object when present');
  }

  if (!Array.isArray(s.tacticRatingBands) || s.tacticRatingBands.length === 0) {
    errors.push('tacticRatingBands must be a non-empty array');
  } else {
    let prev = Infinity;
    for (const band of s.tacticRatingBands) {
      if (
        typeof band?.minDeltaCp !== 'number' ||
        typeof band?.rating !== 'number' ||
        !Number.isFinite(band.minDeltaCp) ||
        !Number.isFinite(band.rating)
      ) {
        errors.push('each tacticRatingBand needs finite minDeltaCp + rating');
        break;
      }
      if (band.minDeltaCp > prev) {
        errors.push('tacticRatingBands must be sorted high→low by minDeltaCp');
        break;
      }
      prev = band.minDeltaCp;
    }
    // A 0-floor band guarantees every tactic gets a rating.
    if (Array.isArray(s.tacticRatingBands) && !s.tacticRatingBands.some((b) => b?.minDeltaCp === 0)) {
      errors.push('tacticRatingBands must include a minDeltaCp:0 floor band');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, spec: s as PuzzleQualitySpec };
}
