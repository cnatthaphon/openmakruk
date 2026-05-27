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

/** Per-side per-role maximum piece counts for legal Makruk positions.
 *  Sourced from the start position (2R, 2N, 2S, 1M, 8P) plus the one
 *  promotion case unique to Makruk: a Bia (pawn) reaches its 6th-rank
 *  promotion zone and turns into a Met (queen). That means a side may
 *  legally hold MULTIPLE Mets simultaneously — every pawn that promotes
 *  adds one. The hard cap is therefore 1 (initial) + 8 (max possible
 *  promotions) = 9, though 3 is the realistic upper bound in practice.
 *  We cap at 9 so the editor doesn't reject any conceivable legal
 *  endgame composition. King is always exactly 1. */
export const PIECE_LIMITS: Record<Piece['role'], number> = {
  k: 1,  // exactly one king per side
  m: 9,  // 1 starting Met + up to 8 promoted Bia
  s: 2,  // 2 Khon (bishops), no promotion to Khon
  n: 2,  // 2 Ma (knights)
  r: 2,  // 2 Rua (rooks)
  p: 8,  // 8 Bia (pawns)
};

/** Human-readable Thai name for each piece role — used in error messages
 *  and the Custom-page piece picker so the UI doesn't say "k" or "m". */
export const ROLE_NAMES_TH: Record<Piece['role'], string> = {
  k: 'ขุน',
  m: 'เม็ด',
  s: 'โคน',
  n: 'ม้า',
  r: 'เรือ',
  p: 'เบี้ย',
};

/** Count pieces of (role, color) currently on the grid. Used by the
 *  Custom editor to decide whether the picker button for that piece
 *  should be enabled, and by validateGrid for legality. */
export function countRole(grid: Grid, role: Piece['role'], color: Piece['color']): number {
  let n = 0;
  for (const row of grid) {
    for (const p of row) {
      if (p && p.role === role && p.color === color) n++;
    }
  }
  return n;
}

/** Cheap sanity check before we hand it to ffish (which rejects with
 *  a thrown error for bad FENs). Returns null if OK, else an error msg.
 *  Enforces every PIECE_LIMITS entry so the editor can't construct an
 *  obviously illegal Makruk position (e.g. 5 rooks) and then hand it
 *  to the engine which would reject it less gracefully. */
export function validateGrid(grid: Grid): string | null {
  // Kings must be EXACTLY 1 per side — no fewer, no more.
  const whiteKings = countRole(grid, 'k', 'white');
  const blackKings = countRole(grid, 'k', 'black');
  if (whiteKings === 0) return 'ต้องมีขุนขาวบนกระดาน';
  if (blackKings === 0) return 'ต้องมีขุนดำบนกระดาน';
  if (whiteKings > 1) return 'ขุนขาวมีได้แค่ 1';
  if (blackKings > 1) return 'ขุนดำมีได้แค่ 1';
  // All other pieces have a per-side maximum.
  for (const role of PIECE_ROLES) {
    if (role === 'k') continue;
    const cap = PIECE_LIMITS[role];
    const w = countRole(grid, role, 'white');
    const b = countRole(grid, role, 'black');
    if (w > cap) return `${ROLE_NAMES_TH[role]}ขาวมีได้สูงสุด ${cap} ตัว (เกินไป ${w - cap})`;
    if (b > cap) return `${ROLE_NAMES_TH[role]}ดำมีได้สูงสุด ${cap} ตัว (เกินไป ${b - cap})`;
  }
  return null;
}
