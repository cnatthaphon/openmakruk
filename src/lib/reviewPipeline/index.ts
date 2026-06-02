// Review → puzzle pipeline — public facade (issue #19).
//
// This is the ONLY module UI code should import. It re-exports the
// contracts + the default-wired runtime / extractor / repository, and
// offers a convenience that runs the whole vertical for one reviewed
// position. The UI never imports a concrete ReviewRuntime, the engine,
// the verifier, or the puzzle store directly — it depends on these
// contracts, so the analysis runtime + storage target stay swappable.

import type { AnnotatedMove } from '../review';
import { newLocalGameId } from '../stats';
import type { PromoteResult, PuzzleQualitySpec } from './contracts';
import { clientReviewRuntime } from './clientReviewRuntime';
import { localPuzzleRepository } from './localPuzzleRepository';
import { extractPuzzleCandidates } from './extractor';
import { DEFAULT_PUZZLE_QUALITY_SPEC, validatePuzzleQualitySpec } from './spec';

// Contracts + building blocks (re-exported for consumers + tests).
export * from './contracts';
export { extractPuzzleCandidates } from './extractor';
export { DEFAULT_PUZZLE_QUALITY_SPEC, validatePuzzleQualitySpec } from './spec';
export { clientReviewRuntime, ClientReviewRuntime } from './clientReviewRuntime';
export { localPuzzleRepository, LocalPuzzleRepository } from './localPuzzleRepository';

export type PromoteReviewedOptions = {
  /** Canonical id of the source game (GameRecord.id) when known. When
   *  omitted, a per-call id is generated — never a shared constant, so
   *  provenance always points at one game. */
  sourceGameId?: string;
  authorName?: string;
  userSide?: 'white' | 'black' | null;
  result?: string;
  /** Override the extraction policy; defaults to the validated default. */
  spec?: PuzzleQualitySpec;
};

/**
 * Promote a single reviewed position (one AnnotatedMove from the Game
 * Report) into a saved puzzle, through the full contract pipeline:
 *   lift → extract(spec) → repository.promote
 *
 * Returns the promote result, or a `{ ok: false }` carrying why the
 * position didn't qualify under the spec.
 */
export async function promoteReviewedPosition(
  move: AnnotatedMove,
  opts: PromoteReviewedOptions = {},
): Promise<PromoteResult> {
  // Validate the spec once at the boundary — the extractor assumes a
  // valid spec. A bad custom spec is a caller bug, surfaced clearly.
  const specCheck = validatePuzzleQualitySpec(opts.spec ?? DEFAULT_PUZZLE_QUALITY_SPEC);
  if (!specCheck.ok) {
    return { ok: false, reason: `invalid quality spec: ${specCheck.errors.join('; ')}` };
  }

  const game = await clientReviewRuntime.fromAnnotatedMoves([move], {
    // A missing id falls back to a per-call id, NOT a shared constant,
    // so a promoted puzzle's provenance always identifies one game.
    sourceGameId: opts.sourceGameId || newLocalGameId(),
    userSide: opts.userSide,
    result: opts.result,
  });

  const candidates = extractPuzzleCandidates(game, specCheck.spec);
  const candidate = candidates.find((c) => c.sourcePly === move.ply);
  if (!candidate) {
    return { ok: false, reason: 'ตำแหน่งนี้ไม่ผ่านเกณฑ์คุณภาพปริศนา' };
  }

  return localPuzzleRepository.promote(candidate, { authorName: opts.authorName });
}
