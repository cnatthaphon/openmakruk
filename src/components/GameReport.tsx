// 📊 Post-game report — accuracy + ACPL + key moments.
//
// Sits above the full move list in the review panel. Surfaces THE
// THREE THINGS a learner cares about most:
//
//   1. A single number (Accuracy %) that tracks across games — "am I
//      getting better?"
//   2. A handful of "key moments" — the 3 highest-delta non-best moves
//      on the user's side — that are worth replaying carefully
//   3. A one-line verdict highlighting where the game was decided
//
// Re-uses the per-move analysis the existing `analyzeGame` already
// computes — no extra engine calls.

import {
  accuracyFor,
  acplFor,
  classCountFor,
  CLASSIFICATION_COLORS,
  CLASSIFICATION_GLYPHS,
  CLASSIFICATION_LABELS,
  keyMoments,
  moveCommentary,
  type AnnotatedMove,
  type Classification,
} from '../lib/review';
import { fenToPieceMap } from '../lib/makruk';
import { letterToPiece } from '../lib/chessAttacks';
import { thaiUci } from '../lib/thaiUci';
import { useState } from 'react';
import { promoteReviewedPosition } from '../lib/reviewPipeline';
import { loadStats } from '../lib/stats';
import { toast } from './Toast';

type Props = {
  moves: AnnotatedMove[];
  /** Which side the human played. Self-play / manual passes null → we
   * fall back to white as the "report subject". */
  userSide: 'white' | 'black' | null;
  /** Game result string from ffish: "1-0" | "0-1" | "1/2-1/2" | "*"
   * (* = ongoing). Drives the win/loss/draw verdict. */
  result: string;
  onJumpToPly: (ply: number) => void;
  /** Which slice of the report to render:
   *   'summary'  → header + accuracy + counts + verdict (stats card)
   *   'moments'  → just the key-moment cards
   *   'all'      → the full thing (default)
   * Used by the Review-panel sub-tabs so each tab fits in one screen. */
  subView?: 'summary' | 'moments' | 'all';
};

export function GameReport({ moves, userSide, result, onJumpToPly, subView = 'all' }: Props) {
  if (moves.length === 0) return null;

  // For self-play / manual modes we fall back to white as the
  // "subject" of the report — the structure still works.
  const side: 'white' | 'black' = userSide ?? 'white';
  const opp: 'white' | 'black' = side === 'white' ? 'black' : 'white';

  const userAccuracy = accuracyFor(moves, side);
  const oppAccuracy  = accuracyFor(moves, opp);
  const userAcpl     = acplFor(moves, side);
  const oppAcpl      = acplFor(moves, opp);
  const userCounts   = classCountFor(moves, side);
  const moments      = keyMoments(moves, side, 3);

  const userWon =
    (result === '1-0' && side === 'white') ||
    (result === '0-1' && side === 'black');
  const draw = result === '1/2-1/2';

  const showSummary = subView === 'summary' || subView === 'all';
  const showMoments = subView === 'moments' || subView === 'all';

  return (
    <section className="game-report">
      {showSummary && (
        <>
          <div className="report-header">
            <span className="report-title">📊 รายงานเกม</span>
            <span className={`report-result ${userWon ? 'win' : draw ? 'draw' : 'loss'}`}>
              {userWon ? '🏆 ชนะ' : draw ? '🤝 เสมอ' : result === '*' ? '⏳ กำลังเล่น' : '❌ แพ้'}
            </span>
          </div>

          <div className="report-accuracy-row">
            <AccuracyCard label="คุณ" accuracy={userAccuracy} acpl={userAcpl} highlight />
            <AccuracyCard label="ฝ่ายตรงข้าม" accuracy={oppAccuracy} acpl={oppAcpl} />
          </div>

          <div className="report-counts" title="สรุปคุณภาพการเดินของฝ่ายคุณ">
            {(['best', 'good', 'inaccuracy', 'mistake', 'blunder'] as Classification[]).map((c) => (
              <div
                key={c}
                className="report-count"
                style={{ borderColor: CLASSIFICATION_COLORS[c] }}
              >
                <span
                  className="report-count-num"
                  style={{ color: CLASSIFICATION_COLORS[c] }}
                >
                  {userCounts[c]}
                </span>
                <span className="report-count-label">
                  {CLASSIFICATION_GLYPHS[c]} {CLASSIFICATION_LABELS[c]}
                </span>
              </div>
            ))}
          </div>

          {moments[0] && (
            <div className="report-verdict">
              📌 ตาที่พลาดมากสุด: <strong>ตาที่ {moments[0].ply}</strong> ·
              เล่น <code>{thaiUci(moments[0].uci)}</code> แทน{' '}
              <code>{thaiUci(moments[0].bestMove)}</code> · ตำแหน่งแย่ลง{' '}
              <strong>{(moments[0].delta / 100).toFixed(1)} คะแนน</strong>
            </div>
          )}
        </>
      )}

      {showMoments &&
        (moments.length === 0 ? (
          <div className="report-clean">
            ✨ ไม่มีตาพลาดสำคัญ — เกมนี้เล่นได้สะอาด
          </div>
        ) : (
          <>
            <h4 className="report-section-title">
              🎯 ตาสำคัญที่น่าเรียนรู้ ({moments.length} ตา)
            </h4>
            <div className="report-key-moments">
              {moments.map((m) => (
                <KeyMomentCard
                  key={m.ply}
                  move={m}
                  userSide={userSide}
                  result={result}
                  onJump={() => onJumpToPly(m.ply)}
                />
              ))}
            </div>
          </>
        ))}
    </section>
  );
}

function AccuracyCard({
  label,
  accuracy,
  acpl,
  highlight,
}: {
  label: string;
  accuracy: number;
  acpl: number;
  highlight?: boolean;
}) {
  // Tier color: <60 red, 60-79 amber, 80-89 green, 90+ gold
  const tier =
    accuracy >= 90 ? 'gold'
      : accuracy >= 80 ? 'green'
        : accuracy >= 60 ? 'amber'
          : 'red';
  return (
    <div className={`accuracy-card ${highlight ? 'highlight' : ''} tier-${tier}`}>
      <div className="accuracy-card-label">{label}</div>
      <div className="accuracy-card-value">{accuracy}%</div>
      <div className="accuracy-card-sub">ACPL {acpl}</div>
    </div>
  );
}

function KeyMomentCard({
  move,
  userSide,
  result,
  onJump,
}: {
  move: AnnotatedMove;
  userSide: 'white' | 'black' | null;
  result: string;
  onJump: () => void;
}) {
  const [mining, setMining] = useState(false);
  const [mined, setMined] = useState(false);
  const handleMine = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mining || mined) return;
    setMining(true);
    // Goes through the contract pipeline (lift → extract(spec) →
    // repository.promote) — this component imports neither the engine,
    // the verifier, nor the puzzle store. See src/lib/reviewPipeline.
    const promoted = await promoteReviewedPosition(move, {
      authorName: loadStats().displayName,
      userSide,
      result,
    });
    setMining(false);
    if (promoted.ok) {
      setMined(true);
      toast.success('📌 บันทึกเป็น puzzle แล้ว · ดูที่ tab ปริศนา → ของฉัน');
    } else {
      toast.error(`บันทึก puzzle ไม่สำเร็จ: ${promoted.reason}`);
    }
  };
  return (
    <div
      className="key-moment"
      onClick={onJump}
      title="คลิกเพื่อข้ามไปดูตำแหน่งนี้บนกระดาน"
      role="button"
      tabIndex={0}
    >
      <MiniBoard
        fen={move.fenBefore}
        playedArrow={{ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) }}
        bestArrow={
          move.bestMove && move.bestMove !== move.uci
            ? { from: move.bestMove.slice(0, 2), to: move.bestMove.slice(2, 4) }
            : undefined
        }
      />
      <div className="key-moment-body">
        <div className="key-moment-header">
          <span className="key-moment-ply">ตาที่ {move.ply}</span>
          <span className="key-moment-side">{move.side === 'white' ? '♔' : '♚'}</span>
          <span
            className="key-moment-class"
            style={{
              color: CLASSIFICATION_COLORS[move.classification],
              borderColor: CLASSIFICATION_COLORS[move.classification],
            }}
          >
            {CLASSIFICATION_GLYPHS[move.classification]}{' '}
            {CLASSIFICATION_LABELS[move.classification]}
          </span>
        </div>
        <div className="key-moment-line">
          <span className="key-moment-arrow-key bad">↗</span>
          <span className="label">ที่เล่น:</span>{' '}
          <code className="bad">{thaiUci(move.uci)}</code>{' '}
          <span className="label-aside" title="หน่วยวัดของ engine: 1 คะแนน ≈ มูลค่าของเบี้ย 1 ตัว · ใช้บอกว่าตำแหน่งแย่ลงเท่าไหร่">
            (เสียคะแนน {(move.delta / 100).toFixed(1)})
          </span>
        </div>
        <div className="key-moment-line">
          <span className="key-moment-arrow-key good">↗</span>
          <span className="label">ควรเล่น:</span>{' '}
          <code className="good">{thaiUci(move.bestMove)}</code>
        </div>
        <div className="key-moment-commentary">
          {moveCommentary(move)}
        </div>
        <button
          type="button"
          className="key-moment-mine"
          onClick={handleMine}
          disabled={mining || mined}
        >
          {mined ? '✓ บันทึกแล้ว' : mining ? '🔄 กำลังบันทึก...' : '📌 บันทึกเป็น puzzle'}
        </button>
      </div>
    </div>
  );
}

// ---- Mini-board (reused pattern from LibraryPage) ----------------------

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const ROLE_TO_CG: Record<string, string> = {
  king: 'king',
  met: 'queen',
  khon: 'bishop',
  knight: 'knight',
  rook: 'rook',
  bia: 'pawn',
};

type ArrowSpec = { from: string; to: string };

function MiniBoard({
  fen,
  playedArrow,
  bestArrow,
}: {
  fen: string;
  playedArrow?: ArrowSpec;
  bestArrow?: ArrowSpec;
}) {
  const pieces = fenToPieceMap(fen);
  return (
    <div className="key-moment-board" aria-hidden="true">
      {RANKS.map((rank, rankIdx) =>
        FILES.map((file, fileIdx) => {
          const sq = `${file}${rank}`;
          const letter = pieces[sq];
          const piece = letter ? letterToPiece(letter) : null;
          const isDark = (rankIdx + fileIdx) % 2 === 1;
          return (
            <div
              key={sq}
              className={`key-moment-square ${isDark ? 'dark' : 'light'}`}
            >
              {piece && (
                <div
                  className="key-moment-piece"
                  style={{
                    backgroundImage: `url(/pieces/makruk/${piece.color}_${
                      ROLE_TO_CG[piece.role] ?? 'pawn'
                    }.svg)`,
                  }}
                />
              )}
            </div>
          );
        }),
      )}
      {(playedArrow || bestArrow) && (
        <svg
          className="key-moment-arrows"
          viewBox="0 0 96 96"
          preserveAspectRatio="none"
        >
          <defs>
            <marker
              id="arrowhead-bad"
              markerWidth="5"
              markerHeight="5"
              refX="4"
              refY="2.5"
              orient="auto"
            >
              <polygon points="0,0 5,2.5 0,5" fill="#e87a7a" />
            </marker>
            <marker
              id="arrowhead-good"
              markerWidth="5"
              markerHeight="5"
              refX="4"
              refY="2.5"
              orient="auto"
            >
              <polygon points="0,0 5,2.5 0,5" fill="#79b87f" />
            </marker>
          </defs>
          {playedArrow && (
            <ArrowLine arrow={playedArrow} color="#e87a7a" markerEnd="arrowhead-bad" />
          )}
          {bestArrow && (
            <ArrowLine arrow={bestArrow} color="#79b87f" markerEnd="arrowhead-good" />
          )}
        </svg>
      )}
    </div>
  );
}

/** Render one move arrow on the 96×96 mini-board's SVG overlay. */
function ArrowLine({
  arrow,
  color,
  markerEnd,
}: {
  arrow: ArrowSpec;
  color: string;
  markerEnd: string;
}) {
  // 8×8 board on a 96×96 viewBox → 12px per square, 6px = square centre.
  // Files go left-to-right (a=col 0 → h=col 7).
  // Ranks: rank 8 at top (row 0), rank 1 at bottom (row 7).
  const cell = 12;
  const half = cell / 2;
  const fromFile = arrow.from.charCodeAt(0) - 97;
  const fromRank = parseInt(arrow.from[1], 10);
  const toFile = arrow.to.charCodeAt(0) - 97;
  const toRank = parseInt(arrow.to[1], 10);
  if (
    fromFile < 0 || fromFile > 7 ||
    toFile < 0 || toFile > 7 ||
    fromRank < 1 || fromRank > 8 ||
    toRank < 1 || toRank > 8
  ) {
    return null;
  }
  const fx = fromFile * cell + half;
  const fy = (8 - fromRank) * cell + half;
  const tx = toFile * cell + half;
  const ty = (8 - toRank) * cell + half;
  return (
    <line
      x1={fx}
      y1={fy}
      x2={tx}
      y2={ty}
      stroke={color}
      strokeWidth="2.5"
      strokeOpacity="0.85"
      markerEnd={`url(#${markerEnd})`}
    />
  );
}
