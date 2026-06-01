// Makruk counting rules — pure helpers shared by client + worker.
//
// Two distinct counting modes in Makruk:
//
//   1. Honor counting (นับศักดิ์)
//      Triggered when one side has no pawns. Target is fixed at 64
//      starting from when the count begins.
//
//   2. Piece counting (นับกระดาน)
//      Triggered when one side is bare (king only). Target depends
//      on the strong side's material. The Sittharong (Thai chess
//      federation) limits:
//        K + R + R  vs K  →  8 half-moves
//        K + R      vs K  →  16
//        K + N + N  vs K  →  32   (often unwinnable in practice)
//        K + N      vs K  →  64
//        K + B + B  vs K  →  22
//        K + B      vs K  →  44
//        K + B + N  vs K  →  44
//        anything richer than the above  →  64 (fallback)
//
// The Worker currently uses a coarse "halfmove >= 100" approximation
// for the 50-move analog (worker/src/verifier.ts), which doesn't
// match either of these. Until the worker imports this module
// directly, the same constants and helpers must stay byte-identical
// between client and worker — that's the parity contract.

import type { CountInfo, Color, ParsedFen, Role } from './types';

/** FS-encoded counting state extracted from a parsed FEN.
 *
 *  FS uses FEN field 3 (the en-passant slot) to carry the counting
 *  target as a number, and field 4 (the half-move clock) as the
 *  counting current value. When field 3 is '-' or non-numeric, no
 *  count is active. */
export function parseCounting(fen: ParsedFen | string): CountInfo {
  const parsed = typeof fen === 'string' ? quickParseClocks(fen) : fen;
  if (!parsed) return { active: false };
  const slot = parsed.countingSlot;
  if (slot === '-' || !/^\d+$/.test(slot)) return { active: false };
  const target = Number(slot);
  // Number.isSafeInteger guards against overflow: a literal slot like
  // '9007199254740993' coerces to 9007199254740992 via Number() and
  // would silently change the count target. Reject anything past
  // MAX_SAFE_INTEGER so the rules layer never trusts a rounded value.
  // Matches the strict gate parseFen uses on the same field.
  if (!Number.isSafeInteger(target) || target <= 0) return { active: false };
  const current = parsed.halfmove;
  const remaining = Math.max(0, target - current);
  return { active: true, target, current, remaining };
}

/** Cheap parse that only extracts the fields parseCounting needs —
 *  avoids the full piece-map walk when the caller is just polling
 *  the clock from a long move history. Matches the field indices
 *  the legacy `src/lib/makruk.ts` parser used: fields[3] for the
 *  FS-overloaded en-passant / counting slot, fields[4] for the
 *  half-move clock.
 *
 *  Integer-strict on the half-move field: rejects fractional,
 *  exponential, signed, or empty values that Number() would
 *  silently coerce. Stays in sync with parseFen's strictness so
 *  the two parsers never disagree on what 'valid' means. */
function quickParseClocks(fen: string): {
  countingSlot: string;
  halfmove: number;
} | null {
  const fields = fen.split(/\s+/);
  if (fields.length < 6) return null;
  const raw = fields[4];
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) return null;
  const halfmove = Number(raw);
  if (!Number.isSafeInteger(halfmove)) return null;
  return { countingSlot: fields[3] ?? '-', halfmove };
}

/** Classify the strong side's material into a Sittharong counting
 *  bucket. Returns the half-move limit OR null when no Honor / Piece
 *  count applies (both sides have pawns, no bare king yet). */
export function pieceCountingLimit(pos: ParsedFen): number | null {
  const bareSide = bareKingSide(pos);
  if (bareSide === null) return null;
  const strong: Color = bareSide === 'white' ? 'black' : 'white';
  let rooks = 0;
  let knights = 0;
  let khons = 0;
  let mets = 0;
  let bias = 0;
  for (const piece of Object.values(pos.pieces)) {
    if (piece.color !== strong) continue;
    if (piece.role === 'rook') rooks++;
    else if (piece.role === 'knight') knights++;
    else if (piece.role === 'khon') khons++;
    else if (piece.role === 'met') mets++;
    else if (piece.role === 'bia') bias++;
  }
  // Piece counting only triggers when the strong side has no pawns —
  // otherwise it's Honor counting territory (separate rule).
  if (bias > 0) return null;
  if (rooks >= 2) return 8;
  if (rooks === 1) {
    // K+R alone forces mate in 16; adding any non-pawn helper
    // (Met / Khon / Knight) extends the count to 22. Matches the
    // existing counting-trainer levels (countingDrill.ts):
    //   L2 K+R vs K            = 16
    //   L3 K+R+M vs K          = 22
    // Earlier this branch fell through to `rooks === 1 → 16` for
    // K+R+M as well — the helper disagreed with what the trainer
    // showed users.
    if (mets + khons + knights > 0) return 22;
    return 16;
  }
  if (knights >= 2) return 32;
  if (khons === 2) return 22;
  if (khons === 1 && knights === 1) return 44;
  if (khons === 1) return 44;
  if (knights === 1) return 64;
  // Met-rich endings count under Honor rules (64) when no rook/knight/khon.
  if (mets > 0) return 64;
  return null;
}

/** Honor counting — both sides have pawns dwindled or one side has
 *  no pawns; count starts at 64. */
export const HONOR_COUNT_LIMIT = 64;

/** Identify the side reduced to king only. Returns null when neither
 *  side is bare (regular play continues). */
export function bareKingSide(pos: ParsedFen): Color | null {
  const counts: Record<Color, Record<Role, number>> = {
    white: { king: 0, met: 0, khon: 0, knight: 0, rook: 0, bia: 0 },
    black: { king: 0, met: 0, khon: 0, knight: 0, rook: 0, bia: 0 },
  };
  for (const piece of Object.values(pos.pieces)) {
    counts[piece.color][piece.role]++;
  }
  const isBare = (c: Color) =>
    counts[c].king === 1 &&
    counts[c].met === 0 &&
    counts[c].khon === 0 &&
    counts[c].knight === 0 &&
    counts[c].rook === 0 &&
    counts[c].bia === 0;
  if (isBare('white')) return 'white';
  if (isBare('black')) return 'black';
  return null;
}
