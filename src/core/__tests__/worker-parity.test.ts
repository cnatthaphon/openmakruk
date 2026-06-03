// Worker ↔ core parity (issue #3).
//
// `worker/src/rules.ts` is a SEPARATE pure-JS Makruk implementation —
// the Cloudflare worker can't import `src/core/` across the package
// boundary, so it carries its own FEN parser + piece-letter table.
// Issue #3's acceptance allows that "as long as there are explicit
// parity tests until direct sharing is possible." This is that test:
// it imports BOTH implementations (both are dependency-free pure TS)
// and pins where they agree — and the one place they intentionally
// diverge.
//
// If this test fails, the worker and the client have drifted on a
// rule and `src/core/` is the source of truth (worker must conform).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MAKRUK_START_FEN, letterToRole, fenToPieceMap, parseFen } from '../fen.ts';
import * as worker from '../../../worker/src/rules.ts';

describe('worker ↔ core parity', () => {
  it('shares the exact Makruk start FEN', () => {
    assert.equal(worker.MAKRUK_START_FEN, MAKRUK_START_FEN);
  });

  it('agrees on piece-letter → {role,color} for every letter', () => {
    // Standard letters + the Fairy-Stockfish 'Q'/'q' alias for the Met
    // (both implementations accept it) — must map identically.
    const letters = ['K', 'M', 'Q', 'S', 'N', 'R', 'P', 'k', 'm', 'q', 's', 'n', 'r', 'p'];
    for (const ch of letters) {
      assert.deepEqual(
        worker.letterToPiece(ch),
        letterToRole(ch),
        `letter '${ch}' must map identically`,
      );
    }
    // Unknown letters reject (null) in both.
    for (const ch of ['x', 'z', '1', '', 'KK']) {
      assert.deepEqual(
        worker.letterToPiece(ch),
        letterToRole(ch),
        `'${ch}' must reject (null) in both`,
      );
    }
  });

  // Valid 6-field Makruk FENs: placement + turn + counters must match.
  const VALID_FENS = [
    MAKRUK_START_FEN,
    '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
    '4k3/p7/8/3P4/8/8/8/4K3 w - - 0 1',
    '8/8/8/4k3/8/3K4/8/7R b - - 12 40',
  ];

  it('parses placement + turn + counters identically on valid FENs', () => {
    for (const fen of VALID_FENS) {
      const w = worker.parseFen(fen);
      const c = parseFen(fen);
      assert.ok(w, `worker parses ${fen}`);
      assert.ok(c, `core parses ${fen}`);
      // Worker stores square→letter; core's fenToPieceMap is the same
      // shape — compare those.
      assert.deepEqual(w!.pieces, fenToPieceMap(fen), `placement parity: ${fen}`);
      assert.equal(w!.turn, c!.turn, `turn parity: ${fen}`);
      assert.equal(w!.halfmove, c!.halfmove, `halfmove parity: ${fen}`);
      assert.equal(w!.fullmove, c!.fullmove, `fullmove parity: ${fen}`);
    }
  });

  it('both reject malformed PLACEMENT (grid parity)', () => {
    const badPlacement = [
      '7k/8/6K1/8/8/8/8/R8 w - - 0 1', // rank sums to 9 files
      '7k/8/6K1/8/8/8/8 w - - 0 1', // only 7 ranks
      '7k/8/6K1/8/8/8/8/8/8 w - - 0 1', // 9 ranks
    ];
    for (const fen of badPlacement) {
      assert.equal(worker.parseFen(fen), null, `worker rejects bad grid: ${fen}`);
      assert.equal(parseFen(fen), null, `core rejects bad grid: ${fen}`);
    }
  });

  // DOCUMENTED, INTENTIONAL DIVERGENCE: core is the strict authority
  // for client-side parsing and rejects malformed META fields
  // (castling ≠ '-', missing fields, bad counting slot). The worker is
  // downstream of ffish — by the time a move log reaches it, the FEN
  // was already produced by the engine — so it only needs placement +
  // turn + counters to replay, and is deliberately lenient on the meta
  // fields. This test PINS that asymmetry so it stays intentional, not
  // accidental: if someone tightens the worker or loosens core, the
  // expectation here must be updated consciously.
  it('core is stricter on META fields than the worker (intentional)', () => {
    // Both are full 6-field FENs with a VALID placement grid — the
    // only thing wrong is a meta field. core rejects; the worker, which
    // only reads placement + turn + counters, tolerates them.
    const looseMeta = [
      '7k/8/6K1/8/8/8/8/R7 w KQ - 0 1', // castling ≠ '-'  (core: invalid)
      '7k/8/6K1/8/8/8/8/R7 w - xyz 0 1', // counting slot not '-'/safe-int
    ];
    for (const fen of looseMeta) {
      assert.equal(parseFen(fen), null, `core rejects loose meta: ${fen}`);
      assert.notEqual(
        worker.parseFen(fen),
        null,
        `worker tolerates loose meta (downstream of ffish): ${fen}`,
      );
    }
  });
});
