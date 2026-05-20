// FEN <-> 8×8 grid helpers used by the custom position editor.
// Standalone (no ffish dep) so we can manipulate positions before
// asking the engine to validate them.

import { MAKRUK_START_FEN } from './makruk';

export type Piece = {
  role: 'k' | 'm' | 's' | 'n' | 'r' | 'p';
  color: 'white' | 'black';
};

export type Grid = (Piece | null)[][]; // grid[rankIdx][fileIdx], rankIdx 0 = rank 8 (top)

export const PIECE_ROLES: Piece['role'][] = ['k', 'm', 's', 'n', 'r', 'p'];

/** Parse FEN's position segment (first field) into an 8×8 grid. */
export function fenToGrid(fen: string): Grid {
  const positionPart = fen.split(/\s+/)[0] ?? '';
  const rows = positionPart.split('/');
  const grid: Grid = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  for (let i = 0; i < 8 && i < rows.length; i++) {
    let file = 0;
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '9') {
        file += Number(ch);
        continue;
      }
      if (ch === '+') continue; // promoted-piece prefix, ignored
      if (file > 7) break;
      const role = ch.toLowerCase() as Piece['role'];
      if (!PIECE_ROLES.includes(role)) continue;
      grid[i][file] = {
        role,
        color: ch === ch.toUpperCase() ? 'white' : 'black',
      };
      file++;
    }
  }
  return grid;
}

/** Build a FEN from grid + side-to-move. The non-position fields use
 *  defaults (no castling, no en-passant, halfmove 0, fullmove 1). */
export function gridToFen(grid: Grid, sideToMove: 'w' | 'b'): string {
  const rows: string[] = [];
  for (let i = 0; i < 8; i++) {
    let row = '';
    let empties = 0;
    for (let j = 0; j < 8; j++) {
      const piece = grid[i][j];
      if (!piece) {
        empties++;
        continue;
      }
      if (empties > 0) {
        row += empties;
        empties = 0;
      }
      const ch = piece.color === 'white' ? piece.role.toUpperCase() : piece.role;
      row += ch;
    }
    if (empties > 0) row += empties;
    rows.push(row);
  }
  return `${rows.join('/')} ${sideToMove} - - 0 1`;
}

export function emptyGrid(): Grid {
  return Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
}

export function startGrid(): Grid {
  return fenToGrid(MAKRUK_START_FEN);
}

export function squareToIdx(file: number, rank: number): { rankIdx: number; fileIdx: number } {
  // rank 1..8, file 0..7 (a..h)
  return { rankIdx: 8 - rank, fileIdx: file };
}

/** Cheap sanity check before we hand it to ffish (which rejects with
 *  a thrown error for bad FENs). Returns null if OK, else an error msg. */
export function validateGrid(grid: Grid): string | null {
  let whiteKings = 0;
  let blackKings = 0;
  for (const row of grid) {
    for (const p of row) {
      if (!p) continue;
      if (p.role === 'k') {
        if (p.color === 'white') whiteKings++;
        else blackKings++;
      }
    }
  }
  if (whiteKings === 0) return 'ต้องมีขุนขาวบนกระดาน';
  if (blackKings === 0) return 'ต้องมีขุนดำบนกระดาน';
  if (whiteKings > 1) return 'ขุนขาวมีได้แค่ 1';
  if (blackKings > 1) return 'ขุนดำมีได้แค่ 1';
  return null;
}
