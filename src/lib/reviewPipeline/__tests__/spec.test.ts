// Pure unit tests for PuzzleQualitySpec validation. Run under
// `node --test --experimental-strip-types` via `npm run test:core`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PUZZLE_QUALITY_SPEC,
  validatePuzzleQualitySpec,
} from '../spec.ts';

describe('validatePuzzleQualitySpec', () => {
  it('accepts the shipped default spec', () => {
    const res = validatePuzzleQualitySpec(DEFAULT_PUZZLE_QUALITY_SPEC);
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.spec, DEFAULT_PUZZLE_QUALITY_SPEC);
  });

  it('rejects a non-object', () => {
    assert.equal(validatePuzzleQualitySpec(null).ok, false);
    assert.equal(validatePuzzleQualitySpec(42).ok, false);
  });

  it('rejects an empty includeClassifications', () => {
    const res = validatePuzzleQualitySpec({
      ...DEFAULT_PUZZLE_QUALITY_SPEC,
      includeClassifications: [],
    });
    assert.equal(res.ok, false);
  });

  it('rejects an unknown classification', () => {
    const res = validatePuzzleQualitySpec({
      ...DEFAULT_PUZZLE_QUALITY_SPEC,
      includeClassifications: ['inaccuracy', 'wonky'],
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.ok(res.errors.some((e) => e.includes('wonky')));
  });

  it('rejects a negative minEvalSwingCp', () => {
    const res = validatePuzzleQualitySpec({
      ...DEFAULT_PUZZLE_QUALITY_SPEC,
      minEvalSwingCp: -10,
    });
    assert.equal(res.ok, false);
  });

  it('rejects mateDepthBand with max < min', () => {
    const res = validatePuzzleQualitySpec({
      ...DEFAULT_PUZZLE_QUALITY_SPEC,
      mateDepthBand: { min: 3, max: 1 },
    });
    assert.equal(res.ok, false);
  });

  it('rejects a non-integer maxSolutionPlies', () => {
    const res = validatePuzzleQualitySpec({
      ...DEFAULT_PUZZLE_QUALITY_SPEC,
      maxSolutionPlies: 2.5,
    });
    assert.equal(res.ok, false);
  });

  it('rejects tacticRatingBands not sorted high→low', () => {
    const res = validatePuzzleQualitySpec({
      ...DEFAULT_PUZZLE_QUALITY_SPEC,
      tacticRatingBands: [
        { minDeltaCp: 0, rating: 1300 },
        { minDeltaCp: 300, rating: 700 },
      ],
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.ok(res.errors.some((e) => e.includes('sorted')));
  });

  it('rejects tacticRatingBands without a 0-floor band', () => {
    const res = validatePuzzleQualitySpec({
      ...DEFAULT_PUZZLE_QUALITY_SPEC,
      tacticRatingBands: [
        { minDeltaCp: 300, rating: 700 },
        { minDeltaCp: 100, rating: 1000 },
      ],
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.ok(res.errors.some((e) => e.includes('floor')));
  });

  it('rejects an unknown category in baseRatingByCategory', () => {
    const res = validatePuzzleQualitySpec({
      ...DEFAULT_PUZZLE_QUALITY_SPEC,
      baseRatingByCategory: {
        ...DEFAULT_PUZZLE_QUALITY_SPEC.baseRatingByCategory,
        'mate-9': 999,
      },
    });
    assert.equal(res.ok, false);
  });
});
