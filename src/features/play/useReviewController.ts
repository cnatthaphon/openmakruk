// useReviewController — post-game review + variation-explorer state,
// extracted verbatim from App.tsx (issue #5).
//
// Owns the review-mode state (annotated moves, current ply, loading +
// progress, the canonical source-game id) and the lichess-style
// "what-if?" variation explorer, plus the two review effects and the
// six handlers. Everything moved as-is — same guards, same async
// flow, same dep arrays. App keeps the view derivation
// (viewFen / viewLastMove / viewLegalMoves) which reads the returned
// `reviewActive` / `reviewPly` / `reviewMoves` / `exploreVariation` /
// `reviewCurrent`.
//
// The heavy work (analyzeGame over the whole move log, mastery summary,
// journey emit, PV walking) stays in the libs it already called; this
// hook only orchestrates + holds the state.

import { useEffect, useState } from 'react';
import { analyzeGame, summarize, type AnnotatedMove } from '../../lib/review';
import { recordReviewSummary } from '../../lib/reviewMastery';
import { submitProgress } from '../../lib/journey';
import { pickReviewSourceGameId } from '../../lib/reviewPipeline/sourceGameId';
import { loadFfish } from '../../lib/makruk';
import { searchBestMove } from '../../lib/engine';
import { toast } from '../../components/Toast';
import { log } from '../../lib/log';
import type { UserStats } from '../../lib/stats';

/** An in-progress variation line on top of a reviewed position. */
export type ExploreVariation = {
  /** Ply being reviewed when exploration started — used to return cleanly. */
  fromPly: number;
  /** Starting FEN of the variation (= fenBefore of the move we're alt'ing). */
  fenStart: string;
  /** UCI moves played from fenStart in this exploration. */
  line: string[];
  /** Per-ply FENs (length = line.length + 1, fens[0] === fenStart). */
  fens: string[];
  /** Which step in the line is shown on the board (0 = fenStart). */
  cursor: number;
};

type FfishBoardLike = {
  fen: () => string;
  push: (uci: string) => boolean;
  delete: () => void;
} | null;

type ReviewControllerOpts = {
  /** ffish board (null until the engine boots). */
  board: FfishBoardLike;
  /** UCI move log of the game to review. */
  history: string[];
  /** Play mode — only 'play-white' / 'play-black' affect the
   *  reviewed side; anything else defaults to white. */
  mode: string;
  /** Local stats — `history[0]` is the most-recent recorded game,
   *  used to pick the canonical source id. */
  stats: UserStats;
  /** Current game's final FEN (state.fen). */
  stateFen: string | undefined;
  /** Stable per-current-game timestamp (gameStartedAtRef.current). */
  gameStartedAt: number;
};

export function useReviewController(opts: ReviewControllerOpts) {
  const { board, history, mode, stats, stateFen, gameStartedAt } = opts;

  const [reviewMoves, setReviewMoves] = useState<AnnotatedMove[]>([]);
  const [reviewPly, setReviewPly] = useState(0); // 0 = initial position
  const [reviewActive, setReviewActive] = useState(false);
  const [reviewSourceGameId, setReviewSourceGameId] = useState<string>('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [exploreVariation, setExploreVariation] = useState<ExploreVariation | null>(null);

  // Cancel any active exploration when the user steps to a different
  // ply in review (or exits review entirely) — the exploration was
  // scoped to a specific ply's fenBefore and would be confusing if it
  // persisted after the user moved on.
  useEffect(() => {
    if (!exploreVariation) return;
    if (!reviewActive) { setExploreVariation(null); return; }
    if (exploreVariation.fromPly !== reviewPly) setExploreVariation(null);
  }, [reviewPly, reviewActive, exploreVariation]);

  // Guard against losing in-flight analysis. Closing the tab mid-run
  // loses every annotation (the mastery summary only persists when
  // analyzeGame resolves). Surface the browser's "Leave site?" prompt.
  useEffect(() => {
    if (!reviewLoading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'การวิเคราะห์ยังไม่เสร็จ — ปิดตอนนี้จะเริ่มใหม่หมด';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [reviewLoading]);

  const reviewCurrent = reviewActive && reviewPly > 0 ? reviewMoves[reviewPly - 1] : null;

  const handleStartReview = async () => {
    if (reviewLoading || reviewActive) return;
    if (history.length === 0 || !board) return;
    setReviewLoading(true);
    setReviewProgress({ current: 0, total: history.length });
    const estimateSec = Math.max(5, Math.round(history.length * 0.25));
    toast.info(
      `🔍 กำลังวิเคราะห์ ${history.length} ตา (~${estimateSec} วินาที) · อย่าปิด tab จนกว่าจะเสร็จ · สรุป mastery จะบันทึกอัตโนมัติเมื่อจบ`,
    );
    log('review.start', { moves: history.length });
    try {
      const ffish = await loadFfish();
      const reviewBoard = new ffish.Board('makruk');
      try {
        const annotated = await analyzeGame(reviewBoard, history, (current, total) => {
          setReviewProgress({ current, total });
        });
        setReviewMoves(annotated);
        setReviewPly(annotated.length);
        setReviewActive(true);
        log('review.ready', { moves: annotated.length, summary: summarize(annotated) });
        const userColorForMastery: 'white' | 'black' =
          mode === 'play-white' ? 'white' :
          mode === 'play-black' ? 'black' : 'white';
        // Canonical source-game id for BOTH mastery + the review→puzzle
        // pipeline (PR #23 review — see pickReviewSourceGameId).
        const sourceGameId = pickReviewSourceGameId({
          latestRecorded: stats.history[0],
          moves: history,
          finalFen: stateFen ?? '',
          gameStartedAt,
        });
        const masteryState = recordReviewSummary(sourceGameId, userColorForMastery, annotated);
        setReviewSourceGameId(sourceGameId);
        // Feed the journey (issue #7): idempotent — re-reviewing the
        // same game replaces its contribution rather than adding it.
        const summary = masteryState.summaries.find((s) => s.gameId === sourceGameId);
        if (summary) {
          submitProgress({
            kind: 'review-summary',
            gameId: sourceGameId,
            at: Date.now(),
            motifTotals: summary.motifs,
          });
        }
      } finally {
        reviewBoard.delete();
      }
    } catch (err) {
      console.error('review failed:', err);
      log('review.error', { error: String(err) });
    } finally {
      setReviewLoading(false);
      setReviewProgress(null);
    }
  };

  const handleExitReview = () => {
    setReviewActive(false);
    setReviewMoves([]);
    setReviewPly(0);
  };

  const handleStartExploration = async () => {
    if (!reviewCurrent || exploreVariation) return;
    try {
      const ffish = await loadFfish();
      const tmpBoard = new ffish.Board('makruk', reviewCurrent.fenBefore);
      try {
        const ok = tmpBoard.push(reviewCurrent.bestMove);
        if (!ok) {
          log('explore.startFailed', { reason: 'illegal-best-move', move: reviewCurrent.bestMove });
          return;
        }
        const fenAfter = tmpBoard.fen();
        setExploreVariation({
          fromPly: reviewPly,
          fenStart: reviewCurrent.fenBefore,
          line: [reviewCurrent.bestMove],
          fens: [reviewCurrent.fenBefore, fenAfter],
          cursor: 1,
        });
        log('explore.start', { ply: reviewPly, line: reviewCurrent.bestMove });
      } finally {
        tmpBoard.delete();
      }
    } catch (err) {
      log('explore.error', { error: String(err) });
    }
  };

  /** Step the exploration cursor forward — if the line ends, ask the
   *  engine for the next best move from the current position. */
  const handleExploreNext = async () => {
    if (!exploreVariation) return;
    const ev = exploreVariation;
    if (ev.cursor < ev.line.length) {
      setExploreVariation({ ...ev, cursor: ev.cursor + 1 });
      return;
    }
    try {
      const result = await searchBestMove(ev.fens[ev.cursor], { depth: 12 });
      if (!result.bestMove || result.bestMove === '(none)' || result.bestMove === '0000') return;
      const ffish = await loadFfish();
      const tmpBoard = new ffish.Board('makruk', ev.fens[ev.cursor]);
      try {
        tmpBoard.push(result.bestMove);
        const nextFen = tmpBoard.fen();
        setExploreVariation({
          ...ev,
          line: [...ev.line, result.bestMove],
          fens: [...ev.fens, nextFen],
          cursor: ev.cursor + 1,
        });
      } finally {
        tmpBoard.delete();
      }
    } catch (err) {
      log('explore.next.error', { error: String(err) });
    }
  };

  const handleExplorePrev = () => {
    if (!exploreVariation || exploreVariation.cursor === 0) return;
    setExploreVariation({ ...exploreVariation, cursor: exploreVariation.cursor - 1 });
  };

  const handleExitExploration = () => {
    setExploreVariation(null);
  };

  return {
    reviewMoves,
    reviewPly,
    setReviewPly,
    reviewActive,
    reviewSourceGameId,
    reviewLoading,
    reviewProgress,
    exploreVariation,
    reviewCurrent,
    handleStartReview,
    handleExitReview,
    handleStartExploration,
    handleExploreNext,
    handleExplorePrev,
    handleExitExploration,
  };
}
