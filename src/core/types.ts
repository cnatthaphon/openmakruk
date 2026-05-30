// Shared core types — used by both client and worker for Makruk
// rules + FEN + counting. Stay PURE: no chessground, no ffish,
// no React. Adding a dependency here forces it into the worker
// runtime, which is the wrong shape.
//
// Issue #3 — long-term goal is for these types to be the single
// source of truth for legal moves, replay, terminal detection,
// promotion, and counting. Today only FEN parsing + counting
// helpers actually live here; the rest is interface-only so
// follow-up PRs can fill it in without renaming the contract.

export type Color = 'white' | 'black';

/** Makruk piece roles. Names match the Thai tradition. The English
 *  alternatives (queen/bishop/etc.) are used by chessground for
 *  glyph mapping only; rules-level code should refer to these
 *  Thai role names. */
export type Role = 'king' | 'met' | 'khon' | 'knight' | 'rook' | 'bia';

/** Algebraic square label, 'a1' through 'h8'. Lowercased. */
export type Square = string;

/** UCI move notation: `${from}${to}` plus optional promotion letter.
 *  For Makruk promotion the letter is `m` (Met). Examples:
 *    'e3e4'       — Bia push
 *    'd5e6'       — Bia capture
 *    'd6d7m'      — Bia promotes to Met
 *    '0000'       — null move (engine signal for "no legal moves") */
export type UciMove = string;

/** One piece on the board. */
export type Piece = {
  role: Role;
  color: Color;
};

/** Sparse piece map keyed by square label. Empty squares are absent.
 *  Values are structured {role, color}. The legacy single-letter
 *  variant (square → FEN letter like 'K' or 'p') is exported as
 *  `LetterMap` to keep existing callers compiling. */
export type PieceMap = Record<Square, Piece>;

/** Legacy single-letter piece map. The string value is the raw FEN
 *  character: uppercase for white, lowercase for black. Equivalent
 *  to the original src/lib/makruk.ts `PieceMap` shape — kept here
 *  so existing callers can compile against `src/core` directly. */
export type LetterMap = Record<Square, string>;

/** Parsed FEN — separates positional info from clocks. */
export type ParsedFen = {
  pieces: PieceMap;
  /** Side to move. */
  turn: Color;
  /** Field 3 of the FEN — Fairy-Stockfish uses this slot to encode
   *  the Makruk counting target. '-' when no count is active. */
  countingSlot: string;
  /** Field 4 of the FEN — half-move clock. Doubles as the counting
   *  current-count when countingSlot is numeric. */
  halfmove: number;
  /** Field 5 — full-move number. */
  fullmove: number;
};

/** Counting state. When `active` is true, the side losing must mate
 *  the opponent within `target - current` half-moves or the game
 *  is drawn (Honor counting / piece counting depending on material). */
export type CountInfo =
  | { active: false }
  | {
      active: true;
      target: number;
      current: number;
      remaining: number;
    };
