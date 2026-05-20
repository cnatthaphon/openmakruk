// Detail view for a single lesson — opened when the user clicks a card
// in LearnPage.
//
// Content-driven: receives a LessonContent (loaded from JSON) and
// dispatches on lesson.demo.kind to pick the renderer. Adding a new
// demo type = (1) add a new variant to LessonDemo in lessonSchema.ts,
// (2) write a new component below, (3) wire it up in the switch.
//
// Lessons whose `demo` is null/undefined render the read-only body
// (still useful — most "rules" and "strategy" lessons are explanatory
// prose, not interactive).

import { useState } from 'react';
import {
  biaSquaresSplit,
  legalSquaresForPiece,
  ROLE_TH,
  ROLE_TO_CG,
  type Color,
  type Role,
  parseSquare,
} from '../lib/lessonRules';
import { fenToPieceMap } from '../lib/makruk';
import type {
  LessonContent,
  LessonDemo,
  PieceMovementDemo,
  PositionQuizDemo,
  PositionViewerDemo,
} from '../lib/lessonSchema';

type Props = {
  lesson: LessonContent;
  isCompleted: boolean;
  onMarkComplete: () => void;
  onBack: () => void;
};

export function LessonView({ lesson, isCompleted, onMarkComplete, onBack }: Props) {
  return (
    <div className="lesson-view">
      <button className="lesson-back" onClick={onBack}>
        ← กลับไปรายการบทเรียน
      </button>
      <header className="lesson-header">
        <h2>{lesson.title}</h2>
        <p className="lesson-desc">{lesson.description}</p>
      </header>

      {lesson.body && (
        <p className="lesson-explanation">{lesson.body}</p>
      )}

      <DemoRenderer demo={lesson.demo ?? null} />

      <footer className="lesson-footer">
        <button
          className="lesson-complete-button"
          onClick={() => {
            onMarkComplete();
            onBack();
          }}
        >
          {isCompleted
            ? '✓ ทบทวนแล้ว — กลับไปบทเรียน'
            : '✓ เข้าใจแล้ว — ทำเครื่องหมายเสร็จ'}
        </button>
      </footer>
    </div>
  );
}

// ---- Demo dispatcher ---------------------------------------------------

function DemoRenderer({ demo }: { demo: LessonDemo | null }) {
  if (!demo) return <ReadOnlyLessonNote />;
  switch (demo.kind) {
    case 'piece-movement':
      return <PieceMovementDemoView demo={demo} />;
    case 'position-viewer':
      return <PositionViewerDemoView demo={demo} />;
    case 'position-quiz':
      return <PositionQuizDemoView demo={demo} />;
    default: {
      // Exhaustive guard: if someone adds a new demo kind to the
      // schema and forgets to wire it up here, TS surfaces it.
      const _exhaustive: never = demo;
      void _exhaustive;
      return null;
    }
  }
}

function ReadOnlyLessonNote() {
  return (
    <div className="lesson-readonly-note">
      <p className="label-aside">
        บทเรียนนี้เป็นเนื้อหาอ่าน — ทำความเข้าใจ body ด้านบน แล้วกด
        "เข้าใจแล้ว" ด้านล่าง
      </p>
    </div>
  );
}

// ---- Demo: single piece on empty board ---------------------------------

function PieceMovementDemoView({ demo }: { demo: PieceMovementDemo }) {
  const [pieceSquare, setPieceSquare] = useState(demo.startSquare);
  const [moveCount, setMoveCount] = useState(0);

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
    <div className="lesson-body">
      <div className="lesson-stats">
        <span>
          ตอนนี้ <strong>{ROLE_TH[demo.role]}</strong> อยู่ที่{' '}
          <code>{pieceSquare}</code>
        </span>
        <span className="label-aside">
          เลื่อนหมาก {moveCount} ครั้ง · ลองคลิกช่องไฮไลต์
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
    </div>
  );
}

// ---- Demo: position viewer (read-only with optional highlights) --------

function PositionViewerDemoView({ demo }: { demo: PositionViewerDemo }) {
  const pieces = fenToBoardPieces(demo.fen);
  const highlights = demo.highlights ?? [];
  return (
    <div className="lesson-body">
      {demo.caption && <p className="lesson-explanation">{demo.caption}</p>}
      <LessonBoard
        pieces={pieces}
        legalSquares={highlights.map((h) => h.square)}
        coloredHighlights={highlights}
      />
    </div>
  );
}

// ---- Demo: click-the-square quiz ---------------------------------------

function PositionQuizDemoView({ demo }: { demo: PositionQuizDemo }) {
  const pieces = fenToBoardPieces(demo.fen);
  const [verdict, setVerdict] = useState<'idle' | 'good' | 'bad'>('idle');
  const [clickedSquare, setClickedSquare] = useState<string | null>(null);

  const handleClick = (sq: string) => {
    setClickedSquare(sq);
    setVerdict(demo.correctSquares.includes(sq) ? 'good' : 'bad');
  };

  return (
    <div className="lesson-body">
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
    </div>
  );
}

// ---- Shared lesson board (supports multi-piece via FEN) ----------------

type PieceOnBoard = { square: string; role: Role; color: Color };

type LessonBoardProps = {
  pieces: PieceOnBoard[];
  legalSquares?: string[];
  biaSplit?: { push: string[]; capture: string[] } | null;
  coloredHighlights?: { square: string; color: 'green' | 'red' | 'yellow' }[];
  onSquareClick?: (sq: string) => void;
  clickAnySquare?: boolean; // if true, all squares clickable (for quiz)
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

// ---- FEN helpers -------------------------------------------------------

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
    case 'q': return 'met'; // chessground-style FEN
    case 's': return 'khon';
    case 'b': return 'khon';
    case 'n': return 'knight';
    case 'r': return 'rook';
    case 'p': return 'bia';
    default: return null;
  }
}
