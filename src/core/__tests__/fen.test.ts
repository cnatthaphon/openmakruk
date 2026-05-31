// FEN parser contract tests.
//
// Hardened in response to Codex review on PR #12 — the previous
// parseFen() silently accepted malformed input (wrong rank count,
// rank rows that didn't sum to 8 files, unknown piece letters).
// These tests pin the new validation behaviour so we don't drift
// back. Run via:
//
//   node --experimental-strip-types --test src/core/__tests__/*.test.ts
//
// Or through the `npm run test:core` shortcut.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAKRUK_START_FEN,
  fenToPieceMap,
  letterToRole,
  parseFen,
} from '../fen.ts';
import { parseCounting } from '../counting.ts';

describe('letterToRole', () => {
  it('maps uppercase letters to white pieces', () => {
    assert.deepEqual(letterToRole('K'), { role: 'king',   color: 'white' });
    assert.deepEqual(letterToRole('M'), { role: 'met',    color: 'white' });
    assert.deepEqual(letterToRole('S'), { role: 'khon',   color: 'white' });
    assert.deepEqual(letterToRole('N'), { role: 'knight', color: 'white' });
    assert.deepEqual(letterToRole('R'), { role: 'rook',   color: 'white' });
    assert.deepEqual(letterToRole('P'), { role: 'bia',    color: 'white' });
  });

  it('maps lowercase letters to black pieces', () => {
    assert.deepEqual(letterToRole('k'), { role: 'king',   color: 'black' });
    assert.deepEqual(letterToRole('p'), { role: 'bia',    color: 'black' });
  });

  it('accepts the chessground aliases (Q for met, B for khon)', () => {
    assert.deepEqual(letterToRole('Q'), { role: 'met',  color: 'white' });
    assert.deepEqual(letterToRole('b'), { role: 'khon', color: 'black' });
  });

  it('rejects unknown letters', () => {
    assert.equal(letterToRole('X'), null);
    assert.equal(letterToRole('1'), null);
    assert.equal(letterToRole(''), null);
  });
});

describe('fenToPieceMap', () => {
  it('parses the canonical starting position', () => {
    const m = fenToPieceMap(MAKRUK_START_FEN);
    // Sample the 16 most important squares — black back rank, white
    // back rank, bia rows.
    assert.equal(m['a8'], 'r');
    assert.equal(m['d8'], 'm');
    assert.equal(m['e8'], 'k');
    assert.equal(m['h8'], 'r');
    assert.equal(m['a6'], 'p');
    assert.equal(m['h6'], 'p');
    assert.equal(m['a3'], 'P');
    assert.equal(m['h3'], 'P');
    assert.equal(m['d1'], 'K');
    assert.equal(m['e1'], 'M');
    assert.equal(m['a1'], 'R');
    assert.equal(m['h1'], 'R');
    // Empty squares should be absent (sparse map).
    assert.equal(m['e4'], undefined);
    assert.equal(m['d5'], undefined);
  });

  it('handles the Fairy-Stockfish promoted-piece "+" prefix', () => {
    // FS encodes a promoted Bia (originally Bia, now Met) as +M.
    const m = fenToPieceMap('+M7/8/8/8/8/8/8/k6K w - - 0 1');
    assert.equal(m['a8'], 'M');
    assert.equal(m['a1'], 'k');
    assert.equal(m['h1'], 'K');
  });
});

describe('parseFen — valid input', () => {
  it('parses the canonical starting position fully', () => {
    const p = parseFen(MAKRUK_START_FEN);
    if (!p) throw new Error('expected parseFen to return a value');
    assert.equal(p.turn, 'white');
    assert.equal(p.countingSlot, '-');
    assert.equal(p.halfmove, 0);
    assert.equal(p.fullmove, 1);
    // Spot-check structured pieces map.
    assert.deepEqual(p.pieces['d1'], { role: 'king', color: 'white' });
    assert.deepEqual(p.pieces['e1'], { role: 'met',  color: 'white' });
    assert.deepEqual(p.pieces['a3'], { role: 'bia',  color: 'white' });
    assert.deepEqual(p.pieces['e8'], { role: 'king', color: 'black' });
  });

  it('parses a mid-game FEN with FS counting target', () => {
    const fen = '8/8/8/4k3/8/8/4K3/4R3 w - 64 32 41';
    const p = parseFen(fen);
    if (!p) throw new Error('expected parseFen to return a value');
    assert.equal(p.turn, 'white');
    assert.equal(p.countingSlot, '64');
    assert.equal(p.halfmove, 32);
    assert.equal(p.fullmove, 41);
    // parseCounting should agree.
    const ci = parseCounting(p);
    if (!ci.active) throw new Error('expected counting to be active');
    assert.equal(ci.target, 64);
    assert.equal(ci.current, 32);
    assert.equal(ci.remaining, 32);
  });

  it('accepts black-to-move', () => {
    const fen = MAKRUK_START_FEN.replace(' w ', ' b ');
    const p = parseFen(fen);
    if (!p) throw new Error('expected parseFen to return a value');
    assert.equal(p.turn, 'black');
  });
});

describe('parseFen — malformed input is rejected', () => {
  it('rejects fewer than 6 space-separated fields', () => {
    assert.equal(parseFen('rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR'), null);
    assert.equal(parseFen('rnsmksnr w'), null);
    assert.equal(parseFen(''), null);
  });

  it('rejects invalid side-to-move tokens', () => {
    const bad = MAKRUK_START_FEN.replace(' w ', ' x ');
    assert.equal(parseFen(bad), null);
  });

  it('rejects non-numeric halfmove or fullmove', () => {
    const a = MAKRUK_START_FEN.replace(' 0 1', ' abc 1');
    const b = MAKRUK_START_FEN.replace(' 0 1', ' 0 xyz');
    assert.equal(parseFen(a), null);
    assert.equal(parseFen(b), null);
  });

  it('rejects fractional, exponential, signed, or empty counters', () => {
    for (const bad of ['1.5', '1e3', '-3', '+5', ' ', '0.0', 'NaN']) {
      const fen = MAKRUK_START_FEN.replace(' 0 1', ` ${bad} 1`);
      assert.equal(
        parseFen(fen),
        null,
        `halfmove=${JSON.stringify(bad)} must reject`,
      );
    }
    for (const bad of ['1.5', '1e3', '-1', '+1', '0', '0.5']) {
      const fen = MAKRUK_START_FEN.replace(' 0 1', ` 0 ${bad}`);
      assert.equal(
        parseFen(fen),
        null,
        `fullmove=${JSON.stringify(bad)} must reject`,
      );
    }
  });

  it('accepts the minimum legal full-move number (1)', () => {
    const p = parseFen(MAKRUK_START_FEN);
    if (!p) throw new Error('start position must parse');
    assert.equal(p.fullmove, 1);
  });

  it('rejects placement with the wrong number of ranks', () => {
    // 7 ranks instead of 8
    const seven = 'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/RNSKMSNR w - - 0 1';
    assert.equal(parseFen(seven), null);
    // 9 ranks
    const nine = 'rnsmksnr/8/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1';
    assert.equal(parseFen(nine), null);
  });

  it('rejects a rank that does not sum to exactly 8 files', () => {
    // Top rank has only 7 squares accounted for (8a + 7-empty pattern).
    const short = 'rnsmksn1/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1';
    const r = parseFen(short);
    // 7 file letters + '1' = 8 files — valid. Sanity that the helper
    // accepts this.
    if (!r) throw new Error('short rank with digit padding must be valid');

    // Genuinely short: 6 letters + '1' = 7 files.
    const tooShort = 'rnsmks1/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1';
    assert.equal(parseFen(tooShort), null);

    // Too many files: 9-square rank.
    const tooLong = 'rnsmksnrr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1';
    assert.equal(parseFen(tooLong), null);
  });

  it('rejects unknown piece letters in the placement', () => {
    const bogus = 'XnsmksnR/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1';
    assert.equal(parseFen(bogus), null);
  });

  it('accepts the FS promoted-piece "+" prefix', () => {
    const promoted = '+M7/8/8/8/8/8/8/k6K w - - 0 1';
    const p = parseFen(promoted);
    if (!p) throw new Error('expected parseFen to return a value');
    assert.deepEqual(p.pieces['a8'], { role: 'met', color: 'white' });
  });
});

describe('parseCounting', () => {
  it('returns inactive when the counting slot is "-"', () => {
    assert.deepEqual(parseCounting(MAKRUK_START_FEN), { active: false });
  });

  it('returns active state when the slot is numeric', () => {
    const fen = '8/8/8/4k3/8/8/4K3/4R3 w - 64 16 41';
    const ci = parseCounting(fen);
    if (!ci.active) throw new Error('expected counting to be active');
    assert.equal(ci.target, 64);
    assert.equal(ci.current, 16);
    assert.equal(ci.remaining, 48);
  });

  it('clamps remaining at zero when the count has expired', () => {
    const fen = '8/8/8/4k3/8/8/4K3/4R3 w - 16 99 50';
    const ci = parseCounting(fen);
    if (!ci.active) throw new Error('expected counting to be active');
    assert.equal(ci.remaining, 0);
  });

  it('returns inactive for a malformed counting slot', () => {
    assert.deepEqual(parseCounting('rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - z 0 1'), { active: false });
  });

  it('quickParseClocks (via string overload) is integer-strict on halfmove', () => {
    // Fractional / exponential / signed half-move on the string
    // overload must surface as inactive — same strictness as parseFen
    // applies to the counter field.
    const start = 'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - 64';
    for (const bad of ['1.5', '1e2', '-3', '+5', '']) {
      const fen = `${start} ${bad} 1`;
      assert.deepEqual(
        parseCounting(fen),
        { active: false },
        `halfmove=${JSON.stringify(bad)} must be inactive`,
      );
    }
  });
});
