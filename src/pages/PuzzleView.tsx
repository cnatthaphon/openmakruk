// Single-puzzle player.
//
// Flow:
//   1. Load ffish, set up an internal board at the puzzle's start FEN
//   2. Show the position with the user's side to move
//   3. User drags a move via chessground (Board.tsx)
//   4. Validate against solution[currentStep]:
//        - correct → play solution[currentStep+1] as opponent reply,
//                    advance to currentStep+2, repeat until done
//        - wrong   → flash red, increment attempts, allow retry
//   5. On finish → record solve in localStorage + offer "next puzzle"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../components/Board';
import {
  loadFfish,
  parseLegalMoves,
  parseUci,
  type Square,
} from '../lib/makruk';
import {
  isPuzzleSolved,
  loadPuzzleProgress,
  recordPuzzleSolve,
  savePuzzleProgress,
} from '../lib/puzzleProgress';
import {
  loadPuzzleRating,
  recordAttempt,
  savePuzzleRating,
} from '../lib/puzzleRating';
import {
  applyOutcome,
  loadSchedule,
  outcomeToQuality,
  saveSchedule,
} from '../lib/spacedRepetition';
import type { Puzzle } from '../lib/puzzleSchema';

type Props = {
  puzzle: Puzzle;
  onClose: () => void;
  onNext: (() => void) | null;
};

type PuzzleState = {
  fen: string;
  legalMoves: string[];
  isCheck: boolean;
  step: number;          // index into puzzle.solution we're expecting
  attempts: number;      // total user moves tried this session
  wrongStreak: number;   // consecutive wrong moves (resets after correct)
  status: 'playing' | 'won' | 'failed';
  feedback: string | null;
  lastMove: { from: Square; to: Square } | null;
};

export function PuzzleView({ puzzle, onClose, onNext }: Props) {
  const [state, setState] = useState<PuzzleState | null>(null);
  const ffishRef = useRef<Awaited<ReturnType<typeof loadFfish>> | null>(null);
  const boardRef = useRef<any | null>(null);
  const [showHint, setShowHint] = useState(false);

  const userSide = puzzle.toMove;

  // Mount: load ffish, create internal board, sync initial state.
  useEffect(() => {
    let cancelled = false;
    loadFfish().then((ffish) => {
      if (cancelled) return;
      ffishRef.current = ffish;
      const board = new ffish.Board('makruk', puzzle.fen);
      boardRef.current = board;
      setState({
        fen: puzzle.fen,
        legalMoves: parseLegalMoves(board.legalMoves()),
        isCheck: board.isCheck(),
        step: 0,
        attempts: 0,
        wrongStreak: 0,
        status: 'playing',
        feedback: null,
        lastMove: null,
      });
    });
    return () => {
      cancelled = true;
      boardRef.current?.delete();
      boardRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id]);

  const handleUserMove = useCallback(
    (from: Square, to: Square) => {
      const ffish = ffishRef.current;
      const board = boardRef.current;
      if (!ffish || !board || !state || state.status !== 'playing') return;

      const expectedUci = puzzle.solution[state.step];
      const userUci = `${from}${to}`;
      // Allow promotion suffix — Makruk auto-promotes to Met (m) so the
      // ffish-side UCI may carry "m" while chessground emits the bare
      // 4-char form. Match on prefix.
      const isCorrect = expectedUci.startsWith(userUci);

      if (!isCorrect) {
        // Wrong: don't advance the ffish board, just flash feedback
        setState((s) =>
          !s
            ? s
            : {
                ...s,
                attempts: s.attempts + 1,
                wrongStreak: s.wrongStreak + 1,
                feedback: 'ผิดตา · ลองใหม่ได้',
                lastMove: { from, to },
              },
        );
        // Brief delay then clear the bad lastMove so the user can re-try
        setTimeout(() => {
          setState((s) =>
            !s ? s : { ...s, lastMove: null, feedback: null },
          );
        }, 900);
        return;
      }

      // Correct user move — apply it
      board.push(expectedUci);
      const nextStep = state.step + 1;

      // If there's an opponent reply queued, play it too
      const opponentUci = puzzle.solution[nextStep];
      if (opponentUci) {
        board.push(opponentUci);
      }

      const finishedAll = nextStep + (opponentUci ? 1 : 0) >= puzzle.solution.length;

      if (finishedAll) {
        const totalAttempts = state.attempts + 1;
        const usedHint = state.wrongStreak > 0 || showHint;
        recordSolve(puzzle.id, totalAttempts, usedHint);
        // Personal rating: first-try solve without hint = full credit;
        // anything else = half credit. Failure path goes through the
        // reveal-solution handler so we never double-count.
        const outcome = totalAttempts === 1 && !usedHint ? 'solved' : 'partial';
        recordCoachOutcome(puzzle.id, puzzle.rating, outcome);
        setState({
          fen: board.fen(),
          legalMoves: [],
          isCheck: board.isCheck(),
          step: puzzle.solution.length,
          attempts: state.attempts + 1,
          wrongStreak: 0,
          status: 'won',
          feedback: '✓ ถูกต้อง!',
          lastMove: parseUciToLastMove(opponentUci ?? expectedUci),
        });
      } else {
        // Multi-move puzzle: ready for next user move
        setState({
          fen: board.fen(),
          legalMoves: parseLegalMoves(board.legalMoves()),
          isCheck: board.isCheck(),
          step: nextStep + 1,
          attempts: state.attempts + 1,
          wrongStreak: 0,
          status: 'playing',
          feedback: '✓ ดี · ตาต่อไป',
          lastMove: parseUciToLastMove(opponentUci ?? expectedUci),
        });
        setTimeout(() => {
          setState((s) => (!s ? s : { ...s, feedback: null }));
        }, 1200);
      }
    },
    [puzzle, state, showHint],
  );

  const resetPuzzle = () => {
    const ffish = ffishRef.current;
    if (!ffish) return;
    boardRef.current?.delete();
    const board = new ffish.Board('makruk', puzzle.fen);
    boardRef.current = board;
    setState({
      fen: puzzle.fen,
      legalMoves: parseLegalMoves(board.legalMoves()),
      isCheck: board.isCheck(),
      step: 0,
      attempts: 0,
      wrongStreak: 0,
      status: 'playing',
      feedback: null,
      lastMove: null,
    });
    setShowHint(false);
  };

  const revealSolution = () => {
    const ffish = ffishRef.current;
    if (!ffish || !state) return;
    boardRef.current?.delete();
    const board = new ffish.Board('makruk', puzzle.fen);
    for (const move of puzzle.solution) board.push(move);
    boardRef.current = board;
    // Count the reveal as a "failed" outcome for rating + SR purposes
    // so the puzzle re-appears in the review queue and the user's
    // rating reflects difficulty honestly.
    recordCoachOutcome(puzzle.id, puzzle.rating, 'failed');
    setState({
      fen: board.fen(),
      legalMoves: [],
      isCheck: board.isCheck(),
      step: puzzle.solution.length,
      attempts: state.attempts,
      wrongStreak: state.wrongStreak,
      status: 'failed',
      feedback: 'เฉลย — ลองรอบหน้านะ',
      lastMove: parseUciToLastMove(puzzle.solution[puzzle.solution.length - 1]),
    });
  };

  const solvedBefore = useMemo(
    () => isPuzzleSolved(loadPuzzleProgress(), puzzle.id),
    [puzzle.id],
  );

  if (!state) {
    return (
      <div className="puzzle-view">
        <p className="puzzle-loading">กำลังโหลด ffish-es6 ...</p>
      </div>
    );
  }

  const flipped = userSide === 'black';
  const turn: 'white' | 'black' =
    state.step % 2 === 0 ? userSide : userSide === 'white' ? 'black' : 'white';

  return (
    <div className="puzzle-view">
      <button className="lesson-back" onClick={onClose}>
        ← กลับไปรายการปริศนา
      </button>
      <header className="puzzle-header">
        <h2>
          {puzzle.prompt}{' '}
          <span className="puzzle-rating-badge">{puzzle.rating}</span>
        </h2>
        <div className="puzzle-meta">
          <span className="label-aside">
            หมวด: {puzzle.category} · #{puzzle.id}
            {solvedBefore && ' · ✓ เคยทำเสร็จแล้ว'}
          </span>
        </div>
      </header>

      <Board
        fen={state.fen}
        legalMoves={state.legalMoves}
        flipped={flipped}
        disabled={state.status !== 'playing'}
        turn={turn}
        isCheck={state.isCheck}
        lastMove={state.lastMove}
        hint={null}
        onMove={handleUserMove}
      />

      <div className="puzzle-feedback">
        {state.feedback && (
          <div
            className={`puzzle-feedback-text ${
              state.status === 'won'
                ? 'good'
                : state.status === 'failed'
                  ? 'reveal'
                  : state.feedback.includes('✓')
                    ? 'good'
                    : 'bad'
            }`}
          >
            {state.feedback}
          </div>
        )}
        <div className="puzzle-stats">
          พยายาม: {state.attempts}{' '}
          {state.wrongStreak > 0 && `· ผิดต่อเนื่อง ${state.wrongStreak}`}
        </div>
      </div>

      {showHint && puzzle.hint && (
        <div className="puzzle-hint-box">
          💡 ใบ้: {puzzle.hint}
        </div>
      )}

      <div className="puzzle-controls">
        {state.status === 'playing' && (
          <>
            {puzzle.hint && !showHint && (
              <button onClick={() => setShowHint(true)}>💡 ขอใบ้</button>
            )}
            <button onClick={resetPuzzle} className="secondary">
              ↻ เริ่มใหม่
            </button>
            <button onClick={revealSolution} className="secondary">
              👁 ดูเฉลย
            </button>
          </>
        )}
        {(state.status === 'won' || state.status === 'failed') && (
          <>
            <button onClick={resetPuzzle} className="secondary">
              ↻ ลองอีกครั้ง
            </button>
            {onNext && (
              <button onClick={onNext}>ปริศนาถัดไป →</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function parseUciToLastMove(uci: string): { from: Square; to: Square } {
  const { from, to } = parseUci(uci);
  return { from, to };
}

function recordSolve(puzzleId: string, attempts: number, usedHint: boolean): void {
  const progress = loadPuzzleProgress();
  const updated = recordPuzzleSolve(progress, puzzleId, {
    solvedAt: Date.now(),
    attempts,
    usedHint,
  });
  savePuzzleProgress(updated);
}

/**
 * Update personal puzzle rating + SR schedule for one outcome.
 * Called from BOTH the successful-solve path and the reveal-solution
 * path. Idempotent — multiple solves of the same puzzle don't keep
 * inflating the rating because the schedule entry's repetition count
 * also advances on each successful repeat.
 */
function recordCoachOutcome(
  puzzleId: string,
  puzzleRating: number,
  outcome: 'solved' | 'partial' | 'failed',
): void {
  // Personal rating bump
  const rating = loadPuzzleRating();
  const nextRating = recordAttempt(rating, puzzleRating, outcome);
  savePuzzleRating(nextRating);

  // Spaced-repetition schedule update
  const schedule = loadSchedule();
  const quality = outcomeToQuality(outcome);
  const nextSchedule = applyOutcome(schedule, puzzleId, quality);
  saveSchedule(nextSchedule);
}
