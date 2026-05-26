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
import { haptic } from '../lib/haptic';
import { getBackend } from '../lib/backend';
import { loadSession } from '../lib/backend/cloudSession';
import { toast } from '../components/Toast';
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

  // Code-golf mode — user plays ANY legal move, scored by ply count.
  // Available only on mate-1/mate-2 puzzles when cloud sync is on, so
  // the server can verify the attempt + track the leaderboard.
  const golfEligible =
    (puzzle.category === 'mate-1' || puzzle.category === 'mate-2') &&
    getBackend().isOnline() &&
    getBackend().postGolfAttempt !== undefined;
  const [golfMode, setGolfMode] = useState(false);
  /** UCI moves the user has made in golf mode, in order. We submit
   *  the whole list to the server when their last move delivers
   *  checkmate; until then it just accumulates locally. */
  const golfMovesRef = useRef<string[]>([]);

  /** Submit a code-golf attempt to the server and surface the result
   *  as a toast. Fire-and-forget — we don't block the UI on the
   *  network round-trip. */
  const submitGolfAttempt = useCallback(
    async (puzzleId: string, moves: string[]) => {
      const backend = getBackend();
      if (!backend.postGolfAttempt) return;
      const session = loadSession();
      if (!session.token) return;
      try {
        const res = await backend.postGolfAttempt(session.token, puzzleId, moves);
        if (res.isGlobalBest) {
          toast.success(
            `🥇 สถิติโลกใหม่! ${res.plyCount} ตา · เป็นที่ 1 บนกระดาน global`,
          );
        } else if (res.isPersonalBest) {
          toast.success(
            `🎯 personal best ใหม่! ${res.plyCount} ตา (เร็วสุดของโลก: ${res.globalBest})`,
          );
        } else {
          toast.info(
            `✓ บันทึก ${res.plyCount} ตา · personal best ${res.personalBest} · global ${res.globalBest}`,
          );
        }
      } catch (err) {
        toast.error(`บันทึก code-golf ไม่สำเร็จ: ${String(err).slice(0, 80)}`);
      }
    },
    [],
  );
  /** ms epoch when the puzzle first rendered — used to compute the
   * timeToSolveMs metric saved with the solve record. */
  const startedAtRef = useRef<number>(Date.now());
  /** UCI moves the user has tried but were wrong. Capped to last 5
   * before persisting — enough to surface a pattern, bounded size. */
  const wrongMovesRef = useRef<string[]>([]);

  const userSide = puzzle.toMove;
  /** User-facing goal text — prefer puzzle.goal, fall back to a
   * sensible default derived from category + solution length. */
  const goalText =
    puzzle.goal ??
    (puzzle.category === 'mate-1'
      ? 'รุกจน 1 ตา'
      : puzzle.category === 'mate-2'
        ? 'รุกจน 2 ตา'
        : puzzle.category === 'tactic'
          ? 'หาตาดีที่สุด'
          : 'แก้ปริศนา');

  // Mount: load ffish, create internal board, sync initial state.
  useEffect(() => {
    let cancelled = false;
    startedAtRef.current = Date.now();
    wrongMovesRef.current = [];
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

      // ── Code-golf branch ─────────────────────────────────────────
      // In golf mode, we don't validate against the canonical solution
      // — any legal move is accepted; success is "did the user deliver
      // checkmate, and in how few plies?". Server verifies the full
      // sequence on submit, so client-side legality is only a UX
      // shortcut to avoid useless round-trips.
      if (golfMode) {
        const userUci = `${from}${to}`;
        const isLegal = state.legalMoves.some((m) => m.startsWith(userUci));
        if (!isLegal) {
          haptic('wrong');
          setState((s) =>
            !s ? s : { ...s, feedback: 'เดินผิดกฎ · ลองใหม่' },
          );
          setTimeout(() => {
            setState((s) => (!s ? s : { ...s, feedback: null }));
          }, 900);
          return;
        }
        // Resolve to the full UCI (with promotion suffix if any) so the
        // server replay agrees with us.
        const fullUci = state.legalMoves.find((m) => m.startsWith(userUci)) ?? userUci;
        board.push(fullUci);
        golfMovesRef.current = [...golfMovesRef.current, fullUci];
        const gameOver = board.isGameOver();
        const result = gameOver ? board.result() : null;
        const deliveredMate =
          gameOver &&
          ((userSide === 'white' && result === '1-0') ||
            (userSide === 'black' && result === '0-1'));
        if (deliveredMate) {
          haptic('mate');
          submitGolfAttempt(puzzle.id, golfMovesRef.current);
          setState({
            fen: board.fen(),
            legalMoves: [],
            isCheck: board.isCheck(),
            step: state.step,
            attempts: state.attempts + 1,
            wrongStreak: 0,
            status: 'won',
            feedback: `🏆 รุกจน · ${golfMovesRef.current.length} ตา · กำลังส่งคะแนน…`,
            lastMove: { from, to },
          });
          return;
        }
        // Move accepted but mate not yet — show progress
        setState({
          fen: board.fen(),
          legalMoves: parseLegalMoves(board.legalMoves()),
          isCheck: board.isCheck(),
          step: state.step,
          attempts: state.attempts + 1,
          wrongStreak: 0,
          status: 'playing',
          feedback: `🏌️ ${golfMovesRef.current.length} ตาแล้ว · เดินต่อ`,
          lastMove: { from, to },
        });
        setTimeout(() => {
          setState((s) => (!s ? s : { ...s, feedback: null }));
        }, 1500);
        return;
      }

      const expectedUci = puzzle.solution[state.step];
      const userUci = `${from}${to}`;
      // Allow promotion suffix — Makruk auto-promotes to Met (m) so the
      // ffish-side UCI may carry "m" while chessground emits the bare
      // 4-char form. Match on prefix.
      const isCorrect = expectedUci.startsWith(userUci);

      if (!isCorrect) {
        // Wrong: don't advance the ffish board, just flash feedback.
        // Haptic "wrong" pattern so touch users get the same urgency
        // signal the desktop user gets from the red flash.
        haptic('wrong');
        // Also record the wrong move (capped to last 5) so we can
        // show the user their own pattern.
        if (wrongMovesRef.current.length >= 5) wrongMovesRef.current.shift();
        wrongMovesRef.current.push(userUci);
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
        const timeToSolveMs = Date.now() - startedAtRef.current;
        recordSolve(puzzle.id, totalAttempts, usedHint, timeToSolveMs, wrongMovesRef.current);
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
    [puzzle, state, showHint, golfMode, userSide],
  );

  const resetPuzzle = () => {
    const ffish = ffishRef.current;
    if (!ffish) return;
    boardRef.current?.delete();
    const board = new ffish.Board('makruk', puzzle.fen);
    boardRef.current = board;
    golfMovesRef.current = [];
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
        <div className="puzzle-goal">
          🎯 <strong>{goalText}</strong>
        </div>
        <div className="puzzle-meta">
          <span className="label-aside">
            หมวด: {puzzle.category} · #{puzzle.id}
            {solvedBefore && ' · ✓ เคยทำเสร็จแล้ว'}
          </span>
          <PuzzleTimer running={state.status === 'playing'} startedAt={startedAtRef.current} />
        </div>
        {golfEligible && (
          <div className="puzzle-golf-toggle">
            <label>
              <input
                type="checkbox"
                checked={golfMode}
                onChange={(e) => {
                  setGolfMode(e.target.checked);
                  golfMovesRef.current = [];
                  resetPuzzle();
                }}
              />{' '}
              🏌️ <strong>Code-golf mode</strong> — เดินยังไงก็ได้ที่ legal · ใครรุกจนน้อยตาที่สุดชนะ · ส่ง server เก็บคะแนน
            </label>
          </div>
        )}
      </header>

      <div className="puzzle-main">
        <div className="puzzle-board-wrap">
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
        </div>

        <aside className="puzzle-sidebar">
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

          {state.status === 'won' && puzzle.explanation && (
            <div className="puzzle-explanation">
              <strong>📖 เหตุผล:</strong> {puzzle.explanation}
            </div>
          )}

          {state.status === 'won' && (() => {
            const best = loadPuzzleProgress().solved[puzzle.id];
            if (!best) return null;
            // Optimal solve = user took exactly as many moves as the
            // canonical solution path (no wrong attempts). The
            // "user moves" in the solution are at odd indices (0, 2, 4…).
            const optimalUserMoves = Math.ceil(puzzle.solution.length / 2);
            const isOptimal = best.attempts <= optimalUserMoves && !best.usedHint;
            return (
              <div className="puzzle-best-stats">
                <div className="label-aside">
                  🏆 สถิติ: {best.attempts} ครั้ง
                  {best.timeToSolveMs &&
                    ` · ${(best.timeToSolveMs / 1000).toFixed(1)} วินาที`}
                  {best.usedHint && ' · ใช้ hint'}
                </div>
                <div className="puzzle-best-optimal">
                  {isOptimal ? (
                    <span className="puzzle-optimal-badge">
                      🏃 Speed: optimal ({optimalUserMoves} ตา) — ไม่มี wrong attempts!
                    </span>
                  ) : (
                    <span className="label-aside">
                      Engine path: {optimalUserMoves} ตา · ของคุณ: {best.attempts} ครั้ง
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="puzzle-controls">
        {state.status === 'playing' && (
          <>
            {puzzle.hint && !showHint && (
              <button onClick={() => setShowHint(true)}>💡 ขอคำใบ้</button>
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

          {/* Themes — surface tactical tags so the user knows what
              pattern they just practiced. Visual-audit feedback:
              right column had wasted whitespace below the buttons. */}
          {puzzle.themes && puzzle.themes.length > 0 && (
            <div className="puzzle-themes">
              <div className="label-aside">🏷️ ธีม:</div>
              <div className="puzzle-themes-row">
                {puzzle.themes.map((t) => (
                  <span key={t} className="puzzle-theme-tag">{t}</span>
                ))}
              </div>
            </div>
          )}

          {state.status === 'playing' && wrongMovesRef.current.length > 0 && (
            <div className="puzzle-attempts">
              <div className="label-aside">
                ❌ ตาที่ลองมาแล้ว ({wrongMovesRef.current.length}):
              </div>
              <div className="puzzle-attempts-row">
                {wrongMovesRef.current.slice(-5).map((m, i) => (
                  <code key={`${m}-${i}`} className="puzzle-attempt">{m}</code>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Live MM:SS timer driven by rAF — freezes when not running. */
function PuzzleTimer({
  running,
  startedAt,
}: {
  running: boolean;
  startedAt: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    let id: number;
    const tick = () => {
      setNow(Date.now());
      id = window.setTimeout(tick, 250);
    };
    tick();
    return () => window.clearTimeout(id);
  }, [running]);
  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  return (
    <span className="puzzle-timer label-aside" title="เวลาที่ใช้ทำปริศนานี้">
      ⏱ {min}:{sec.toString().padStart(2, '0')}
    </span>
  );
}

function parseUciToLastMove(uci: string): { from: Square; to: Square } {
  const { from, to } = parseUci(uci);
  return { from, to };
}

function recordSolve(
  puzzleId: string,
  attempts: number,
  usedHint: boolean,
  timeToSolveMs?: number,
  wrongMoves?: string[],
): void {
  const progress = loadPuzzleProgress();
  const updated = recordPuzzleSolve(progress, puzzleId, {
    solvedAt: Date.now(),
    attempts,
    usedHint,
    timeToSolveMs,
    wrongMoves: wrongMoves && wrongMoves.length > 0 ? [...wrongMoves] : undefined,
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
