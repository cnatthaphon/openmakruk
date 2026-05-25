// Chess Coach — rule-based, Thai-language move explainer.
//
// For each move the engine recommends, we explain WHY it's a good
// move by running registered MOTIF detectors over the position before
// and after. Each detector lives in src/lib/coach/motifs/*.ts and
// registers itself via side-effect import; this file is the
// orchestrator that:
//
//   1. Asks every detector "what do you see in this move?"
//   2. Collects the motifs into a single list
//   3. Sorts by motif priority (mate first, develop last)
//   4. Stitches Thai sentences together via each motif's format()
//   5. Infers an overall recommendation strength
//
// No LLM. No vector DB. Just chess rules + Thai sentence templates.
// Adding a new motif = drop a new file in coach/motifs/. The
// orchestrator and consumers don't change.

import { letterToPiece, piecesFromFen } from './chessAttacks';
import { parseUci } from './makruk';
import { listMotifs, findMotifDef } from './coach/registry';
import './coach/motifs';
import type { CoachMotif, DetectCtx } from './coach/types';

export type { CoachMotif } from './coach/types';

export type CoachInput = {
  fenBefore: string;
  fenAfter: string;
  /** UCI move like "e3e4" or "d5d6m" for promotion. */
  moveUci: string;
  /** Engine's centipawn eval AFTER the move, from side-to-move POV. */
  scoreCpAfter?: number;
  /** Engine's mate-in count AFTER the move (positive = side delivering). */
  mateInAfter?: number;
  /** Depth the engine reached. For surface display only. */
  depth?: number;
};

export type CoachOutput = {
  motifs: CoachMotif[];
  /** First sentence — the headline. */
  headline: string;
  /** Optional follow-on details, max 2-3 sentences. */
  details: string[];
  /** Eval string ("+0.35" / "M3") for surface. */
  evalLabel?: string;
  /** Recommendation strength inferred from eval + motifs. */
  strength: 'great' | 'good' | 'neutral';
};

export function explain(input: CoachInput): CoachOutput {
  const ctx = buildContext(input);
  if (!ctx) {
    // Position didn't parse or move references an empty square — bail
    // out with a generic "good move" rather than crashing the panel.
    return {
      motifs: [],
      headline: 'ตาเดินที่ดี',
      details: [],
      evalLabel: formatEval(input),
      strength: 'neutral',
    };
  }

  const motifs = runDetectors(ctx);
  const sentences = composeSentences(motifs);
  const evalLabel = formatEval(input);
  const strength = inferStrength(input, motifs);
  const [headline, ...details] = sentences;
  return {
    motifs,
    headline: headline ?? (evalLabel ? `ตาเดินนี้ทำให้สถานการณ์ดีขึ้น (${evalLabel})` : 'ตาเดินที่ดี'),
    details,
    evalLabel,
    strength,
  };
}

// ─── Pipeline ──────────────────────────────────────────────────────

function buildContext(input: CoachInput): DetectCtx | null {
  const before = piecesFromFen(input.fenBefore);
  const after = piecesFromFen(input.fenAfter);
  const { from, to } = parseUci(input.moveUci);
  const moverLetter = before[from];
  if (!moverLetter) return null;
  const moverPiece = letterToPiece(moverLetter);
  if (!moverPiece) return null;
  return {
    fenBefore: input.fenBefore,
    fenAfter: input.fenAfter,
    before,
    after,
    moveUci: input.moveUci,
    from,
    to,
    mover: moverPiece,
    scoreCpAfter: input.scoreCpAfter,
    mateInAfter: input.mateInAfter,
  };
}

function runDetectors(ctx: DetectCtx): CoachMotif[] {
  const out: CoachMotif[] = [];
  for (const def of listMotifs()) {
    const result = def.detect(ctx);
    if (result === null || result === undefined) continue;
    if (Array.isArray(result)) out.push(...result);
    else out.push(result);
  }
  return out;
}

function composeSentences(motifs: CoachMotif[]): string[] {
  // Pair each motif with its def's priority for stable ordering. Drop
  // motifs whose def somehow vanished (shouldn't happen, but defensive
  // — a stale type that's no longer registered should fail loudly via
  // missing format, not silently render undefined).
  const annotated = motifs
    .map((m) => {
      const def = findMotifDef(m.kind);
      return def ? { m, priority: def.priority, def } : null;
    })
    .filter((x): x is { m: CoachMotif; priority: number; def: ReturnType<typeof findMotifDef> & {} } => x !== null);
  annotated.sort((a, b) => a.priority - b.priority);
  return annotated.map(({ m, def }) => def.format(m));
}

function formatEval(input: CoachInput): string | undefined {
  if (typeof input.mateInAfter === 'number' && input.mateInAfter !== 0) {
    return `M${Math.abs(input.mateInAfter)}`;
  }
  if (typeof input.scoreCpAfter === 'number') {
    const pawns = input.scoreCpAfter / 100;
    return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
  }
  return undefined;
}

function inferStrength(
  input: CoachInput,
  motifs: CoachMotif[],
): CoachOutput['strength'] {
  for (const m of motifs) {
    const def = findMotifDef(m.kind);
    const hint = def?.strengthHint?.(m);
    if (hint === 'great') return 'great';
  }
  for (const m of motifs) {
    const def = findMotifDef(m.kind);
    const hint = def?.strengthHint?.(m);
    if (hint === 'good') return 'good';
  }
  if (typeof input.scoreCpAfter === 'number' && input.scoreCpAfter > 50) return 'good';
  return 'neutral';
}
