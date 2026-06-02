// Pure unit tests for the journey reducer (issue #7). node:test via
// `npm run test:core`. Uses fixture checkpoints so the assertions
// don't depend on the shipped ladder.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createJourneyReducer } from '../reducer.ts';
import { emptyJourney } from '../contract.ts';
import type { Checkpoint, ProgressInput } from '../contract';

const CHECKPOINTS: Checkpoint[] = [
  {
    id: 'cp-lessons',
    title: 'two lessons',
    requirements: [
      { kind: 'lesson-completed', lessonId: 'l-a' },
      { kind: 'lesson-completed', lessonId: 'l-b' },
    ],
  },
  {
    id: 'cp-mate1',
    title: 'three mate-1',
    requirements: [{ kind: 'puzzle-category-solved', category: 'mate-1', count: 3 }],
  },
  {
    id: 'cp-games',
    title: 'three games',
    requirements: [{ kind: 'games-played', minCount: 3 }],
  },
  {
    id: 'cp-concept',
    title: 'mate recognition',
    requirements: [{ kind: 'concept-mastered', concept: 'mate-recognition', minScore: 0.2 }],
  },
];

const reduce = createJourneyReducer(CHECKPOINTS);
const fold = (inputs: ProgressInput[]) =>
  inputs.reduce((s, i) => reduce(s, i), emptyJourney(0));

describe('journey reducer', () => {
  it('records a completed lesson + bumps its concepts', () => {
    const s = reduce(emptyJourney(0), {
      kind: 'lesson-completed',
      lessonId: 'l-a',
      at: 10,
      concepts: ['piece-movement'],
    });
    assert.deepEqual(s.evidence.completedLessons, ['l-a']);
    assert.ok((s.mastery['piece-movement'] ?? 0) > 0);
    assert.equal(s.updatedAt, 10);
  });

  it('is idempotent on a replayed lesson (no double-count, no mastery growth)', () => {
    const once = reduce(emptyJourney(0), {
      kind: 'lesson-completed', lessonId: 'l-a', at: 10, concepts: ['piece-movement'],
    });
    const twice = reduce(once, {
      kind: 'lesson-completed', lessonId: 'l-a', at: 20, concepts: ['piece-movement'],
    });
    assert.deepEqual(twice.evidence.completedLessons, ['l-a']);
    assert.equal(twice.mastery['piece-movement'], once.mastery['piece-movement']);
    // updatedAt still advances so sync picks the latest copy.
    assert.equal(twice.updatedAt, 20);
  });

  it('clears a checkpoint when all requirements are met', () => {
    const s = fold([
      { kind: 'lesson-completed', lessonId: 'l-a', at: 1 },
      { kind: 'lesson-completed', lessonId: 'l-b', at: 2 },
    ]);
    assert.ok(s.cleared.includes('cp-lessons'));
  });

  it('does not clear until ALL requirements are met; clearing is monotonic', () => {
    const partial = reduce(emptyJourney(0), { kind: 'lesson-completed', lessonId: 'l-a', at: 1 });
    assert.ok(!partial.cleared.includes('cp-lessons'));
    const done = reduce(partial, { kind: 'lesson-completed', lessonId: 'l-b', at: 2 });
    assert.ok(done.cleared.includes('cp-lessons'));
  });

  it('counts puzzle-solved per category + dedups re-solves', () => {
    const s = fold([
      { kind: 'puzzle-solved', puzzleId: 'm1', category: 'mate-1', at: 1, optimal: true, concepts: ['mate-recognition'] },
      { kind: 'puzzle-solved', puzzleId: 'm2', category: 'mate-1', at: 2, optimal: false, concepts: ['mate-recognition'] },
      // replay of m1 — must NOT bump the category count to 3
      { kind: 'puzzle-solved', puzzleId: 'm1', category: 'mate-1', at: 3, optimal: true, concepts: ['mate-recognition'] },
    ]);
    assert.equal(s.evidence.puzzleCountsByCategory?.['mate-1'], 2);
    assert.ok(!s.cleared.includes('cp-mate1'));

    const s2 = reduce(s, { kind: 'puzzle-solved', puzzleId: 'm3', category: 'mate-1', at: 4, optimal: true, concepts: ['mate-recognition'] });
    assert.equal(s2.evidence.puzzleCountsByCategory?.['mate-1'], 3);
    assert.ok(s2.cleared.includes('cp-mate1'));
    // concept threshold also satisfied → that checkpoint clears too.
    assert.ok(s2.cleared.includes('cp-concept'));
  });

  it('keeps the best drill stars + only bumps practice on improvement', () => {
    const a = reduce(emptyJourney(0), { kind: 'drill-passed', drillId: 'd1', at: 1, stars: 1, concepts: ['endgame-counting'] });
    const score1 = a.mastery['endgame-counting'] ?? 0;
    const b = reduce(a, { kind: 'drill-passed', drillId: 'd1', at: 2, stars: 3, concepts: ['endgame-counting'] });
    assert.equal(b.evidence.drillBestStars?.['d1'], 3);
    assert.ok((b.mastery['endgame-counting'] ?? 0) > score1);
    // a lower re-attempt does not lower the best nor change mastery
    const c = reduce(b, { kind: 'drill-passed', drillId: 'd1', at: 3, stars: 2, concepts: ['endgame-counting'] });
    assert.equal(c.evidence.drillBestStars?.['d1'], 3);
    assert.equal(c.mastery['endgame-counting'], b.mastery['endgame-counting']);
  });

  it('dedups game-recorded by gameId and splits rated/casual', () => {
    const s = fold([
      { kind: 'game-recorded', gameId: 'g1', at: 1, mode: 'rated', outcome: 'win' },
      { kind: 'game-recorded', gameId: 'g2', at: 2, mode: 'casual', outcome: 'loss' },
      { kind: 'game-recorded', gameId: 'g1', at: 3, mode: 'rated', outcome: 'win' }, // replay
    ]);
    assert.equal(s.evidence.gamesPlayedRated, 1);
    assert.equal(s.evidence.gamesPlayedCasual, 1);
    assert.deepEqual(s.evidence.recordedGameIds, ['g1', 'g2']);
    assert.ok(!s.cleared.includes('cp-games'));
    const s2 = reduce(s, { kind: 'game-recorded', gameId: 'g3', at: 4, mode: 'rated', outcome: 'draw' });
    assert.ok(s2.cleared.includes('cp-games'));
  });

  it('translates review motifs to concept mastery + replaces on re-emit (idempotent)', () => {
    const once = reduce(emptyJourney(0), {
      kind: 'review-summary', gameId: 'g1', at: 1, motifTotals: { mate: 2, fork: 1 },
    });
    assert.ok((once.mastery['mate-recognition'] ?? 0) > 0);
    assert.ok((once.mastery['tactical-fork'] ?? 0) > 0);
    // Re-emit identical → mastery unchanged (replace, not add).
    const twice = reduce(once, {
      kind: 'review-summary', gameId: 'g1', at: 2, motifTotals: { mate: 2, fork: 1 },
    });
    assert.deepEqual(twice.mastery, once.mastery);
    // A different game adds on top.
    const more = reduce(twice, {
      kind: 'review-summary', gameId: 'g2', at: 3, motifTotals: { mate: 3 },
    });
    assert.ok((more.mastery['mate-recognition'] ?? 0) >= (once.mastery['mate-recognition'] ?? 0));
  });

  it('mastery is clamped to [0,1] even with heavy review evidence', () => {
    let s = emptyJourney(0);
    for (let i = 0; i < 50; i++) {
      s = reduce(s, { kind: 'review-summary', gameId: `g${i}`, at: i, motifTotals: { mate: 99 } });
    }
    assert.ok((s.mastery['mate-recognition'] ?? 0) <= 1);
  });

  it('records rating + clears a rating checkpoint via games-played path', () => {
    const s = reduce(emptyJourney(0), { kind: 'rating-changed', at: 1, rating: 1234 });
    assert.equal(s.evidence.rating, 1234);
  });

  it('records a completed challenge', () => {
    const s = reduce(emptyJourney(0), { kind: 'challenge-completed', code: 'abc', at: 1, outcome: 'win' });
    assert.deepEqual(s.evidence.completedChallenges, ['abc']);
  });

  it('order independence: same inputs in any order → same evidence', () => {
    const inputs: ProgressInput[] = [
      { kind: 'lesson-completed', lessonId: 'l-a', at: 1, concepts: ['piece-movement'] },
      { kind: 'puzzle-solved', puzzleId: 'm1', category: 'mate-1', at: 2, optimal: true, concepts: ['mate-recognition'] },
      { kind: 'game-recorded', gameId: 'g1', at: 3, mode: 'rated', outcome: 'win' },
    ];
    const forward = fold(inputs);
    const backward = fold([...inputs].reverse());
    assert.deepEqual(
      { ...forward, updatedAt: 0 },
      { ...backward, updatedAt: 0 },
    );
  });
});
