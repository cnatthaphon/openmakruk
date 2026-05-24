// Move scorers — the building blocks for score-based personality bots.
//
// Each scorer is a pure function: (fen, move) → number ∈ [-1, 1] (or
// at least roughly normalized). A `Personality` is a weighted sum
// over these. The point is to keep PERSONALITIES as data (a Record of
// weights), not subclasses — so adding "more bot variety" later =
// appending one line to the catalog, not writing a class.
//
// Contract:
//   1. A scorer SHOULD return a value in approximately [0, 1] so
//      weights can be small numbers like 0.3 without one component
//      drowning others. material is the exception (signed, ±1).
//   2. A scorer MUST NOT mutate the board it's given.
//   3. A scorer that needs to inspect after-move state must clone
//      the position itself — see `withMovePushed`.
//   4. Scorers are sync. If you need async work, do it once outside
//      and pass results in via closure.
//
// Adding a new scorer:
//   - Implement the function below.
//   - Add the key to SCORER_KEYS (compile-time enforces personalities
//     reference only known scorers).
//   - Add a default weight of 0 to PERSONALITY_TEMPLATE in personalities.ts
//     so existing personalities don't break.

import { fenToPieceMap, type PieceMap } from '../makruk';
import { PIECE_VALUE, letterToPiece } from '../chessAttacks';
import type { Color } from '../lessonRules';

// Each scorer is { fen, move } → score. ffish board is passed for
// scorers that want to push/pop. Type stays loose because ffish-es6
// doesn't ship its own types.
export type ScorerCtx = {
  fen: string;
  pieceMap: PieceMap;
  /** Side-to-move at this fen. */
  sideToMove: Color;
  /** Cheap, cached: a fresh ffish board (already constructed by the
   *  bot) the scorer may push/pop on. Must restore state before return. */
  board: any;
};

export type Scorer = (ctx: ScorerCtx, move: string) => number;

export const SCORER_KEYS = [
  'material',
  'attack',
  'defense',
  'center',
  'aggression',
  'mobility',
  'randomness',
] as const;

export type ScorerKey = (typeof SCORER_KEYS)[number];

// ─── Helpers ───────────────────────────────────────────────────────

function parseSquare(sq: string): { file: number; rank: number } | null {
  if (sq.length < 2) return null;
  const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(sq[1], 10) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return { file, rank };
}

function isEnemy(letter: string, side: Color): boolean {
  const upper = letter === letter.toUpperCase();
  return side === 'white' ? !upper : upper;
}

function isOwn(letter: string, side: Color): boolean {
  const upper = letter === letter.toUpperCase();
  return side === 'white' ? upper : !upper;
}

// Push a move, run f, pop. Defensive: ffish.push doesn't always have a
// matching pop in legacy builds — we fall back to recreating the board
// inside `f` if needed. For now we use board.push + board.pop().
function withMovePushed<T>(board: any, move: string, f: () => T): T {
  board.push(move);
  try {
    return f();
  } finally {
    board.pop();
  }
}

// ─── Scorers ───────────────────────────────────────────────────────

/** Material: signed delta in own-side piece value. Capture = positive. */
const material: Scorer = (ctx, move) => {
  const to = move.slice(2, 4);
  const target = ctx.pieceMap[to];
  if (!target) return 0;
  if (!isEnemy(target, ctx.sideToMove)) return 0;
  const piece = letterToPiece(target);
  if (!piece) return 0;
  const value = PIECE_VALUE[piece.role] ?? 1;
  // Normalize: rook=5 is the biggest non-king capture. Map 0..5 → 0..1.
  return Math.min(value / 5, 1);
};

/** Attack: count enemy pieces attacked by the *moving piece* after the
 *  move, normalized to 0..1. Doesn't double-count pieces already
 *  attacked before the move. Approximation — we count enemy occupancy
 *  on squares the moving piece can now reach. */
const attack: Scorer = (ctx, move) => {
  const dest = move.slice(2, 4);
  // Use ffish to push and count opponent attacks. As an approximation
  // we count the number of legal CAPTURE moves the side now opposing
  // would face — but that's the opponent's POV after the push. Simpler:
  // after the move, how many enemy pieces are on squares the moving
  // piece can now attack? Expensive without proper attack-from. Use
  // a heuristic: the destination square is forward and adjacent to
  // enemy pieces.
  const sq = parseSquare(dest);
  if (!sq) return 0;
  // Walk 8 neighbors of dest. Count enemy pieces.
  let enemyNeighbors = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = sq.file + df;
      const r = sq.rank + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const neighbor = String.fromCharCode(97 + f) + (r + 1);
      const occ = ctx.pieceMap[neighbor];
      if (occ && isEnemy(occ, ctx.sideToMove)) enemyNeighbors++;
    }
  }
  return Math.min(enemyNeighbors / 4, 1);
};

/** Defense: count of own pieces near the destination (proxy for being
 *  defended by nearby friends post-move). */
const defense: Scorer = (ctx, move) => {
  const dest = move.slice(2, 4);
  const sq = parseSquare(dest);
  if (!sq) return 0;
  let friendNeighbors = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = sq.file + df;
      const r = sq.rank + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const neighbor = String.fromCharCode(97 + f) + (r + 1);
      const occ = ctx.pieceMap[neighbor];
      if (occ && isOwn(occ, ctx.sideToMove)) friendNeighbors++;
    }
  }
  return Math.min(friendNeighbors / 4, 1);
};

/** Center: proximity of destination square to the central 4 squares
 *  (d4, d5, e4, e5). Pure geometry — no board lookup. */
const center: Scorer = (_ctx, move) => {
  const sq = parseSquare(move.slice(2, 4));
  if (!sq) return 0;
  const distFile = Math.abs(3.5 - sq.file);
  const distRank = Math.abs(3.5 - sq.rank);
  // Max Manhattan distance to center is 7 (corner). Invert and scale.
  return 1 - (distFile + distRank) / 7;
};

/** Aggression: distance toward enemy king side. White: higher rank
 *  better. Black: lower rank better. */
const aggression: Scorer = (ctx, move) => {
  const sq = parseSquare(move.slice(2, 4));
  if (!sq) return 0;
  return ctx.sideToMove === 'white' ? sq.rank / 7 : (7 - sq.rank) / 7;
};

/** Mobility: number of legal moves available *after* this move (more =
 *  more options = better). Capped at 1. */
const mobility: Scorer = (ctx, move) => {
  return withMovePushed(ctx.board, move, () => {
    const legal = ctx.board.legalMoves();
    const count = legal ? legal.split(' ').filter(Boolean).length : 0;
    // Typical mid-game ~30 moves; normalize.
    return Math.min(count / 30, 1);
  });
};

/** Randomness: pure noise. Adds exploration variety to deterministic
 *  scorers. */
const randomness: Scorer = () => Math.random();

export const SCORERS: Record<ScorerKey, Scorer> = {
  material,
  attack,
  defense,
  center,
  aggression,
  mobility,
  randomness,
};

/** Build a ScorerCtx from a fen. Use once per bot.search() call;
 *  pass to all scorer invocations. */
export function makeScorerCtx(fen: string, board: any): ScorerCtx {
  return {
    fen,
    pieceMap: fenToPieceMap(fen),
    sideToMove: fen.split(' ')[1] === 'w' ? 'white' : 'black',
    board,
  };
}
