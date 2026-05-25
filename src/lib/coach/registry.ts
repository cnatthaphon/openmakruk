// Motif registry — the contract that makes "drop a file, get a motif"
// work. Each motif file exports a MotifDef; the index file imports
// every motif file for its side effect; chessCoach.ts iterates the
// registry, runs detectors, sorts by priority, and stitches sentences.
//
// Why this pattern (consistent with engines/personalities/backends):
//   1. Adding a new motif = drop one file. No edits to chessCoach.ts.
//   2. Priorities live alongside the format string they affect, so
//      reviewers don't have to cross-reference 3 places to understand
//      "which sentence becomes the headline".
//   3. Detectors stay pure — they get DetectCtx, return motifs. No
//      shared mutable state between detectors.

import type { CoachMotif, DetectCtx, MotifKind } from './types';

export type MotifDef<T extends CoachMotif = CoachMotif> = {
  /** Discriminator — must match the motif this def returns. Used by
   *  chessCoach.format() to pair detector → formatter. */
  kind: MotifKind;
  /**
   * Display priority. Lower number = higher priority (shown first).
   * Mate=0, threats and checks low, positional motifs high. Used by
   * the sentence composer to pick the headline.
   */
  priority: number;
  /**
   * Pure function: given the move context, return zero, one, or many
   * motifs of this kind. Most detectors return at most one; we keep
   * the array shape uniform so fork-style "report N variants" works.
   */
  detect(ctx: DetectCtx): T | T[] | null;
  /** Render this motif to a Thai sentence. */
  format(motif: T): string;
  /**
   * Optional strength hint — if any motif in the result is great or
   * good, the overall recommendation is bumped accordingly. Lets a
   * mate motif declare itself as "great" without touching the
   * orchestrator's switch.
   */
  strengthHint?(motif: T): 'great' | 'good' | undefined;
};

// Internal store — a list keyed by motif kind. We allow at most one
// MotifDef per kind so the contract stays unambiguous.
const registry = new Map<MotifKind, MotifDef>();

export function registerMotif<T extends CoachMotif>(def: MotifDef<T>): void {
  // Cast through unknown — the storage type is the union, but each
  // def is parameterized by a specific kind. The detect/format
  // functions are only ever called via this kind, so the narrowing
  // is safe by construction.
  registry.set(def.kind, def as unknown as MotifDef);
}

export function listMotifs(): MotifDef[] {
  return Array.from(registry.values());
}

export function findMotifDef(kind: MotifKind): MotifDef | undefined {
  return registry.get(kind);
}
