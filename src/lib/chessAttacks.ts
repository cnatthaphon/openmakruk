// Attack-square calculator for Makruk pieces. Used by the Chess Coach
// module to detect motifs (fork, hanging piece, threat) without
// needing to round-trip through the engine.
//
// Each role's attack pattern is COMPLETE — bia attacks the two diagonal
// squares (not the push square), khon attacks the forward + 4
// diagonals, rook slides until it hits a piece, etc.

import type { Color, Role } from './lessonRules';
import { fenToPieceMap, type PieceMap } from './makruk';

/** Reverse-lookup: piece letter → { role, color }. */
export function letterToPiece(letter: string): { role: Role; color: Color } | null {
  const upper = letter.toUpperCase();
  const color: Color = letter === upper ? 'white' : 'black';
  switch (upper) {
    case 'K': return { role: 'king',   color };
    case 'M': return { role: 'met',    color };
    case 'Q': return { role: 'met',    color };   // chessground variant
    case 'S': return { role: 'khon',   color };
    case 'B': return { role: 'khon',   color };   // chessground variant
    case 'N': return { role: 'knight', color };
    case 'R': return { role: 'rook',   color };
    case 'P': return { role: 'bia',    color };
    default:  return null;
  }
}

/** Piece values for trade evaluation, calibrated to standard Makruk
 * literature. Note Khon > Met (opposite of how chess Queen > Bishop):
 *   - Khon has 5 squares of mobility (forward + 4 diagonals) vs
 *     Met's 4 (4 diagonals)
 *   - Khon cannot be "manufactured" — only the original 2 per side
 *     ever exist
 *   - Met is "cheap" because every Bia that reaches rank 6 (white) /
 *     rank 3 (black) promotes to Met
 * So in Makruk, losing a Khon hurts more than losing a Met. */
export const PIECE_VALUE: Record<Role, number> = {
  king:   1000,  // sentinel — losing king ends the game anyway
  met:    1.5,
  khon:   2.5,
  knight: 2.5,
  rook:   5.0,
  bia:    1.0,
};

export const ROLE_TH: Record<Role, string> = {
  king:   'ขุน',
  met:    'เม็ด',
  khon:   'โคน',
  knight: 'ม้า',
  rook:   'เรือ',
  bia:    'เบี้ย',
};

/**
 * All squares this piece attacks from `square` given current board
 * occupancy. Includes friendly-occupied squares so the caller can
 * filter for "defended own piece" vs "attacking enemy".
 */
export function attacksFrom(
  pieces: PieceMap,
  square: string,
  piece: { role: Role; color: Color },
): string[] {
  const start = parseSquareCoords(square);
  if (!start) return [];
  const out: string[] = [];

  const push = (f: number, r: number) => {
    if (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
      out.push(`${String.fromCharCode(97 + f)}${r}`);
    }
  };

  switch (piece.role) {
    case 'king':
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df === 0 && dr === 0) continue;
          push(start.file + df, start.rank + dr);
        }
      }
      break;

    case 'met':
      for (const df of [-1, 1]) {
        for (const dr of [-1, 1]) push(start.file + df, start.rank + dr);
      }
      break;

    case 'khon': {
      const fwd = piece.color === 'white' ? 1 : -1;
      push(start.file, start.rank + fwd);
      for (const df of [-1, 1]) {
        for (const dr of [-1, 1]) push(start.file + df, start.rank + dr);
      }
      break;
    }

    case 'knight': {
      const jumps: [number, number][] = [
        [1, 2], [2, 1], [-1, 2], [-2, 1],
        [1, -2], [2, -1], [-1, -2], [-2, -1],
      ];
      for (const [df, dr] of jumps) push(start.file + df, start.rank + dr);
      break;
    }

    case 'rook': {
      // Slide along each direction, stop at first occupied square
      // (but include that square as an attack — it's a capture target).
      const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [df, dr] of dirs) {
        for (let i = 1; i < 8; i++) {
          const f = start.file + df * i;
          const r = start.rank + dr * i;
          if (f < 0 || f > 7 || r < 1 || r > 8) break;
          const sq = `${String.fromCharCode(97 + f)}${r}`;
          out.push(sq);
          if (pieces[sq]) break;
        }
      }
      break;
    }

    case 'bia': {
      // Bia attacks the two diagonal-forward squares (NOT the push square).
      const fwd = piece.color === 'white' ? 1 : -1;
      push(start.file - 1, start.rank + fwd);
      push(start.file + 1, start.rank + fwd);
      break;
    }
  }

  return out;
}

/**
 * For a given side, build a map from square → list of squares
 * containing pieces of that side that attack it. Inverse index for
 * fast "is this square attacked / defended" lookups.
 */
export function attackerIndex(pieces: PieceMap, side: Color): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [sq, letter] of Object.entries(pieces)) {
    const p = letterToPiece(letter);
    if (!p || p.color !== side) continue;
    for (const target of attacksFrom(pieces, sq, p)) {
      const list = out.get(target);
      if (list) list.push(sq);
      else out.set(target, [sq]);
    }
  }
  return out;
}

/** Is `square` attacked by any piece of `side`? Returns attacker
 * square list (empty = not attacked). */
export function attackedBy(
  pieces: PieceMap,
  square: string,
  side: Color,
): string[] {
  const out: string[] = [];
  for (const [sq, letter] of Object.entries(pieces)) {
    const p = letterToPiece(letter);
    if (!p || p.color !== side) continue;
    if (attacksFrom(pieces, sq, p).includes(square)) out.push(sq);
  }
  return out;
}

/** All enemy squares attacked by the piece at `from`. */
export function enemyTargetsFrom(
  pieces: PieceMap,
  from: string,
  attacker: { role: Role; color: Color },
): { square: string; piece: { role: Role; color: Color } }[] {
  const out: { square: string; piece: { role: Role; color: Color } }[] = [];
  for (const sq of attacksFrom(pieces, from, attacker)) {
    const occupant = pieces[sq];
    if (!occupant) continue;
    const p = letterToPiece(occupant);
    if (p && p.color !== attacker.color) {
      out.push({ square: sq, piece: p });
    }
  }
  return out;
}

/** Convenience: parse FEN + return piece map. */
export function piecesFromFen(fen: string): PieceMap {
  return fenToPieceMap(fen);
}

// ---- internal ----------------------------------------------------------

function parseSquareCoords(sq: string): { file: number; rank: number } | null {
  if (sq.length !== 2) return null;
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10);
  if (file < 0 || file > 7 || isNaN(rank) || rank < 1 || rank > 8) return null;
  return { file, rank };
}
