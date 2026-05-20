// Detail view for a single lesson.
//
// Content-driven: receives a LessonContent (loaded from JSON), runs
// it through lessonToSteps() to get a uniform array of steps, then
// renders one step at a time with prev/next navigation.
//
// Step kinds:
//   - text          → prose, no board
//   - demo          → dispatched on demo.kind:
//       * piece-movement     → single piece, click highlights to move
//       * position-viewer    → static board with optional highlights
//       * position-quiz      → click the correct squares
//       * try-move           → drag the correct move (board + ffish)
//       * replay             → step through a canned move sequence
//                              with per-ply commentary
//       * counting-demo      → position + animated count progress
//
// Extending: add a kind to LessonDemo in lessonSchema.ts, add a case
// to the dispatcher below. The `never` guard catches missing wiring.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../components/Board';
import {
  biaSquaresSplit,
  legalSquaresForPiece,
  parseSquare,
  ROLE_TH,
  ROLE_TO_CG,
  type Color,
  type Role,
} from '../lib/lessonRules';
import {
  fenToPieceMap,
  loadFfish,
  parseLegalMoves,
  type Square,
} from '../lib/makruk';
import {
  lessonToSteps,
  type CountingDemo,
  type LessonContent,
  type LessonDemo,
  type LessonStep,
  type PieceMovementDemo,
  type PositionQuizDemo,
  type PositionViewerDemo,
  type ReplayDemo,
  type TextStep,
  type TryMoveDemo,
} from '../lib/lessonSchema';

type Props = {
  lesson: LessonContent;
  isCompleted: boolean;
  onMarkComplete: () => void;
  onBack: () => void;
  onNextLesson?: () => void;
};

export function LessonView({
  lesson,
  isCompleted,
  onMarkComplete,
  onBack,
  onNextLesson,
}: Props) {
  const steps = useMemo(() => lessonToSteps(lesson), [lesson]);
  const [stepIdx, setStepIdx] = useState(0);

  // Reset step pointer when switching lessons
  useEffect(() => {
    setStepIdx(0);
  }, [lesson.id]);

  // Clamp stepIdx against the current lesson's step count. When the
  // user clicks "complete" on the LAST step of lesson A, the parent
  // immediately swaps in lesson B (which has its own — possibly
  // smaller — steps array). The useEffect above eventually resets
  // stepIdx to 0, but on that first render BEFORE the effect fires
  // we'd otherwise index past the new array's end and crash with
  // `Cannot read properties of undefined (reading 'kind')`.
  const safeStepIdx = Math.min(stepIdx, steps.length - 1);
  const isLast = safeStepIdx === steps.length - 1;
  const isFirst = safeStepIdx === 0;
  const step = steps[safeStepIdx];

  const handleNext = () => {
    if (isLast) {
      onMarkComplete();
      if (onNextLesson) onNextLesson();
      else onBack();
    } else {
      setStepIdx((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) setStepIdx((i) => i - 1);
  };

  return (
    <div className="lesson-view">
      <button className="lesson-back" onClick={onBack}>
        ← กลับไปรายการบทเรียน
      </button>
      <header className="lesson-header">
        <h2>{lesson.title}</h2>
        <p className="lesson-desc">{lesson.description}</p>
        <LessonStepIndicator current={safeStepIdx} total={steps.length} />
      </header>

      <StepRenderer step={step} />

      <footer className="lesson-footer">
        <div className="lesson-nav">
          <button
            className="lesson-nav-prev"
            onClick={handlePrev}
            disabled={isFirst}
          >
            ← ก่อนหน้า
          </button>
          <button className="lesson-complete-button" onClick={handleNext}>
            {isLast
              ? isCompleted
                ? onNextLesson
                  ? 'บทเรียนถัดไป →'
                  : '✓ ทบทวนแล้ว — กลับ'
                : onNextLesson
                  ? '✓ จบบท · บทถัดไป →'
                  : '✓ จบบทเรียน'
              : 'ถัดไป →'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function LessonStepIndicator({ current, total }: { current: number; total: number }) {
  if (total <= 1) return null;
  return (
    <div className="lesson-step-indicator">
      <span className="label-aside">
        ขั้นที่ {current + 1} / {total}
      </span>
      <div className="lesson-step-bar">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`lesson-step-bar-cell ${i <= current ? 'on' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Step dispatcher ---------------------------------------------------

function StepRenderer({ step }: { step: LessonStep | undefined | null }) {
  // Defensive: a transient render between lesson swaps can hand us an
  // undefined step. Returning null here is harmless — the next tick's
  // setStepIdx(0) reset puts us back on solid ground.
  if (!step) return null;
  switch (step.kind) {
    case 'text':
      return <TextStepView step={step} />;
    case 'demo':
      return <DemoRenderer demo={step.demo} caption={step.caption} />;
    default: {
      const _exhaustive: never = step;
      void _exhaustive;
      return null;
    }
  }
}

function TextStepView({ step }: { step: TextStep }) {
  return (
    <div className="lesson-body">
      {step.heading && <h3 className="lesson-step-heading">{step.heading}</h3>}
      {step.text.split('\n').map((para, i) =>
        para.trim() === '' ? null : (
          <p key={i} className="lesson-explanation">
            {para}
          </p>
        ),
      )}
    </div>
  );
}

function DemoRenderer({ demo, caption }: { demo: LessonDemo; caption?: string }) {
  let body: JSX.Element;
  switch (demo.kind) {
    case 'piece-movement':
      body = <PieceMovementDemoView demo={demo} />;
      break;
    case 'position-viewer':
      body = <PositionViewerDemoView demo={demo} />;
      break;
    case 'position-quiz':
      body = <PositionQuizDemoView demo={demo} />;
      break;
    case 'try-move':
      body = <TryMoveDemoView demo={demo} />;
      break;
    case 'replay':
      body = <ReplayDemoView demo={demo} />;
      break;
    case 'counting-demo':
      body = <CountingDemoView demo={demo} />;
      break;
    default: {
      const _exhaustive: never = demo;
      void _exhaustive;
      body = <></>;
    }
  }
  return (
    <div className="lesson-body">
      {caption && <p className="lesson-caption">{caption}</p>}
      {body}
    </div>
  );
}

// ---- Demo: piece movement ---------------------------------------------

function PieceMovementDemoView({ demo }: { demo: PieceMovementDemo }) {
  const [pieceSquare, setPieceSquare] = useState(demo.startSquare);
  const [moveCount, setMoveCount] = useState(0);
  // Reset on demo change
  useEffect(() => {
    setPieceSquare(demo.startSquare);
    setMoveCount(0);
  }, [demo.startSquare, demo.role, demo.color]);

  const legals = legalSquaresForPiece(demo.role, demo.color, pieceSquare);
  const biaSplit =
    demo.pawnSplit && demo.role === 'bia'
      ? biaSquaresSplit(demo.color, pieceSquare)
      : null;

  const handleSquareClick = (sq: string) => {
    if (sq === pieceSquare) return;
    if (!legals.includes(sq)) return;
    setPieceSquare(sq);
    setMoveCount((n) => n + 1);
  };

  return (
    <>
      <div className="lesson-stats">
        <span>
          ตอนนี้ <strong>{ROLE_TH[demo.role]}</strong> อยู่ที่{' '}
          <code>{pieceSquare}</code>
        </span>
        <span className="label-aside">
          เลื่อนหมาก {moveCount} ครั้ง · คลิกช่องไฮไลต์เพื่อย้าย
        </span>
      </div>
      <LessonBoard
        pieces={[{ square: pieceSquare, role: demo.role, color: demo.color }]}
        legalSquares={legals}
        biaSplit={biaSplit}
        onSquareClick={handleSquareClick}
      />
      <div className="lesson-legend">
        {biaSplit ? (
          <>
            <span className="legend-chip legend-push">●</span> เดินไปข้างหน้า{' '}
            <span className="legend-chip legend-capture">●</span> จับเฉียง
          </>
        ) : (
          <>
            <span className="legend-chip legend-push">●</span> ช่องที่{' '}
            {ROLE_TH[demo.role]} เดินได้ทั้งหมด
          </>
        )}
      </div>
    </>
  );
}

// ---- Demo: position viewer --------------------------------------------

function PositionViewerDemoView({ demo }: { demo: PositionViewerDemo }) {
  const pieces = fenToBoardPieces(demo.fen);
  const highlights = demo.highlights ?? [];
  return (
    <>
      {demo.caption && <p className="lesson-explanation">{demo.caption}</p>}
      <LessonBoard
        pieces={pieces}
        legalSquares={highlights.map((h) => h.square)}
        coloredHighlights={highlights}
      />
    </>
  );
}

// ---- Demo: position quiz (click-the-square) ---------------------------

function PositionQuizDemoView({ demo }: { demo: PositionQuizDemo }) {
  const pieces = fenToBoardPieces(demo.fen);
  const [verdict, setVerdict] = useState<'idle' | 'good' | 'bad'>('idle');
  const [clickedSquare, setClickedSquare] = useState<string | null>(null);
  // Reset on demo change
  useEffect(() => {
    setVerdict('idle');
    setClickedSquare(null);
  }, [demo.fen]);

  const handleClick = (sq: string) => {
    setClickedSquare(sq);
    setVerdict(demo.correctSquares.includes(sq) ? 'good' : 'bad');
  };

  return (
    <>
      <p className="lesson-quiz-prompt">{demo.question}</p>
      <LessonBoard
        pieces={pieces}
        legalSquares={clickedSquare ? [clickedSquare] : []}
        onSquareClick={handleClick}
        clickAnySquare
        coloredHighlights={
          clickedSquare && verdict !== 'idle'
            ? [{ square: clickedSquare, color: verdict === 'good' ? 'green' : 'red' }]
            : undefined
        }
      />
      {verdict === 'good' && (
        <div className="lesson-feedback good">{demo.successMessage}</div>
      )}
      {verdict === 'bad' && (
        <div className="lesson-feedback bad">{demo.failureMessage}</div>
      )}
    </>
  );
}

// ---- Demo: try-move (drag the correct move on a real Board) -----------

function TryMoveDemoView({ demo }: { demo: TryMoveDemo }) {
  const ffishRef = useRef<Awaited<ReturnType<typeof loadFfish>> | null>(null);
  const boardRef = useRef<any | null>(null);
  const [state, setState] = useState<{
    fen: string;
    legalMoves: string[];
    isCheck: boolean;
    feedback: 'idle' | 'good' | 'bad';
    attempts: number;
    showHint: boolean;
    lastMove: { from: Square; to: Square } | null;
    locked: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFfish().then((ffish) => {
      if (cancelled) return;
      ffishRef.current = ffish;
      const board = new ffish.Board('makruk', demo.fen);
      boardRef.current = board;
      setState({
        fen: demo.fen,
        legalMoves: parseLegalMoves(board.legalMoves()),
        isCheck: board.isCheck(),
        feedback: 'idle',
        attempts: 0,
        showHint: false,
        lastMove: null,
        locked: false,
      });
    });
    return () => {
      cancelled = true;
      boardRef.current?.delete();
      boardRef.current = null;
    };
  }, [demo.fen]);

  const handleMove = useCallback(
    (from: Square, to: Square) => {
      if (!state || state.locked) return;
      const userUci = `${from}${to}`;
      const isCorrect = demo.correctMoves.some((m) => m.startsWith(userUci));
      if (isCorrect) {
        setState((s) =>
          !s
            ? s
            : {
                ...s,
                feedback: 'good',
                lastMove: { from, to },
                locked: true,
              },
        );
      } else {
        setState((s) =>
          !s
            ? s
            : {
                ...s,
                feedback: 'bad',
                attempts: s.attempts + 1,
                lastMove: { from, to },
              },
        );
        setTimeout(() => {
          setState((s) => (!s ? s : { ...s, lastMove: null, feedback: 'idle' }));
        }, 900);
      }
    },
    [state, demo.correctMoves],
  );

  if (!state) {
    return <p className="puzzle-loading">กำลังโหลด ffish ...</p>;
  }

  const userSide = state.fen.split(' ')[1] === 'w' ? 'white' : 'black';

  return (
    <>
      <p className="lesson-quiz-prompt">{demo.prompt}</p>
      <Board
        fen={state.fen}
        legalMoves={state.legalMoves}
        flipped={userSide === 'black'}
        disabled={state.locked}
        turn={userSide}
        isCheck={state.isCheck}
        lastMove={state.lastMove}
        hint={null}
        onMove={handleMove}
      />
      {state.feedback === 'good' && (
        <div className="lesson-feedback good">{demo.successMessage}</div>
      )}
      {state.feedback === 'bad' && (
        <div className="lesson-feedback bad">{demo.failureMessage}</div>
      )}
      {demo.hint && (state.attempts >= 2 || state.showHint) && (
        <div className="puzzle-hint-box">💡 ใบ้: {demo.hint}</div>
      )}
      <div className="lesson-quiz-stats label-aside">
        พยายาม: {state.attempts}
      </div>
    </>
  );
}

// ---- Demo: replay (canned move sequence with commentary) --------------

function ReplayDemoView({ demo }: { demo: ReplayDemo }) {
  const ffishRef = useRef<Awaited<ReturnType<typeof loadFfish>> | null>(null);
  const positionsRef = useRef<string[]>([demo.fen]);
  const movesPlayedRef = useRef<string[]>([]);
  const [ply, setPly] = useState(0);
  const [ready, setReady] = useState(false);

  // Precompute every position by replaying the full move list once.
  // This keeps step navigation instant — no re-running ffish each click.
  useEffect(() => {
    let cancelled = false;
    loadFfish().then((ffish) => {
      if (cancelled) return;
      const board = new ffish.Board('makruk', demo.fen);
      const positions: string[] = [board.fen()];
      const moves: string[] = [];
      for (const move of demo.moves) {
        try {
          board.push(move);
          positions.push(board.fen());
          moves.push(move);
        } catch {
          break;
        }
      }
      board.delete();
      ffishRef.current = ffish;
      positionsRef.current = positions;
      movesPlayedRef.current = moves;
      setPly(0);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [demo.fen, demo.moves]);

  const positions = positionsRef.current;
  const fen = positions[Math.min(ply, positions.length - 1)] ?? demo.fen;
  const commentary = demo.commentary.find((c) => c.plyAfter === ply);
  const canNext = ply < positions.length - 1;
  const canPrev = ply > 0;

  const handlePrev = () => canPrev && setPly((p) => p - 1);
  const handleNext = () => canNext && setPly((p) => p + 1);
  const handleReset = () => setPly(0);

  if (!ready) return <p className="puzzle-loading">กำลังโหลด ffish ...</p>;

  const pieces = fenToBoardPieces(fen);
  const lastMove = ply > 0 ? movesPlayedRef.current[ply - 1] : undefined;
  const lastFrom = lastMove?.slice(0, 2);
  const lastTo = lastMove?.slice(2, 4);

  return (
    <>
      <div className="lesson-stats">
        <span>
          ตา {ply} / {positions.length - 1}
        </span>
        <span className="label-aside">
          ผู้เดิน: {ply % 2 === 0 ? 'ขาว' : 'ดำ'}
        </span>
      </div>
      <LessonBoard
        pieces={pieces}
        coloredHighlights={
          lastFrom && lastTo
            ? [
                { square: lastFrom, color: 'yellow' },
                { square: lastTo, color: 'yellow' },
              ]
            : undefined
        }
      />
      {commentary && (
        <div className="replay-commentary">{commentary.text}</div>
      )}
      <div className="replay-controls">
        <button onClick={handlePrev} disabled={!canPrev}>
          ← ก่อนหน้า
        </button>
        <button onClick={handleReset} className="secondary">
          ↻ เริ่มใหม่
        </button>
        <button onClick={handleNext} disabled={!canNext}>
          ตาถัดไป →
        </button>
      </div>
    </>
  );
}

// ---- Demo: counting-demo ----------------------------------------------

function CountingDemoView({ demo }: { demo: CountingDemo }) {
  const pieces = fenToBoardPieces(demo.fen);
  const [count, setCount] = useState(1);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    if (count >= demo.countLimit) {
      setRunning(false);
      return;
    }
    const t = setTimeout(() => setCount((c) => c + 1), 600);
    return () => clearTimeout(t);
  }, [count, running, demo.countLimit]);

  const reset = () => {
    setCount(1);
    setRunning(false);
  };

  const remaining = Math.max(0, demo.countLimit - count);
  const finished = count >= demo.countLimit;

  return (
    <>
      <p className="lesson-caption">{demo.caption}</p>
      <LessonBoard pieces={pieces} />
      <div className="counting-panel">
        <div className="counting-stat">
          <span className="counting-stat-label">นับปัจจุบัน</span>
          <span className="counting-stat-value">{count}</span>
        </div>
        <div className="counting-stat">
          <span className="counting-stat-label">ขีดจำกัด</span>
          <span className="counting-stat-value">{demo.countLimit}</span>
        </div>
        <div className="counting-stat">
          <span className="counting-stat-label">เหลือ</span>
          <span
            className={`counting-stat-value ${remaining <= 5 ? 'low' : ''}`}
          >
            {remaining}
          </span>
        </div>
      </div>
      <div className="counting-status">
        {finished
          ? '⏱️ หมดเวลานับ — เกมเสมอ (ฝ่ายแข็งไล่ไม่ทัน)'
          : `ฝ่าย ${demo.bareKingSide === 'white' ? 'ขาว' : 'ดำ'} เหลือแค่ขุน · กำลังนับ ...`}
      </div>
      <div className="replay-controls">
        <button onClick={() => setRunning((r) => !r)} disabled={finished}>
          {running ? '⏸ หยุด' : '▶ เริ่มนับ'}
        </button>
        <button onClick={reset} className="secondary">
          ↻ รีเซ็ต
        </button>
      </div>
    </>
  );
}

// ---- Shared lesson board (supports multi-piece via FEN) ---------------

type PieceOnBoard = { square: string; role: Role; color: Color };

type LessonBoardProps = {
  pieces: PieceOnBoard[];
  legalSquares?: string[];
  biaSplit?: { push: string[]; capture: string[] } | null;
  coloredHighlights?: { square: string; color: 'green' | 'red' | 'yellow' }[];
  onSquareClick?: (sq: string) => void;
  clickAnySquare?: boolean;
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

function LessonBoard({
  pieces,
  legalSquares,
  biaSplit,
  coloredHighlights,
  onSquareClick,
  clickAnySquare,
}: LessonBoardProps) {
  const legalSet = new Set(legalSquares ?? []);
  const biaPush = new Set(biaSplit?.push ?? []);
  const biaCapture = new Set(biaSplit?.capture ?? []);
  const pieceBySquare = new Map<string, PieceOnBoard>();
  for (const p of pieces) pieceBySquare.set(p.square, p);

  const highlightBySquare = new Map<string, 'green' | 'red' | 'yellow'>();
  for (const h of coloredHighlights ?? []) highlightBySquare.set(h.square, h.color);

  return (
    <div className="lesson-board">
      {RANKS.map((rank, rankIdx) =>
        FILES.map((file, fileIdx) => {
          const sq = `${file}${rank}`;
          const isDark = (rankIdx + fileIdx) % 2 === 1;
          const piece = pieceBySquare.get(sq);
          const isLegal = legalSet.has(sq);
          const highlight = highlightBySquare.get(sq);
          const clickable =
            (onSquareClick && isLegal) || (onSquareClick && clickAnySquare);

          const classes = [
            'lesson-square',
            isDark ? 'dark' : 'light',
            piece && 'has-piece',
            isLegal && 'legal',
            highlight && `tint-${highlight}`,
            clickable && 'clickable',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={sq}
              className={classes}
              onClick={() => onSquareClick?.(sq)}
              aria-label={sq}
              disabled={!clickable}
            >
              {piece && (
                <div
                  className="lesson-piece"
                  style={{
                    backgroundImage: `url(/pieces/makruk/${piece.color}_${
                      ROLE_TO_CG[piece.role]
                    }.svg)`,
                  }}
                />
              )}
              {isLegal && !piece && !highlight && (
                <span
                  className={`lesson-dot ${
                    biaCapture.has(sq)
                      ? 'lesson-dot-capture'
                      : biaPush.has(sq)
                        ? 'lesson-dot-push'
                        : ''
                  }`}
                  aria-hidden="true"
                />
              )}
              {fileIdx === 0 && <span className="lesson-coord rank">{rank}</span>}
              {rankIdx === 7 && <span className="lesson-coord file">{file}</span>}
            </button>
          );
        }),
      )}
    </div>
  );
}

// ---- FEN helpers ------------------------------------------------------

function fenToBoardPieces(fen: string): PieceOnBoard[] {
  const out: PieceOnBoard[] = [];
  const map = fenToPieceMap(fen);
  for (const [square, letter] of Object.entries(map)) {
    if (!parseSquare(square)) continue;
    const lower = letter.toLowerCase();
    const role = letterToRole(lower);
    if (!role) continue;
    const color: Color = letter === letter.toUpperCase() ? 'white' : 'black';
    out.push({ square, role, color });
  }
  return out;
}

function letterToRole(lower: string): Role | null {
  switch (lower) {
    case 'k': return 'king';
    case 'm': return 'met';
    case 'q': return 'met';  // chessground-style FEN
    case 's': return 'khon';
    case 'b': return 'khon';
    case 'n': return 'knight';
    case 'r': return 'rook';
    case 'p': return 'bia';
    default: return null;
  }
}
