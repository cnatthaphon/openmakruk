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
  type AnnotatedMove,
  type Classification,
} from '../lib/review';
import { fenToPieceMap } from '../lib/makruk';
import { letterToPiece } from '../lib/chessAttacks';

type Props = {
  moves: AnnotatedMove[];
  /** Which side the human played. Self-play / manual passes null → we
   * fall back to white as the "report subject". */
  userSide: 'white' | 'black' | null;
  /** Game result string from ffish: "1-0" | "0-1" | "1/2-1/2" | "*"
   * (* = ongoing). Drives the win/loss/draw verdict. */
  result: string;
  onJumpToPly: (ply: number) => void;
};

export function GameReport({ moves, userSide, result, onJumpToPly }: Props) {
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

  return (
    <section className="game-report">
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

      {moments.length === 0 ? (
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
              <KeyMomentCard key={m.ply} move={m} onJump={() => onJumpToPly(m.ply)} />
            ))}
          </div>
        </>
      )}

      {moments[0] && (
        <div className="report-verdict">
          📌 เกมนี้พลาดมากที่สุดในตา <strong>{moments[0].ply}</strong> —
          เล่น <code>{moments[0].uci}</code> แทนที่จะเล่น{' '}
          <code>{moments[0].bestMove}</code> ทำให้เสีย{' '}
          <strong>{(moments[0].delta / 100).toFixed(1)}</strong> pawn
        </div>
      )}
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

function KeyMomentCard({ move, onJump }: { move: AnnotatedMove; onJump: () => void }) {
  return (
    <button className="key-moment" onClick={onJump} title="คลิกเพื่อข้ามไปดูตำแหน่งนี้บนกระดาน">
      <MiniBoard fen={move.fenBefore} />
      <div className="key-moment-body">
        <div className="key-moment-header">
          <span className="key-moment-ply">ตา {move.ply}</span>
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
          <span className="label">เล่น:</span>{' '}
          <code className="bad">{move.uci}</code>{' '}
          <span className="label-aside">
            (เสีย {(move.delta / 100).toFixed(1)})
          </span>
        </div>
        <div className="key-moment-line">
          <span className="label">ควรเล่น:</span>{' '}
          <code className="good">{move.bestMove}</code>
        </div>
      </div>
    </button>
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

function MiniBoard({ fen }: { fen: string }) {
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
    </div>
  );
}
