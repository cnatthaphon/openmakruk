// FEN parsing — Makruk variant.
//
// Field layout (Fairy-Stockfish dialect, matches standard FEN
// 6-field shape with Makruk-specific overloading of field 4):
//   0. piece placement  (ranks 8-1, '/' separated)
//   1. side to move     ('w' | 'b')
//   2. castling rights  (always '-' for Makruk — no castling)
//   3. counting target  ('-' or a positive integer; FS overloads
//                        the en-passant slot for the Makruk
//                        counting target — never an actual square)
//   4. half-move clock  (also the counting CURRENT value when a
//                        count is active)
//   5. full-move number
//
// We intentionally do NOT depend on ffish here so the worker can
// import this module without pulling in WASM.

import type {
  Color,
  LetterMap,
  ParsedFen,
  PieceMap,
  Role,
  Square,
} from './types';

/** Canonical Makruk starting position. The K and M files are
 *  asymmetric: white has K at d1, M at e1; black has K at e8, M at d8.
 *  The kings face diagonally, not on the same column — this is real
 *  Makruk tradition and a common mistake when porting from chess. */
export const MAKRUK_START_FEN =
  'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1';

/** Single-letter piece map. Uppercase = white, lowercase = black.
 *  Includes the chessground-letter aliases (Q for Met, B for Khon)
 *  because Fairy-Stockfish emits both forms depending on path. */
export function letterToRole(ch: string): { role: Role; color: Color } | null {
  const upper = ch.toUpperCase();
  const color: Color = ch === upper ? 'white' : 'black';
  switch (upper) {
    case 'K': return { role: 'king',   color };
    case 'M': return { role: 'met',    color };
    case 'Q': return { role: 'met',    color };
    case 'S': return { role: 'khon',   color };
    case 'B': return { role: 'khon',   color };
    case 'N': return { role: 'knight', color };
    case 'R': return { role: 'rook',   color };
    case 'P': return { role: 'bia',    color };
    default:  return null;
  }
}

/** Parse only the piece-placement portion (field 1) of a FEN into
 *  a sparse {square: letter} map.
 *
 *  Lenient by design: this exists for rendering callers that need
 *  to know "what letter is on each square" without rejecting an
 *  entire game over a single bad character. Malformed ranks return
 *  whatever the parser managed to read; unknown letters are
 *  preserved (chessground will glyph-fallback on them). Strict
 *  validation belongs in parseFen() below, which returns null on
 *  any deviation from the FEN contract. */
export function fenToPieceMap(fen: string): LetterMap {
  const pieces: LetterMap = {};
  const position = fen.split(' ')[0];
  if (!position) return pieces;
  const ranks = position.split('/');
  for (let i = 0; i < ranks.length; i++) {
    const rank = 8 - i;
    let fileIdx = 0;
    const row = ranks[i];
    let j = 0;
    while (j < row.length) {
      const ch = row[j];
      if (ch >= '1' && ch <= '9') {
        fileIdx += Number(ch);
        j++;
        continue;
      }
      // Fairy-Stockfish prefixes promoted pieces with '+'. Skip the
      // marker — the next char carries the role letter.
      if (ch === '+') {
        if (j + 1 >= row.length) { j++; continue; }
        const file = String.fromCharCode(97 + fileIdx);
        pieces[`${file}${rank}` as Square] = row[j + 1];
        fileIdx++;
        j += 2;
        continue;
      }
      const file = String.fromCharCode(97 + fileIdx); // 'a' + fileIdx
      pieces[`${file}${rank}` as Square] = ch;
      fileIdx++;
      j++;
    }
  }
  return pieces;
}

/** Validate a single FEN rank row. Same parsing logic as
 *  fenToPieceMap but returns null on:
 *    - unknown piece letter
 *    - trailing '+' with no role letter after
 *    - row sums to anything other than exactly 8 files
 *  Returns the sparse letter map for the rank when valid. */
function parseRankStrict(
  row: string,
  rankNum: number,
): LetterMap | null {
  const pieces: LetterMap = {};
  let fileIdx = 0;
  let j = 0;
  while (j < row.length) {
    const ch = row[j];
    if (ch >= '1' && ch <= '9') {
      fileIdx += Number(ch);
      j++;
      continue;
    }
    let letterCh = ch;
    if (ch === '+') {
      if (j + 1 >= row.length) return null;
      letterCh = row[j + 1];
      j += 2;
    } else {
      j++;
    }
    if (letterToRole(letterCh) === null) return null;
    if (fileIdx > 7) return null;
    const file = String.fromCharCode(97 + fileIdx);
    pieces[`${file}${rankNum}` as Square] = letterCh;
    fileIdx++;
  }
  // Each rank MUST account for exactly 8 files. Short rows
  // (missing piece) and long rows (extra piece) both indicate
  // corrupted data and must be rejected for the rules layer to
  // trust the position.
  if (fileIdx !== 8) return null;
  return pieces;
}

/** Parse a full FEN into structured pieces + clocks. Returns null
 *  on any malformed input:
 *    - fewer than 6 space-separated fields
 *    - placement field with anything other than exactly 8 ranks
 *    - any rank that doesn't sum to 8 files
 *    - any unknown piece letter in the placement
 *    - side-to-move not in {'w', 'b'}
 *    - non-numeric or negative half-move / full-move
 *
 *  Callers that need to recover should branch on the null instead
 *  of try/catching. */
export function parseFen(fen: string): ParsedFen | null {
  const fields = fen.split(/\s+/);
  if (fields.length < 6) return null;
  // fields[2] is castling rights (Makruk: always '-'). We skip it
  // and read fields[3] (en-passant / counting slot in FS dialect)
  // into countingSlot.
  const [placement, turnRaw, , countingSlot, halfmoveRaw, fullmoveRaw] = fields;
  if (turnRaw !== 'w' && turnRaw !== 'b') return null;
  const halfmove = Number(halfmoveRaw);
  const fullmove = Number(fullmoveRaw);
  if (!Number.isFinite(halfmove) || !Number.isFinite(fullmove)) return null;
  if (halfmove < 0 || fullmove < 0) return null;

  const ranks = placement.split('/');
  if (ranks.length !== 8) return null;
  const pieces: PieceMap = {};
  for (let i = 0; i < ranks.length; i++) {
    const rankNum = 8 - i;
    const rankMap = parseRankStrict(ranks[i], rankNum);
    if (rankMap === null) return null;
    for (const [sq, letter] of Object.entries(rankMap)) {
      const piece = letterToRole(letter);
      if (piece === null) return null;
      pieces[sq] = piece;
    }
  }

  return {
    pieces,
    turn: turnRaw === 'w' ? 'white' : 'black',
    countingSlot: countingSlot ?? '-',
    halfmove,
    fullmove,
  };
}
