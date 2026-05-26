// Post-game move review: replays the game on a fresh ffish board,
// asks Stockfish to evaluate before/after each move at fixed depth,
// and classifies each move into one of five buckets the way chess.com
// / lichess do (best / good / inaccuracy / mistake / blunder).
//
// Output is consumed by App.tsx in "review mode": click any annotated
// move to jump the board to that ply, see the eval delta + engine's
// suggested best move.

import type { Board as FfishBoard } from 'ffish-es6';
import { getActiveEngine, searchBestMove } from './engine';
import { log } from './log';

// Fallback only — every registered engine declares `analysisDefaults`
// in its capabilities. Used when the active engine somehow surfaces
// without that field (shouldn't happen for registered engines; this
// is belt-and-braces).
const FALLBACK_ANALYSIS = { depth: 12 } as const;

export type Classification =
  | 'best'        // played the engine's #1 move (or delta ≤ 10cp)
  | 'good'        // small drift (11-50cp)
  | 'inaccuracy'  // 51-150cp
  | 'mistake'     // 151-300cp
  | 'blunder';    // >300cp or missed a forced mate

export type EvalPoint = {
  scoreCp?: number;
  mateIn?: number;
  depth: number;
};

export type AnnotatedMove = {
  ply: number;           // 1-indexed move number
  uci: string;           // user's UCI move
  side: 'white' | 'black';
  fenBefore: string;
  fenAfter: string;
  // Side-to-move's POV at both timestamps
  evalBefore: EvalPoint;
  evalAfter: EvalPoint;
  bestMove: string;      // engine's #1 at fenBefore
  delta: number;         // centipawn loss vs best (≥ 0)
  classification: Classification;
  isBest: boolean;       // played the engine's #1
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  best:       'ตาที่ดี',
  good:       'โอเค',
  inaccuracy: 'ไม่แม่นยำ',
  mistake:    'พลาด',
  blunder:    'ตาผิดร้ายแรง',
};

export const CLASSIFICATION_GLYPHS: Record<Classification, string> = {
  best:       '★',
  good:       '·',
  inaccuracy: '?!',
  mistake:    '?',
  blunder:    '??',
};

export const CLASSIFICATION_COLORS: Record<Classification, string> = {
  best:       '#8acf6a',
  good:       '#9aa68a',
  inaccuracy: '#e8c45a',
  mistake:    '#e89a5a',
  blunder:    '#e85a4a',
};

function classify(args: {
  delta: number;
  isBest: boolean;
  mateBefore?: number;
  mateAfter?: number;
}): Classification {
  const { delta, isBest, mateBefore, mateAfter } = args;
  if (isBest) return 'best';

  // If a forced mate for the side-to-move was on the board and the
  // played move threw it away, count as a blunder regardless of cp.
  if (
    typeof mateBefore === 'number' &&
    mateBefore > 0 &&
    (typeof mateAfter !== 'number' || mateAfter <= 0)
  ) {
    return 'blunder';
  }

  const d = Math.max(0, delta);
  if (d <= 10)  return 'best';
  if (d <= 50)  return 'good';
  if (d <= 150) return 'inaccuracy';
  if (d <= 300) return 'mistake';
  return 'blunder';
}

export type ProgressCallback = (current: number, total: number) => void;

/**
 * Annotate every move in `moves` (UCI). The caller must pass a fresh
 * ffish board parked at the starting position — we mutate it (push
 * each move in order). Returns one AnnotatedMove per move played.
 *
 * Two engine searches per move (before + after = ~2× depth-12 search
 * time), so plan ~150-300ms per move on a modern desktop. A 50-move
 * game ≈ 25-30s. The optional progress callback fires after each move
 * so the UI can show a bar.
 */
export async function analyzeGame(
  board: FfishBoard,
  moves: string[],
  onProgress?: ProgressCallback,
): Promise<AnnotatedMove[]> {
  // Read the analysis search opts from the active engine's capability
  // descriptor. Lets a future MCTS-based engine pass `{nodes: 4000}`
  // instead of `{depth: 12}` without touching this caller.
  const engine = await getActiveEngine();
  const searchOpts = engine.capabilities.analysisDefaults ?? FALLBACK_ANALYSIS;

  log('review.analyze.start', {
    moves: moves.length,
    engine: engine.id,
    searchOpts,
  });
  const result: AnnotatedMove[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const fenBefore = board.fen();
    const sideToMove: 'white' | 'black' = board.turn() ? 'white' : 'black';

    const before = await searchBestMove(fenBefore, searchOpts);

    board.push(move);
    const fenAfter = board.fen();

    const afterOpp = await searchBestMove(fenAfter, searchOpts);

    // afterOpp is from the OPPONENT's POV. Flip sign for the side that
    // just moved so we can compare apples to apples with `before`.
    const myScoreAfter =
      afterOpp.scoreCp !== undefined ? -afterOpp.scoreCp : undefined;
    const myMateAfter =
      afterOpp.mateIn !== undefined ? -afterOpp.mateIn : undefined;

    let delta = 0;
    if (typeof before.scoreCp === 'number' && typeof myScoreAfter === 'number') {
      delta = before.scoreCp - myScoreAfter;
    } else if (typeof before.mateIn === 'number' && before.mateIn > 0) {
      // Had a forced mate; if the move didn't preserve it, treat as
      // ~500cp loss for classification purposes.
      if (typeof myMateAfter !== 'number' || myMateAfter <= 0) delta = 500;
    }

    const isBest =
      before.bestMove === move ||
      (typeof before.bestMove === 'string' &&
        before.bestMove.length >= 4 &&
        move.startsWith(before.bestMove.slice(0, 4)));

    result.push({
      ply: i + 1,
      uci: move,
      side: sideToMove,
      fenBefore,
      fenAfter,
      evalBefore: {
        scoreCp: before.scoreCp,
        mateIn: before.mateIn,
        depth: before.depth ?? 0,
      },
      bestMove: before.bestMove,
      evalAfter: {
        scoreCp: myScoreAfter,
        mateIn: myMateAfter,
        depth: afterOpp.depth ?? 0,
      },
      delta,
      classification: classify({
        delta,
        isBest,
        mateBefore: before.mateIn,
        mateAfter: myMateAfter,
      }),
      isBest,
    });

    onProgress?.(i + 1, moves.length);
  }

  log('review.analyze.done', {
    moves: result.length,
    summary: summarize(result),
  });
  return result;
}

export function summarize(moves: AnnotatedMove[]): Record<Classification, number> {
  const totals: Record<Classification, number> = {
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
  for (const m of moves) totals[m.classification]++;
  return totals;
}

/**
 * Per-classification "quality score" used to compute Accuracy %.
 * Calibrated so a perfect game ≈ 100 and a game of pure blunders ≈ 15.
 * Same approach lichess uses (different curve, same idea): squash
 * move-quality into a single comparable number across games.
 */
const QUALITY_SCORE: Record<Classification, number> = {
  best:       100,
  good:        90,
  inaccuracy:  65,
  mistake:     40,
  blunder:     15,
};

/** Average move-quality across a side's moves, on 0-100 scale. */
export function accuracyFor(
  moves: AnnotatedMove[],
  side: 'white' | 'black',
): number {
  const sideMoves = moves.filter((m) => m.side === side);
  if (sideMoves.length === 0) return 100;
  const sum = sideMoves.reduce((s, m) => s + QUALITY_SCORE[m.classification], 0);
  return Math.round(sum / sideMoves.length);
}

/** Average centipawn loss per move, on a side. Lower = better. */
export function acplFor(
  moves: AnnotatedMove[],
  side: 'white' | 'black',
): number {
  const sideMoves = moves.filter((m) => m.side === side);
  if (sideMoves.length === 0) return 0;
  const sum = sideMoves.reduce((s, m) => s + m.delta, 0);
  return Math.round(sum / sideMoves.length);
}

/** Count moves by classification, restricted to one side. */
export function classCountFor(
  moves: AnnotatedMove[],
  side: 'white' | 'black',
): Record<Classification, number> {
  const totals: Record<Classification, number> = {
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
  for (const m of moves) {
    if (m.side === side) totals[m.classification]++;
  }
  return totals;
}

/**
 * Pick the N most impactful "key moments" of a player's game —
 * highest-delta inaccuracies / mistakes / blunders, sorted worst
 * first. Used by GameReport to surface the 3-5 moves worth learning
 * from, instead of forcing the user to scan every ply.
 */
export function keyMoments(
  moves: AnnotatedMove[],
  side: 'white' | 'black',
  n: number = 3,
): AnnotatedMove[] {
  const significant: Classification[] = ['inaccuracy', 'mistake', 'blunder'];
  return moves
    .filter((m) => m.side === side && significant.includes(m.classification))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, n);
}

/**
 * Phase-aware Thai narrative commentary for a single annotated move.
 * The KeyMomentCard already shows "ที่เล่น X / ควรเล่น Y / เสีย N คะแนน"
 * — this layer adds the *why this is interesting* line so a learner
 * doesn't have to translate cp losses into intuition themselves.
 *
 * Phase boundaries are ply-based (rough but cheap):
 *   ≤14 = opening, ≤30 = middlegame, >30 = endgame.
 * Matches typical Makruk game arc — Met development happens slower
 * than chess queens, so "opening" stretches a few moves longer.
 */
export function moveCommentary(move: AnnotatedMove): string {
  const phase: 'opening' | 'middle' | 'endgame' =
    move.ply <= 14 ? 'opening' : move.ply <= 30 ? 'middle' : 'endgame';

  switch (move.classification) {
    case 'best':
      return '✨ ตาที่ดีที่สุด · ไม่มีตาอื่นดีกว่านี้';
    case 'good':
      return '👍 ตาก็ดี · ใกล้เคียงตาที่ engine แนะนำ';
    case 'inaccuracy':
      return phase === 'opening'
        ? '🤔 opening ยังไม่แม่น · มี opening ที่เก่งกว่า'
        : phase === 'middle'
          ? '🤔 ตาไม่แม่นยำ · มีตา tactical ที่ดีกว่า'
          : '🤔 endgame ยังไม่ถูกต้อง · เทคนิคปลายเกมต้องแม่นกว่านี้';
    case 'mistake':
      return phase === 'opening'
        ? '😬 พลาด opening · เปิดทางให้คู่ต่อสู้พัฒนาง่าย'
        : phase === 'middle'
          ? '😬 พลาดในช่วงกลางเกม · เสียจังหวะ tactical'
          : '😬 พลาดท้ายเกม · endgame ต้องการความแม่นยำ';
    case 'blunder':
      return phase === 'opening'
        ? '💔 เริ่มต้นผิดมาก · ระวัง opening trap ในครั้งหน้า'
        : phase === 'middle'
          ? '💔 พลาดร้ายแรงในกลางเกม · เปิดทางให้คู่ต่อสู้บุก'
          : '💔 พลาด endgame · เกือบทำได้ แต่...';
  }
}

/** Format an EvalPoint as a short human string: "+0.45" or "M3" or "—". */
export function formatEval(e?: EvalPoint | null): string {
  if (!e) return '—';
  if (typeof e.mateIn === 'number' && e.mateIn !== 0) {
    return e.mateIn > 0 ? `M${e.mateIn}` : `-M${Math.abs(e.mateIn)}`;
  }
  if (typeof e.scoreCp === 'number') {
    const pawns = e.scoreCp / 100;
    return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
  }
  return '—';
}
