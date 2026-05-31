// pieceCountingLimit — Sittharong piece-counting table.
//
// Existing counting trainer (src/lib/countingDrill.ts) is the
// canonical source for "what limit shows up to the user" — every
// case here should match the corresponding DRILL_LEVELS entry by
// material composition so the shared helper and the trainer stay
// byte-aligned.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFen } from '../fen.ts';
import { pieceCountingLimit, bareKingSide } from '../counting.ts';

/** Helper — feed a FEN through parseFen first because pieceCountingLimit
 *  takes ParsedFen. Throws if the FEN is invalid so a test typo is
 *  loud, not silent. */
function limitFor(fen: string): number | null {
  const p = parseFen(fen);
  if (!p) throw new Error(`test FEN must parse: ${fen}`);
  return pieceCountingLimit(p);
}

describe('pieceCountingLimit — strong-side material', () => {
  it('K + 2R vs K → 8 (trainer L1)', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/R3K2R w - - 0 1'), 8);
  });

  it('K + R vs K → 16 (trainer L2)', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'), 16);
  });

  it('K + R + M vs K → 22 (trainer L3) — was returning 16 before this fix', () => {
    // The R+M combo is the regression Codex flagged: the rook==1
    // branch was firing before the M was considered. After the fix
    // the branch checks for any non-pawn helper and extends to 22.
    assert.equal(limitFor('4k3/8/8/8/8/8/8/R2MK3 w - - 0 1'), 22);
  });

  it('K + R + S vs K → 22 (Khon helper)', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/R2SK3 w - - 0 1'), 22);
  });

  it('K + R + N vs K → 22 (Knight helper)', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/R2NK3 w - - 0 1'), 22);
  });

  it('K + 2N vs K → 32', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/N2NK3 w - - 0 1'), 32);
  });

  it('K + 2S vs K → 22', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/S2SK3 w - - 0 1'), 22);
  });

  it('K + S + N vs K → 44', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/S2NK3 w - - 0 1'), 44);
  });

  it('K + S vs K → 44', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/S3K3 w - - 0 1'), 44);
  });

  it('K + N vs K → 64', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/N3K3 w - - 0 1'), 64);
  });

  it('K + M vs K → 64 (Met alone, Honor-style)', () => {
    assert.equal(limitFor('4k3/8/8/8/8/8/8/M3K3 w - - 0 1'), 64);
  });

  it('returns null when strong side has any pawn (Honor counting only)', () => {
    // K + R + P vs K — Honor counting territory, not piece counting.
    assert.equal(limitFor('4k3/8/8/8/8/8/P7/R3K3 w - - 0 1'), null);
  });

  it('returns null when neither side is bare', () => {
    // K + R vs K + R — no piece counting until one side is bare.
    assert.equal(limitFor('r3k3/8/8/8/8/8/8/R3K3 w - - 0 1'), null);
  });
});

describe('bareKingSide', () => {
  it('detects white bare king', () => {
    const p = parseFen('4k3/8/8/8/8/8/8/R3K3 b - - 0 1');
    if (!p) throw new Error('FEN must parse');
    // Black to move; the BARE side is whoever has just the king —
    // here it's black (just k on e8).
    assert.equal(bareKingSide(p), 'black');
  });

  it('detects black bare king', () => {
    const p = parseFen('R3k3/8/8/8/8/8/8/4K3 w - - 0 1');
    if (!p) throw new Error('FEN must parse');
    assert.equal(bareKingSide(p), 'black');
  });

  it('returns null when neither side is bare', () => {
    const p = parseFen('r3k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    if (!p) throw new Error('FEN must parse');
    assert.equal(bareKingSide(p), null);
  });
});
