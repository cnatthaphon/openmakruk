// Pure-JS Makruk rules engine — used by the worker to VERIFY moves
// submitted via POST /api/games. No WASM. Deterministic.
//
// Issue #3 — convergence target is `src/core/`. That module already
// owns the FEN parser, counting helpers, and type contracts. This
// file still carries its own FEN parser + legal-move generation +
// check/mate detection because the worker can't import `src/core/`
// across the package boundary yet. The overlapping parts (start FEN,
// piece-letter table, FEN placement/turn parsing) are explicitly
// parity-tested against core in
// `src/core/__tests__/worker-parity.test.ts` — both modules are
// dependency-free pure TS, so that test imports both and compares. If
// behaviour diverges, `src/core/` is the source of truth and the
// worker must conform. Legal-move generation + classification have no
// core equivalent and are worker-only by design.
//
// Design rule: scope = exactly what's needed to validate a move log.
// We're not trying to play makruk here; ffish/Fairy-Stockfish does
// that on the client. The worker only answers two questions:
//   1. Is this UCI move legal in this position?
//   2. After applying every move in the log, does the final state
//      match the claimed outcome (win/loss/draw)?
//
// What's omitted intentionally:
//   - Counting rules (50-move analog for makruk). For now, the worker
//     accepts the user's claim of "draw" without forcing a counting
//     check; the client-side rules engine already validates this and
//     a determined cheater would fail step 1 if their moves diverged
//     from a real game.
//   - PGN / SAN parsing — UCI only (matches the move log format used
//     everywhere else in the system).
//   - Variants: only the makruk variant is implemented.
//
// Tests live alongside this file in tests/rules.test.ts.

export type Color = 'white' | 'black';
export type Role = 'king' | 'met' | 'khon' | 'knight' | 'rook' | 'bia';

/** Piece-letter parsing — uppercase = white, lowercase = black. */
export function letterToPiece(letter: string): { role: Role; color: Color } | null {
  const upper = letter.toUpperCase();
  const color: Color = letter === upper ? 'white' : 'black';
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

export function pieceToLetter(role: Role, color: Color): string {
  const map: Record<Role, string> = {
    king: 'K', met: 'M', khon: 'S', knight: 'N', rook: 'R', bia: 'P',
  };
  const u = map[role];
  return color === 'white' ? u : u.toLowerCase();
}

export const MAKRUK_START_FEN =
  'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1';

// ─── Board ↔ FEN ────────────────────────────────────────────────────

export type PieceMap = Record<string, string>; // 'e4' -> 'P' etc.

export type Position = {
  pieces: PieceMap;
  turn: Color;          // who moves NEXT
  halfmove: number;     // 50-move counter (incremented per ply, reset on capture / pawn move)
  fullmove: number;
};

function parseSquareCoords(sq: string): { file: number; rank: number } | null {
  if (sq.length < 2) return null;
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq.slice(1), 10);
  if (file < 0 || file > 7 || !Number.isFinite(rank) || rank < 1 || rank > 8) return null;
  return { file, rank };
}

function squareName(file: number, rank: number): string {
  return `${String.fromCharCode(97 + file)}${rank}`;
}

/** Parse a FEN piece-placement field into a `square → letter` map. */
export function parseFen(fen: string): Position | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return null;
  const [placement, turnChar, , , halfmoveStr, fullmoveStr] = parts;
  const pieces: PieceMap = {};
  const rows = placement.split('/');
  if (rows.length !== 8) return null;
  for (let i = 0; i < 8; i++) {
    const rank = 8 - i;
    let file = 0;
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '8') {
        file += parseInt(ch, 10);
      } else {
        if (file > 7) return null;
        pieces[squareName(file, rank)] = ch;
        file++;
      }
    }
    if (file !== 8) return null;
  }
  const turn: Color = turnChar === 'w' ? 'white' : 'black';
  return {
    pieces,
    turn,
    halfmove: parseInt(halfmoveStr ?? '0', 10) || 0,
    fullmove: parseInt(fullmoveStr ?? '1', 10) || 1,
  };
}

/** Serialize Position back to FEN. Castling field always '-' (no
 *  castling in makruk); en passant always '-'. */
export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const sq = squareName(file, rank);
      const p = pos.pieces[sq];
      if (p) {
        if (empty > 0) {
          row += String(empty);
          empty = 0;
        }
        row += p;
      } else {
        empty++;
      }
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return `${rows.join('/')} ${pos.turn === 'white' ? 'w' : 'b'} - - ${pos.halfmove} ${pos.fullmove}`;
}

// ─── Attack patterns ────────────────────────────────────────────────

/** All squares attacked by a piece on `square`, with current board
 *  occupancy. Includes own-side squares so callers can distinguish
 *  "attack" from "defended own piece" if needed. */
export function attacksFrom(
  pieces: PieceMap,
  square: string,
  piece: { role: Role; color: Color },
): string[] {
  const start = parseSquareCoords(square);
  if (!start) return [];
  const out: string[] = [];

  const push = (f: number, r: number) => {
    if (f >= 0 && f <= 7 && r >= 1 && r <= 8) out.push(squareName(f, r));
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
      const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [df, dr] of dirs) {
        for (let i = 1; i < 8; i++) {
          const f = start.file + df * i;
          const r = start.rank + dr * i;
          if (f < 0 || f > 7 || r < 1 || r > 8) break;
          const sq = squareName(f, r);
          out.push(sq);
          if (pieces[sq]) break;
        }
      }
      break;
    }
    case 'bia': {
      const fwd = piece.color === 'white' ? 1 : -1;
      push(start.file - 1, start.rank + fwd);
      push(start.file + 1, start.rank + fwd);
      break;
    }
  }
  return out;
}

/** Is `square` attacked by ANY piece of `byColor` in this position? */
export function isAttacked(pieces: PieceMap, square: string, byColor: Color): boolean {
  for (const [sq, letter] of Object.entries(pieces)) {
    const p = letterToPiece(letter);
    if (!p || p.color !== byColor) continue;
    if (attacksFrom(pieces, sq, p).includes(square)) return true;
  }
  return false;
}

/** Locate the king of `color`. null if missing (illegal but defensive). */
export function findKing(pieces: PieceMap, color: Color): string | null {
  for (const [sq, letter] of Object.entries(pieces)) {
    const p = letterToPiece(letter);
    if (p && p.color === color && p.role === 'king') return sq;
  }
  return null;
}

export function isInCheck(pos: Position, color: Color): boolean {
  const king = findKing(pos.pieces, color);
  if (!king) return false;
  const enemy: Color = color === 'white' ? 'black' : 'white';
  return isAttacked(pos.pieces, king, enemy);
}

// ─── Move generation ────────────────────────────────────────────────

/** Pseudo-legal moves from a square — does not filter out moves that
 *  leave own king in check. Caller filters via `isLegalMove`. */
export function pseudoMovesFrom(pos: Position, from: string): string[] {
  const letter = pos.pieces[from];
  if (!letter) return [];
  const piece = letterToPiece(letter);
  if (!piece) return [];
  if (piece.color !== pos.turn) return [];

  // Base targets from attack pattern (these are squares the piece can
  // CAPTURE on). Bia is the special case: its attack squares and its
  // movement squares differ.
  const out: string[] = [];

  if (piece.role === 'bia') {
    const coords = parseSquareCoords(from)!;
    const fwd = piece.color === 'white' ? 1 : -1;
    // Push forward 1 if empty (no double push in makruk).
    const pushTo = squareName(coords.file, coords.rank + fwd);
    if (coords.rank + fwd >= 1 && coords.rank + fwd <= 8 && !pos.pieces[pushTo]) {
      out.push(pushTo);
    }
    // Diagonal captures.
    for (const df of [-1, 1]) {
      const f = coords.file + df;
      const r = coords.rank + fwd;
      if (f < 0 || f > 7 || r < 1 || r > 8) continue;
      const sq = squareName(f, r);
      const occ = pos.pieces[sq];
      if (occ && letterToPiece(occ)?.color !== piece.color) out.push(sq);
    }
  } else {
    // For all other pieces, attack squares = movement squares modulo
    // friendly-occupancy filtering.
    for (const target of attacksFrom(pos.pieces, from, piece)) {
      const occ = pos.pieces[target];
      if (occ && letterToPiece(occ)?.color === piece.color) continue;
      out.push(target);
    }
  }
  return out;
}

/** Apply a move WITHOUT legality check. Used internally; callers
 *  should validate via `applyMove` which checks legality first. */
function applyUnchecked(pos: Position, from: string, to: string, promotion?: string): Position {
  const pieces: PieceMap = { ...pos.pieces };
  const moving = pieces[from];
  const captured = pieces[to];
  delete pieces[from];

  // Bia promotion: makruk promotes at rank 6 (white) / rank 3 (black).
  // The `promotion` UCI suffix is accepted but ignored on non-promotion
  // squares — geometry alone decides whether the bia upgrades.
  const movingPiece = letterToPiece(moving);
  void promotion;
  if (movingPiece?.role === 'bia') {
    const toCoords = parseSquareCoords(to)!;
    const promotesAt = movingPiece.color === 'white' ? 6 : 3;
    if (toCoords.rank === promotesAt) {
      pieces[to] = pieceToLetter('met', movingPiece.color);
    } else {
      pieces[to] = moving;
    }
  } else {
    pieces[to] = moving;
  }

  const turn: Color = pos.turn === 'white' ? 'black' : 'white';
  const halfmove =
    movingPiece?.role === 'bia' || captured ? 0 : pos.halfmove + 1;
  const fullmove = pos.turn === 'black' ? pos.fullmove + 1 : pos.fullmove;
  return { pieces, turn, halfmove, fullmove };
}

export type ApplyResult =
  | { ok: true; position: Position }
  | { ok: false; reason: string };

/** Validate + apply a UCI move ("e2e4", or "e7e8m" for promotion). */
export function applyMove(pos: Position, uci: string): ApplyResult {
  if (uci.length < 4) return { ok: false, reason: 'uci_short' };
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4) : undefined;

  if (!parseSquareCoords(from) || !parseSquareCoords(to)) {
    return { ok: false, reason: 'square_invalid' };
  }
  const movingLetter = pos.pieces[from];
  if (!movingLetter) return { ok: false, reason: 'empty_from' };
  const piece = letterToPiece(movingLetter);
  if (!piece) return { ok: false, reason: 'bad_piece_letter' };
  if (piece.color !== pos.turn) return { ok: false, reason: 'not_your_turn' };

  const pseudo = pseudoMovesFrom(pos, from);
  if (!pseudo.includes(to)) {
    return { ok: false, reason: 'illegal_target' };
  }

  // Check that move doesn't leave own king in check.
  const candidate = applyUnchecked(pos, from, to, promotion);
  if (isInCheck(candidate, piece.color)) {
    return { ok: false, reason: 'leaves_king_in_check' };
  }
  return { ok: true, position: candidate };
}

/** Enumerate every legal UCI move for the side to move. Returns an
 *  empty array when the side is checkmated or stalemated. */
export function listLegalMoves(pos: Position): string[] {
  const out: string[] = [];
  for (const [sq, letter] of Object.entries(pos.pieces)) {
    const piece = letterToPiece(letter);
    if (!piece || piece.color !== pos.turn) continue;
    for (const target of pseudoMovesFrom(pos, sq)) {
      const candidate = applyUnchecked(pos, sq, target);
      if (!isInCheck(candidate, piece.color)) {
        out.push(sq + target);
      }
    }
  }
  return out;
}

/** Are there ANY legal moves for the side to move? Used for stalemate
 *  / checkmate detection. */
export function hasLegalMove(pos: Position): boolean {
  for (const [sq, letter] of Object.entries(pos.pieces)) {
    const piece = letterToPiece(letter);
    if (!piece || piece.color !== pos.turn) continue;
    for (const target of pseudoMovesFrom(pos, sq)) {
      const candidate = applyUnchecked(pos, sq, target);
      if (!isInCheck(candidate, piece.color)) return true;
    }
  }
  return false;
}

export type Terminal =
  | { state: 'checkmate'; loser: Color }
  | { state: 'stalemate' }
  | { state: 'ongoing' };

/** Classify the position after the last move applied. */
export function classify(pos: Position): Terminal {
  if (hasLegalMove(pos)) return { state: 'ongoing' };
  if (isInCheck(pos, pos.turn)) return { state: 'checkmate', loser: pos.turn };
  return { state: 'stalemate' };
}
