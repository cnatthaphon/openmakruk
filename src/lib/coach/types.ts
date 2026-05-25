// Shared types for the chess-coach motif system.
//
// Detectors are pure functions: given a snapshot of the position
// before + after a move, return zero or more motifs. They don't know
// about each other; cross-motif suppression (e.g. don't flag a
// hanging piece on the square that was just captured) happens inside
// each detector by inspecting the move context.

import type { Role } from '../lessonRules';
import type { PieceMap } from '../makruk';

export type DetectCtx = {
  fenBefore: string;
  fenAfter: string;
  before: PieceMap;
  after: PieceMap;
  /** UCI move that was made — e.g. "e3e4" or "d5d6m" for promotion. */
  moveUci: string;
  from: string;
  to: string;
  /** The piece that moved. */
  mover: { role: Role; color: 'white' | 'black' };
  /** Engine's centipawn eval AFTER the move, from side-to-move POV. */
  scoreCpAfter?: number;
  /** Engine's mate-in count AFTER the move. */
  mateInAfter?: number;
};

// ─── Motif discriminated union ─────────────────────────────────────
//
// Each variant is the SAME shape it had pre-refactor so chessCoach's
// public CoachOutput.motifs stays type-compatible with consumers.

export type CoachMotif =
  | {
      kind: 'capture';
      victim: Role;
      square: string;
      isFree: boolean;
      isEqualOrBetterTrade: boolean;
    }
  | { kind: 'check'; attackerSquare: string; attackerRole: Role }
  | { kind: 'mate' }
  | { kind: 'mateThreat'; inMoves: number }
  | {
      kind: 'fork';
      attackerSquare: string;
      attackerRole: Role;
      targets: { square: string; role: Role; value: number }[];
    }
  | { kind: 'hangingTarget'; square: string; role: Role; defendersCount: number }
  | { kind: 'develop'; role: Role; from: string; to: string }
  | { kind: 'promotion'; from: string; to: string };

export type MotifKind = CoachMotif['kind'];
