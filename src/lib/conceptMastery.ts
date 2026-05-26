// Concept motif detection over reviewed games.
//
// The coach/motifs registry already knows how to detect fork / capture
// / check / hangingTarget / develop / promotion / mate from a single
// move. This module:
//
//   1. For each AnnotatedMove produced by analyzeGame(), build a
//      DetectCtx and run every registered motif detector. Capture
//      which motif kinds the move triggered.
//   2. Persist aggregate counts per user side (separate from the
//      opponent's motifs — we care about what YOU played).
//   3. Expose totals to the Profile UI so "fork mastery: 12 played
//      in 20 reviewed games" reads at a glance.
//
// Storage extends openmakruk_review_mastery (Phase 20). We don't
// introduce a new store — the existing per-review summary just gains
// a `motifs` field.

import './coach/motifs'; // side-effect: registers every motif def
import { listMotifs } from './coach/registry';
import type { MotifKind } from './coach/types';
import { fenToPieceMap } from './makruk';
import { letterToPiece } from './chessAttacks';
import type { AnnotatedMove } from './review';

export type MotifTotals = Partial<Record<MotifKind, number>>;

/** Detect every motif triggered by a single annotated move. Returns
 *  the list of kinds (e.g. ['capture', 'fork']) — duplicates suppressed
 *  per move. */
export function motifsForMove(m: AnnotatedMove): MotifKind[] {
  const from = m.uci.slice(0, 2);
  const to = m.uci.slice(2, 4);
  const before = fenToPieceMap(m.fenBefore);
  const after = fenToPieceMap(m.fenAfter);
  const moverLetter = before[from];
  const moverPiece = moverLetter ? letterToPiece(moverLetter) : null;
  if (!moverPiece) return [];
  const ctx = {
    fenBefore: m.fenBefore,
    fenAfter: m.fenAfter,
    before,
    after,
    moveUci: m.uci,
    from,
    to,
    mover: moverPiece,
    scoreCpAfter: m.evalAfter.scoreCp,
    mateInAfter: m.evalAfter.mateIn,
  };
  const triggered = new Set<MotifKind>();
  for (const def of listMotifs()) {
    try {
      const result = def.detect(ctx);
      if (!result) continue;
      const arr = Array.isArray(result) ? result : [result];
      for (const r of arr) triggered.add(r.kind);
    } catch {
      // Detector failure is non-fatal — skip and continue.
    }
  }
  return Array.from(triggered);
}

/** Sum motif counts across all moves the user played in the given
 *  annotated game. Opponent moves don't count toward the user's
 *  mastery — we only care about what YOU spotted/executed. */
export function motifTotalsForUser(
  moves: AnnotatedMove[],
  userSide: 'white' | 'black',
): MotifTotals {
  const totals: MotifTotals = {};
  for (const m of moves) {
    if (m.side !== userSide) continue;
    for (const kind of motifsForMove(m)) {
      totals[kind] = (totals[kind] ?? 0) + 1;
    }
  }
  return totals;
}

/** Thai-language motif labels for the Profile dashboard. */
export const MOTIF_LABELS: Record<MotifKind, string> = {
  capture: '🎯 Capture',
  check: '⚠️ Check',
  mate: '👑 Mate',
  mateThreat: '🔥 Mate threat',
  fork: '🪝 Fork',
  hangingTarget: '🎣 Hanging',
  develop: '🚀 Develop',
  promotion: '⬆️ Promotion',
};
