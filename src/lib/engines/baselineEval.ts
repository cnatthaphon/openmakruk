// Shared static evaluation for the AI Lab baseline engines (minimax +
// the MCTS rollout cap). Pure: FEN in, white-POV centipawn-ish score
// out. Kept deliberately simple — material + a small center nudge — so
// the Lab's reference engines stay readable. Stronger engines (NNUE,
// AlphaZero value head) replace this entirely.

import { fenToPieceMap, letterToRole } from '../../core';
import type { Role } from '../../core';

/** Makruk piece values. Khon (bishop-like) outranks Met (the weak
 *  queen) in Makruk — mirrors scoredBot's ordering. */
export const VALUE: Record<Role, number> = {
  king: 0,
  met: 250,
  khon: 350,
  knight: 300,
  rook: 500,
  bia: 100,
};

const FILES = 'abcdefgh';

/** Center-control nudge: closer to the central four squares = small
 *  bonus (0..~21). */
export function centerBonus(square: string): number {
  const f = FILES.indexOf(square[0]);
  const r = Number(square[1]) - 1;
  if (f < 0 || r < 0) return 0;
  const df = Math.abs(f - 3.5);
  const dr = Math.abs(r - 3.5);
  return (7 - (df + dr)) * 3;
}

/** White-POV static evaluation of a FEN (positive = white better). */
export function staticEval(fen: string): number {
  const pieces = fenToPieceMap(fen);
  let score = 0;
  for (const [sq, letter] of Object.entries(pieces)) {
    const parsed = letterToRole(letter);
    if (!parsed) continue;
    const v = VALUE[parsed.role] + centerBonus(sq);
    score += parsed.color === 'white' ? v : -v;
  }
  return score;
}
