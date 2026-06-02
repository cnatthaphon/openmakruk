// ClientReviewRuntime — the browser implementation of ReviewRuntime.
//
// Wraps the existing client review (`analyzeGame`, Fairy-Stockfish via
// ffish) and the coach motif detectors. Impure by design: it owns the
// engine + ffish. The pure extractor downstream depends only on the
// AnnotatedGame this produces — so swapping in a Worker- or
// AlphaZero-backed runtime later means writing a new class here, not
// touching the extractor or the UI.
//
// Two entry points share one lift step:
//   - analyze(GameLog)            — full path: run review, then lift.
//   - liftAnnotatedMoves(moves)   — adapter for callers that ALREADY
//                                   have AnnotatedMove[] (e.g. the
//                                   post-game Game Report). Avoids
//                                   re-running the engine; only applies
//                                   each best move (rules-level) to
//                                   detect motifs.

import { loadFfish, MAKRUK_START_FEN } from '../makruk';
import { analyzeGame, type AnnotatedMove } from '../review';
import { explain as coachExplain } from '../chessCoach';
import { log } from '../log';
import type {
  AnnotatedGame,
  AnnotatedPly,
  GameLog,
  ReviewRuntime,
  ReviewRuntimeCapabilities,
  RuntimeMeta,
} from './contracts';
import { REVIEW_PIPELINE_SCHEMA_VERSION } from './contracts';

/** The Makruk variant is fixed; bump if rules change in a way that
 *  invalidates previously-extracted candidates. */
const MAKRUK_RULES_VERSION = 'makruk-1';
const ANALYSIS_ENGINE_ID = 'fairy-stockfish';
/** Best-effort depth stamp for provenance — matches review's default. */
const ANALYSIS_DEPTH = 12;

function runtimeMeta(): RuntimeMeta {
  return {
    runtimeId: 'client',
    engineId: ANALYSIS_ENGINE_ID,
    engineVersion: 'ffish-es6',
    depth: ANALYSIS_DEPTH,
    rulesVersion: MAKRUK_RULES_VERSION,
  };
}

/**
 * Lift plain review output into pipeline AnnotatedPly[]:
 *   - motifs: run the coach on the BEST move (apply it to fenBefore via
 *     ffish, then detect) — this is the teaching line's motifs, which
 *     is what a puzzle built from this position should advertise.
 *   - bestLine: seed with [bestMove]. The repository deepens multi-move
 *     (mate-in-N) lines at promote time so analysis stays cheap.
 * Rules-level only — NO engine search here.
 */
async function liftAnnotatedMoves(moves: AnnotatedMove[]): Promise<AnnotatedPly[]> {
  const ffish = await loadFfish();
  const plies: AnnotatedPly[] = [];
  for (const m of moves) {
    let motifs: AnnotatedPly['motifs'] = [];
    const best = m.bestMove;
    if (best && best !== '(none)' && best !== '0000') {
      // Apply the best move to fenBefore to get the position the coach
      // needs. Pure rules application; guarded so a stale/illegal best
      // move just yields no motifs instead of throwing.
      const board = new ffish.Board('makruk', m.fenBefore);
      try {
        if (board.legalMoves().split(' ').includes(best)) {
          board.push(best);
          const out = coachExplain({
            fenBefore: m.fenBefore,
            fenAfter: board.fen(),
            moveUci: best,
            scoreCpAfter: m.evalAfter.scoreCp,
            mateInAfter: m.evalAfter.mateIn,
            depth: m.evalAfter.depth,
          });
          motifs = out.motifs;
        }
      } catch {
        // leave motifs empty — provenance is best-effort
      } finally {
        board.delete();
      }
    }
    plies.push({
      ...m,
      motifs,
      bestLine: best && best !== '(none)' && best !== '0000' ? [best] : [],
    });
  }
  return plies;
}

export class ClientReviewRuntime implements ReviewRuntime {
  readonly id = 'client';
  readonly engineId = ANALYSIS_ENGINE_ID;
  readonly capabilities: ReviewRuntimeCapabilities = {
    mate: true,
    multiPv: false,
    rulesVersion: MAKRUK_RULES_VERSION,
  };

  async analyze(
    logInput: GameLog,
    onProgress?: (done: number, total: number) => void,
  ): Promise<AnnotatedGame> {
    const ffish = await loadFfish();
    const startFen = logInput.startFen ?? MAKRUK_START_FEN;
    const board = new ffish.Board('makruk', startFen);
    let moves: AnnotatedMove[];
    try {
      moves = await analyzeGame(board, logInput.moves, onProgress);
    } finally {
      board.delete();
    }
    const plies = await liftAnnotatedMoves(moves);
    log('reviewPipeline.analyze', {
      sourceGameId: logInput.sourceGameId,
      plies: plies.length,
    });
    return {
      schemaVersion: REVIEW_PIPELINE_SCHEMA_VERSION,
      sourceGameId: logInput.sourceGameId,
      userSide: logInput.userSide ?? null,
      result: logInput.result ?? '*',
      plies,
      runtime: runtimeMeta(),
    };
  }

  /**
   * Build an AnnotatedGame from review output that already exists
   * (the Game Report holds `AnnotatedMove[]` from the live game). No
   * engine search — only motif lift. Lets the post-game UI feed the
   * pipeline without paying for a second full analysis.
   */
  async fromAnnotatedMoves(
    moves: AnnotatedMove[],
    meta: { sourceGameId: string; userSide?: 'white' | 'black' | null; result?: string },
  ): Promise<AnnotatedGame> {
    const plies = await liftAnnotatedMoves(moves);
    return {
      schemaVersion: REVIEW_PIPELINE_SCHEMA_VERSION,
      sourceGameId: meta.sourceGameId,
      userSide: meta.userSide ?? null,
      result: meta.result ?? '*',
      plies,
      runtime: runtimeMeta(),
    };
  }
}

/** Singleton — the registry-style default the facade hands out. */
export const clientReviewRuntime = new ClientReviewRuntime();
