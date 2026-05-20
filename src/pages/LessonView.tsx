// Detail view for a single lesson — opened when the user clicks a card
// in LearnPage.
//
// Phase 2B ships the 6 piece-movement bodies (king / met / khon /
// knight / rook / bia). Anything outside that range falls into the
// "coming-soon" placeholder which still shows the title/description
// and a "mark complete" button so we never block progression.

import { useState } from 'react';
import {
  biaSquaresSplit,
  legalSquaresForPiece,
  ROLE_TH,
  ROLE_TO_CG,
  type Color,
  type Role,
} from '../lib/lessonRules';

type LessonDescriptor = {
  id: string;
  title: string;
  description: string;
};

type Props = {
  lesson: LessonDescriptor;
  isCompleted: boolean;
  onMarkComplete: () => void;
  onBack: () => void;
};

// Map lesson id → piece-movement lesson config (Phase 2B content).
type PieceConfig = {
  role: Role;
  color: Color;
  startSquare: string;
  body: string; // longer explanation in Thai
};

const PIECE_LESSON_CONFIG: Record<string, PieceConfig> = {
  'piece-king': {
    role: 'king',
    color: 'white',
    startSquare: 'e4',
    body:
      'ขุนเดินได้ 1 ช่อง ทุกทิศทาง — รวมทั้งหมด 8 ช่องโดยรอบ. ' +
      'ห้ามเดินเข้าช่องที่ฝ่ายตรงข้ามรุก (จะถูกจับ = ผิดกฎ). ' +
      'ขุนคือตัวที่สำคัญที่สุด — ปกป้องไว้ดี ๆ',
  },
  'piece-met': {
    role: 'met',
    color: 'white',
    startSquare: 'e4',
    body:
      'เม็ดเดินได้ 1 ช่อง เฉพาะแนวเฉียง (4 ทิศทาง) — ทำให้อ่อนกว่าควีนหมากรุกสากลเยอะ. ' +
      'เป็นตัว power piece ที่อ่อนสุดของ Makruk แต่ก็ยังมีค่ามากกว่าโคน. ' +
      'เบี้ยที่ขึ้นไปแถว 6 (สำหรับขาว) จะเปลี่ยนเป็นเม็ด',
  },
  'piece-khon': {
    role: 'khon',
    color: 'white',
    startSquare: 'e4',
    body:
      'โคนเดินได้ 5 ช่อง: ตรงหน้า 1 ช่อง + เฉียง 4 ช่อง. ' +
      'มีทิศ "หน้า" ที่ขึ้นกับสี — ขาวมองขึ้น (rank +1), ดำมองลง (rank -1). ' +
      'แข็งกว่าเม็ดเพราะมีช่องเดินเพิ่ม',
  },
  'piece-knight': {
    role: 'knight',
    color: 'white',
    startSquare: 'e4',
    body:
      'ม้าเดิน L-shape เหมือนหมากรุกสากล — 2 ช่องตรง + 1 ช่องขวาง. ' +
      'จุดพิเศษ: กระโดดข้ามตัวอื่นได้ (เป็นตัวเดียวที่ทำได้). ' +
      'มีค่าเทียบเท่าโคนคร่าว ๆ — ขึ้นกับตำแหน่ง',
  },
  'piece-rook': {
    role: 'rook',
    color: 'white',
    startSquare: 'e4',
    body:
      'เรือเดินแนวตรง / แนวขวาง ไกลเท่าไหร่ก็ได้ (จนชนตัวอื่นหรือสุดกระดาน). ' +
      'เป็นตัวที่แรงที่สุดในระยะไกล. ' +
      '2 เรือร่วมมือกันสามารถ checkmate ขุนเปลือยภายใน count 8 เท่านั้น',
  },
  'piece-bia': {
    role: 'bia',
    color: 'white',
    startSquare: 'd3',
    body:
      'เบี้ยเดินตรง 1 ช่อง (ขึ้นข้างหน้า — สีเขียวด้านล่าง), ' +
      'จับเฉียง 1 ช่อง (ช่องส้ม — เฉพาะถ้ามีตัวฝ่ายตรงข้ามให้จับ). ' +
      'ไม่มี en-passant ใน Makruk. ' +
      'เมื่อถึงแถว 6 (สำหรับขาว) → เปลี่ยนเป็นเม็ดอัตโนมัติ — เรียกว่า "เบี้ยหงาย"',
  },
};

export function LessonView({ lesson, isCompleted, onMarkComplete, onBack }: Props) {
  const pieceConfig = PIECE_LESSON_CONFIG[lesson.id];

  return (
    <div className="lesson-view">
      <button className="lesson-back" onClick={onBack}>
        ← กลับไปรายการบทเรียน
      </button>
      <header className="lesson-header">
        <h2>{lesson.title}</h2>
        <p className="lesson-desc">{lesson.description}</p>
      </header>

      {pieceConfig ? (
        <PieceMovementLesson config={pieceConfig} body={pieceConfig.body} />
      ) : (
        <ComingSoonLesson />
      )}

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

// ---- Piece-movement interactive demo ----------------------------------

function PieceMovementLesson({ config, body }: { config: PieceConfig; body: string }) {
  const [pieceSquare, setPieceSquare] = useState(config.startSquare);
  const [moveCount, setMoveCount] = useState(0);

  const legals = legalSquaresForPiece(config.role, config.color, pieceSquare);
  const biaSplit =
    config.role === 'bia' ? biaSquaresSplit(config.color, pieceSquare) : null;

  const handleSquareClick = (sq: string) => {
    if (sq === pieceSquare) return;
    if (!legals.includes(sq)) return; // ignore non-legal clicks
    setPieceSquare(sq);
    setMoveCount((n) => n + 1);
  };

  return (
    <div className="lesson-body">
      <p className="lesson-explanation">{body}</p>

      <div className="lesson-stats">
        <span>
          ตอนนี้ <strong>{ROLE_TH[config.role]}</strong> อยู่ที่{' '}
          <code>{pieceSquare}</code>
        </span>
        <span className="label-aside">
          เลื่อนหมาก {moveCount} ครั้ง · ลองคลิกช่องไฮไลต์
        </span>
      </div>

      <LessonBoard
        piece={{ role: config.role, color: config.color }}
        pieceSquare={pieceSquare}
        legalSquares={legals}
        biaSplit={biaSplit}
        onSquareClick={handleSquareClick}
      />

      <div className="lesson-legend">
        {config.role === 'bia' ? (
          <>
            <span className="legend-chip legend-push">●</span> เดินไปข้างหน้า{' '}
            <span className="legend-chip legend-capture">●</span> จับเฉียง
          </>
        ) : (
          <>
            <span className="legend-chip legend-push">●</span> ช่องที่ {ROLE_TH[config.role]} เดินได้ทั้งหมด
          </>
        )}
      </div>
    </div>
  );
}

function ComingSoonLesson() {
  return (
    <div className="lesson-comingsoon">
      <p>🚧 บทเรียน interactive ของบทนี้จะใส่ในเวอร์ชั่นถัดไป (Phase 2C)</p>
      <p className="label-aside">
        ตอนนี้กดปุ่ม "ทำเครื่องหมายเสร็จ" ก่อนได้ถ้าอ่านคำอธิบายในการ์ดแล้ว
      </p>
    </div>
  );
}

// ---- Lesson board: a static 8x8 grid that knows how to highlight ------

type LessonBoardProps = {
  piece: { role: Role; color: Color };
  pieceSquare: string;
  legalSquares: string[];
  biaSplit: { push: string[]; capture: string[] } | null;
  onSquareClick: (sq: string) => void;
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

function LessonBoard({
  piece,
  pieceSquare,
  legalSquares,
  biaSplit,
  onSquareClick,
}: LessonBoardProps) {
  const legalSet = new Set(legalSquares);
  const biaPush = new Set(biaSplit?.push ?? []);
  const biaCapture = new Set(biaSplit?.capture ?? []);

  return (
    <div className="lesson-board">
      {RANKS.map((rank, rankIdx) =>
        FILES.map((file, fileIdx) => {
          const sq = `${file}${rank}`;
          const isDark = (rankIdx + fileIdx) % 2 === 1;
          const hasPiece = sq === pieceSquare;
          const isLegal = legalSet.has(sq);
          const isBiaPush = biaPush.has(sq);
          const isBiaCapture = biaCapture.has(sq);

          const classes = [
            'lesson-square',
            isDark ? 'dark' : 'light',
            hasPiece && 'has-piece',
            isLegal && 'legal',
            isBiaCapture && 'bia-capture',
            isBiaPush && !isBiaCapture && 'bia-push',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={sq}
              className={classes}
              onClick={() => onSquareClick(sq)}
              aria-label={sq}
            >
              {hasPiece && (
                <div
                  className="lesson-piece"
                  style={{
                    backgroundImage: `url(/pieces/makruk/${piece.color}_${
                      ROLE_TO_CG[piece.role]
                    }.svg)`,
                  }}
                />
              )}
              {isLegal && !hasPiece && (
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
