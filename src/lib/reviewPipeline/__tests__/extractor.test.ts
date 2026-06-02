// Pure unit tests for the puzzle candidate extractor. No engine, no
// ffish — feeds hand-built AnnotatedGame fixtures through the pure
// policy and asserts category / rating / quality / filtering.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractPuzzleCandidates } from '../extractor.ts';
import { DEFAULT_PUZZLE_QUALITY_SPEC } from '../spec.ts';
import { REVIEW_PIPELINE_SCHEMA_VERSION } from '../contracts.ts';
import type { AnnotatedGame, AnnotatedPly } from '../contracts';
import type { CoachMotif } from '../../coach/types';

const RUNTIME = {
  runtimeId: 'test',
  engineId: 'fairy-stockfish',
  rulesVersion: 'makruk-1',
} as const;

/** Build a minimal AnnotatedPly. FENs are placeholders — the extractor
 *  never parses them. */
function ply(overrides: Partial<AnnotatedPly> = {}): AnnotatedPly {
  return {
    ply: 5,
    uci: 'e3e4',
    side: 'white',
    fenBefore: 'FEN_BEFORE',
    fenAfter: 'FEN_AFTER',
    evalBefore: { scoreCp: 120, depth: 12 },
    evalAfter: { scoreCp: -200, depth: 12 },
    bestMove: 'd3d4',
    delta: 320,
    classification: 'blunder',
    isBest: false,
    motifs: [],
    bestLine: ['d3d4'],
    ...overrides,
  };
}

function game(plies: AnnotatedPly[]): AnnotatedGame {
  return {
    schemaVersion: REVIEW_PIPELINE_SCHEMA_VERSION,
    sourceGameId: 'game_test',
    userSide: 'white',
    result: '0-1',
    plies,
    runtime: RUNTIME,
  };
}

describe('extractPuzzleCandidates', () => {
  it('extracts a tactic from a blunder with a big swing', () => {
    const cands = extractPuzzleCandidates(game([ply()]), DEFAULT_PUZZLE_QUALITY_SPEC);
    assert.equal(cands.length, 1);
    const c = cands[0];
    assert.equal(c.category, 'tactic');
    assert.equal(c.sourcePly, 5);
    assert.equal(c.sideToMove, 'white');
    assert.equal(c.severity, 'blunder');
    assert.deepEqual(c.solution, ['d3d4']);
    assert.equal(c.visibility, 'draft');
    assert.equal(c.schemaVersion, REVIEW_PIPELINE_SCHEMA_VERSION);
    // 320cp swing → first tactic band (>=300) → 700
    assert.equal(c.ratingEstimate, 700);
    // non-mate quality: 0.3 + 0.7 * (320/400) = 0.86
    assert.equal(c.qualityScore, 0.86);
  });

  it('skips a "good"/"best" move (not in includeClassifications)', () => {
    const cands = extractPuzzleCandidates(
      game([ply({ classification: 'good', delta: 5, isBest: true })]),
      DEFAULT_PUZZLE_QUALITY_SPEC,
    );
    assert.equal(cands.length, 0);
  });

  it('skips a tactic below the eval-swing floor', () => {
    // inaccuracy with delta 40 < minEvalSwingCp(50) → filtered
    const cands = extractPuzzleCandidates(
      game([ply({ classification: 'inaccuracy', delta: 40, evalBefore: { scoreCp: 40, depth: 12 } })]),
      DEFAULT_PUZZLE_QUALITY_SPEC,
    );
    assert.equal(cands.length, 0);
  });

  it('classifies a mate-in-1 from evalBefore.mateIn', () => {
    const cands = extractPuzzleCandidates(
      game([ply({ evalBefore: { mateIn: 1, depth: 12 }, delta: 999, bestLine: ['a1a8'] })]),
      DEFAULT_PUZZLE_QUALITY_SPEC,
    );
    assert.equal(cands.length, 1);
    assert.equal(cands[0].category, 'mate-1');
    assert.equal(cands[0].ratingEstimate, 800);
    assert.equal(cands[0].qualityScore, 1);
  });

  it('classifies a mate-in-2 and skips mate deeper than the band', () => {
    const m2 = extractPuzzleCandidates(
      game([ply({ evalBefore: { mateIn: 2, depth: 12 }, bestLine: ['a1a7'] })]),
      DEFAULT_PUZZLE_QUALITY_SPEC,
    );
    assert.equal(m2[0].category, 'mate-2');

    const deep = extractPuzzleCandidates(
      game([ply({ evalBefore: { mateIn: 6, depth: 12 } })]),
      DEFAULT_PUZZLE_QUALITY_SPEC,
    );
    assert.equal(deep.length, 0, 'mate deeper than band is skipped, not mislabeled');
  });

  it('adds a motif rating bonus and surfaces motif kinds', () => {
    const fork: CoachMotif = {
      kind: 'fork',
      attackerSquare: 'e4',
      attackerRole: 'knight',
      targets: [],
    };
    const cands = extractPuzzleCandidates(
      game([ply({ delta: 320, motifs: [fork, fork] })]),
      DEFAULT_PUZZLE_QUALITY_SPEC,
    );
    // 700 base tactic + 100 fork bonus
    assert.equal(cands[0].ratingEstimate, 800);
    // deduped to a single 'fork' kind
    assert.deepEqual(cands[0].motifs, ['fork']);
  });

  it('trims the solution to maxSolutionPlies', () => {
    const longLine = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const cands = extractPuzzleCandidates(
      game([ply({ bestLine: longLine })]),
      DEFAULT_PUZZLE_QUALITY_SPEC,
    );
    assert.equal(cands[0].solution.length, DEFAULT_PUZZLE_QUALITY_SPEC.maxSolutionPlies);
  });

  it('skips a ply whose bestLine is empty (no solution seed)', () => {
    const cands = extractPuzzleCandidates(
      game([ply({ bestLine: [] })]),
      DEFAULT_PUZZLE_QUALITY_SPEC,
    );
    assert.equal(cands.length, 0);
  });

  it('preserves ply order across multiple candidates', () => {
    const cands = extractPuzzleCandidates(
      game([ply({ ply: 3 }), ply({ ply: 7 }), ply({ ply: 11 })]),
      DEFAULT_PUZZLE_QUALITY_SPEC,
    );
    assert.deepEqual(cands.map((c) => c.sourcePly), [3, 7, 11]);
  });
});
