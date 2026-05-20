// Pure move-rule calculators for the Tutorial.
//
// These DON'T depend on ffish — for each piece type + colour + square
// we hand-compute every Makruk-legal destination on an empty board.
// Used by the LessonView to highlight squares the piece can reach so
// the learner can see the movement pattern.
//
// Lesson positions are deliberately one-piece-on-empty-board (or piece
// + a sacrificial target for the Bia capture demo) — Makruk's full
// "is this move legal given the whole position" lives in ffish; here
// we just visualise the piece's intrinsic reach.

export type Role = 'king' | 'met' | 'khon' | 'knight' | 'rook' | 'bia';

export const ROLE_TH: Record<Role, string> = {
  king:   'ขุน',
  met:    'เม็ด',
  khon:   'โคน',
  knight: 'ม้า',
  rook:   'เรือ',
  bia:    'เบี้ย',
};

/** Map our Role names to the chess-piece slot the Fulmene SVGs use. */
export const ROLE_TO_CG: Record<Role, string> = {
  king:   'king',
  met:    'queen',
  khon:   'bishop',
  knight: 'knight',
  rook:   'rook',
  bia:    'pawn',
};

export type Color = 'white' | 'black';

/** "a1" → { file: 0, rank: 1 }. Out-of-range input returns null. */
export function parseSquare(sq: string): { file: number; rank: number } | null {
  if (sq.length !== 2) return null;
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10);
  if (file < 0 || file > 7 || isNaN(rank) || rank < 1 || rank > 8) return null;
  return { file, rank };
}

export function makeSquare(file: number, rank: number): string {
  return `${String.fromCharCode(97 + file)}${rank}`;
}

/**
 * All squares the given piece could move to on an empty 8×8 board.
 * For sliding pieces (Rook), this walks the full open row + column.
 * For pawn-like Bia, includes both the forward push AND the two
 * diagonal squares (the learner sees them with a "capture" badge so
 * the rule is clear even without an enemy piece sitting there).
 *
 * Returned squares are deduplicated and within board bounds.
 */
export function legalSquaresForPiece(
  role: Role,
  color: Color,
  square: string,
): string[] {
  const start = parseSquare(square);
  if (!start) return [];
  const out: string[] = [];
  const push = (f: number, r: number) => {
    if (f >= 0 && f <= 7 && r >= 1 && r <= 8) out.push(makeSquare(f, r));
  };

  switch (role) {
    case 'king': {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df === 0 && dr === 0) continue;
          push(start.file + df, start.rank + dr);
        }
      }
      break;
    }
    case 'met': {
      // 1 square diagonal only — ferz-like
      for (const df of [-1, 1]) {
        for (const dr of [-1, 1]) {
          push(start.file + df, start.rank + dr);
        }
      }
      break;
    }
    case 'khon': {
      // Forward 1 + four diagonals = 5 squares total. "Forward" depends
      // on colour: white moves up (rank+1), black moves down (rank-1).
      const fwd = color === 'white' ? 1 : -1;
      push(start.file, start.rank + fwd);
      for (const df of [-1, 1]) {
        for (const dr of [-1, 1]) {
          push(start.file + df, start.rank + dr);
        }
      }
      break;
    }
    case 'knight': {
      // Same L as standard chess knight
      const jumps: [number, number][] = [
        [1, 2], [2, 1], [-1, 2], [-2, 1],
        [1, -2], [2, -1], [-1, -2], [-2, -1],
      ];
      for (const [df, dr] of jumps) {
        push(start.file + df, start.rank + dr);
      }
      break;
    }
    case 'rook': {
      // Slide each of 4 directions until edge
      for (let i = 1; i < 8; i++) push(start.file + i, start.rank);
      for (let i = 1; i < 8; i++) push(start.file - i, start.rank);
      for (let i = 1; i < 8; i++) push(start.file, start.rank + i);
      for (let i = 1; i < 8; i++) push(start.file, start.rank - i);
      break;
    }
    case 'bia': {
      // 1 forward (push) + 2 diagonal-forward (captures only)
      const fwd = color === 'white' ? 1 : -1;
      push(start.file, start.rank + fwd);
      push(start.file - 1, start.rank + fwd);
      push(start.file + 1, start.rank + fwd);
      break;
    }
  }

  // Dedup (Rook can never collide with itself but be safe)
  return Array.from(new Set(out));
}

/**
 * For Bia specifically, split forward-push squares from
 * diagonal-capture squares so the lesson UI can colour them
 * differently.
 */
export function biaSquaresSplit(
  color: Color,
  square: string,
): { push: string[]; capture: string[] } {
  const start = parseSquare(square);
  if (!start) return { push: [], capture: [] };
  const fwd = color === 'white' ? 1 : -1;
  const push: string[] = [];
  const capture: string[] = [];
  const tryAdd = (arr: string[], f: number, r: number) => {
    if (f >= 0 && f <= 7 && r >= 1 && r <= 8) arr.push(makeSquare(f, r));
  };
  tryAdd(push, start.file, start.rank + fwd);
  tryAdd(capture, start.file - 1, start.rank + fwd);
  tryAdd(capture, start.file + 1, start.rank + fwd);
  return { push, capture };
}
