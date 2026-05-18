// FEN piece char → Unicode glyph (chess symbols as placeholder for Makruk pieces).
// Uppercase = white, lowercase = black.
//
// Makruk piece mapping (Fairy-Stockfish variants.ini):
//   K = King (ขุน)
//   M = Met (เม็ด)   — moves 1 diagonal
//   S = Khon (โคน)   — moves 1 forward or 1 of 4 diagonals
//   N = Horse (ม้า)  — knight
//   R = Rook (เรือ)
//   P = Pawn (เบี้ย) — promotes to Met on rank 6 (white) / rank 3 (black)
//
// TODO(v0.1): replace with proper Thai piece SVG artwork.

export const PIECE_GLYPHS: Record<string, string> = {
  K: '♔', k: '♚',
  M: '♕', m: '♛',
  S: '♗', s: '♝',
  N: '♘', n: '♞',
  R: '♖', r: '♜',
  P: '♙', p: '♟',
};

export const PIECE_NAMES_TH: Record<string, string> = {
  K: 'ขุน',  k: 'ขุน',
  M: 'เม็ด', m: 'เม็ด',
  S: 'โคน',  s: 'โคน',
  N: 'ม้า',  n: 'ม้า',
  R: 'เรือ', r: 'เรือ',
  P: 'เบี้ย', p: 'เบี้ย',
};

export function isWhitePiece(piece: string): boolean {
  return piece === piece.toUpperCase();
}
