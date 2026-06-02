// Regression tests for pickReviewSourceGameId (PR #23 review).
// Guards against attributing a reviewed game to a STALE history[0]
// entry. Pure — runs under `npm run test:core`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { pickReviewSourceGameId } from '../sourceGameId.ts';
import type { GameRecord } from '../../stats';

/** Build a GameRecord fixture; only the fields the picker reads matter. */
function rec(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'rec_default',
    outcome: 'win',
    opponentId: 'medium',
    ratingBucket: 'medium',
    userSide: 'white',
    date: 1,
    plyCount: 2,
    ratingBefore: 1000,
    ratingAfter: 1016,
    ratingDelta: 16,
    moves: ['e3e4', 'e6e5'],
    finalFen: 'FINAL_FEN',
    ...overrides,
  };
}

describe('pickReviewSourceGameId', () => {
  it('uses the recorded id when the latest game IS this game', () => {
    const id = pickReviewSourceGameId({
      latestRecorded: rec({ id: 'game_current' }),
      moves: ['e3e4', 'e6e5'],
      finalFen: 'FINAL_FEN',
      gameStartedAt: 5000,
    });
    assert.equal(id, 'game_current');
  });

  // The core regression: an OLD recorded game sits in history[0] while
  // the current reviewed game is manual/self-play (unrecorded). The
  // picker MUST NOT return the old id.
  it('does NOT use a stale history[0] id for an unrecorded current game', () => {
    const oldGame = rec({
      id: 'OLD_GAME_ID',
      plyCount: 40,
      moves: Array.from({ length: 40 }, (_, i) => `m${i}`),
      finalFen: 'OLD_FINAL_FEN',
    });
    const id = pickReviewSourceGameId({
      latestRecorded: oldGame,
      // current reviewed game: a different, unrecorded 2-ply game
      moves: ['e3e4', 'e6e5'],
      finalFen: 'CURRENT_FINAL_FEN',
      gameStartedAt: 9999,
    });
    assert.notEqual(id, 'OLD_GAME_ID');
    assert.equal(id, 'live-9999');
  });

  it('falls back to live id when there is no recorded history', () => {
    const id = pickReviewSourceGameId({
      latestRecorded: undefined,
      moves: ['e3e4'],
      finalFen: 'F',
      gameStartedAt: 1234,
    });
    assert.equal(id, 'live-1234');
  });

  it('rejects a match when plyCount differs', () => {
    const id = pickReviewSourceGameId({
      latestRecorded: rec({ id: 'rec', plyCount: 3 }),
      moves: ['e3e4', 'e6e5'], // length 2 ≠ plyCount 3
      finalFen: 'FINAL_FEN',
      gameStartedAt: 7,
    });
    assert.equal(id, 'live-7');
  });

  it('rejects a match when the final FEN differs', () => {
    const id = pickReviewSourceGameId({
      latestRecorded: rec({ id: 'rec', finalFen: 'OTHER_FEN' }),
      moves: ['e3e4', 'e6e5'],
      finalFen: 'FINAL_FEN',
      gameStartedAt: 7,
    });
    assert.equal(id, 'live-7');
  });

  it('rejects a match when a move differs (same length + fen + count)', () => {
    const id = pickReviewSourceGameId({
      latestRecorded: rec({ id: 'rec', moves: ['e3e4', 'd6d5'] }),
      moves: ['e3e4', 'e6e5'],
      finalFen: 'FINAL_FEN',
      gameStartedAt: 7,
    });
    assert.equal(id, 'live-7');
  });

  it('rejects a match when the recorded game has no moves array', () => {
    const id = pickReviewSourceGameId({
      latestRecorded: rec({ id: 'rec', moves: undefined }),
      moves: ['e3e4', 'e6e5'],
      finalFen: 'FINAL_FEN',
      gameStartedAt: 7,
    });
    assert.equal(id, 'live-7');
  });
});
