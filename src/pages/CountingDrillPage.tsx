// 🔢 Counting Trainer drill page — self-contained mode where the user
// plays a preset endgame against the engine and must mate within the
// Makruk count limit. Route: `/#/counting` (level picker) or
// `/#/counting/<level-id>` (single drill).
//
// Wire-up:
//   - When `route.id === null`, render the level picker.
//   - When `route.id === '<level-id>'`, render the active drill.
//
// Engine play is intentionally local to this page (we don't reuse
// App.tsx's huge play state machine — too much coupling). The drill
// keeps a single ffish.Board, lets the user move, calls searchBestMove
// for the defending side, tracks user-move count, and ends when mate
// or count-limit reached.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board as FfishBoard } from 'ffish-es6';
import { Board } from '../components/Board';
import { loadFfish, parseLegalMoves } from '../lib/makruk';
import { searchBestMove, DIFFICULTY_PRESETS } from '../lib/engine';
import {
  DRILL_LEVELS,
  drillScore,
  findDrillLevel,
  loadDrillProgress,
  recordDrillClear,
  type DrillLevel,
} from '../lib/countingDrill';
import { navigate } from '../lib/router';

type Props = {
  levelId: string | null;
};

export function CountingDrillPage({ levelId }: Props) {
  if (!levelId) return <DrillIndex />;
  const level = findDrillLevel(levelId);
  if (!level) {
    return (
      <main className="drill-page">
        <p className="drill-error">⚠ ไม่พบ level id นี้</p>
        <button onClick={() => navigate({ tab: 'counting' })}>← กลับรายการ</button>
      </main>
    );
  }
  return <DrillRunner level={level} />;
}

// ─── Level picker ────────────────────────────────────────────────

function DrillIndex() {
  const progress = loadDrillProgress();
  return (
    <main className="drill-page drill-index">
      <header className="drill-index-header">
        <h2>🔢 Counting Trainer</h2>
        <p className="label-aside">
          ฝึก endgame เฉพาะของหมากรุกไทย · ไล่ขุนเปลือยให้จนภายในกรอบเวลา
        </p>
      </header>

      <div className="drill-levels">
        {DRILL_LEVELS.map((level) => {
          const best = progress.bestByLevel[level.id];
          const cleared = best !== undefined;
          const score = best ? drillScore(best.movesUsed, level.countLimit) : null;
          return (
            <button
              key={level.id}
              className={`drill-card ${cleared ? 'is-cleared' : ''}`}
              onClick={() => navigate({ tab: 'counting', id: level.id })}
            >
              <div className="drill-card-head">
                <strong>{level.title}</strong>
                {cleared && score && (
                  <span className="drill-card-stars">
                    {'⭐'.repeat(score.stars)}
                  </span>
                )}
              </div>
              <p className="drill-card-desc">{level.description}</p>
              {best && (
                <p className="label-aside">
                  ดีที่สุด: {best.movesUsed} ตา / กรอบ {level.countLimit} ตา
                </p>
              )}
            </button>
          );
        })}
      </div>

      <button
        className="drill-back"
        onClick={() => navigate({ tab: 'puzzles' })}
      >
        ← กลับ Puzzles
      </button>
    </main>
  );
}

// ─── Active drill runner ─────────────────────────────────────────

type DrillStatus = 'loading' | 'playing' | 'won' | 'failed';

function DrillRunner({ level }: { level: DrillLevel }) {
  const [status, setStatus] = useState<DrillStatus>('loading');
  const [fen, setFen] = useState<string>(level.fen);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [turn, setTurn] = useState<'white' | 'black'>('white');
  const [isCheck, setIsCheck] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [userMovesUsed, setUserMovesUsed] = useState(0);
  const [engineThinking, setEngineThinking] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const boardRef = useRef<FfishBoard | null>(null);

  // Boot ffish + load the starting position.
  useEffect(() => {
    let cancelled = false;
    let liveBoard: FfishBoard | null = null;
    loadFfish().then((ffish) => {
      if (cancelled) return;
      liveBoard = new ffish.Board('makruk', level.fen);
      boardRef.current = liveBoard;
      refreshFromBoard(liveBoard);
      setStatus('playing');
    });
    return () => {
      cancelled = true;
      if (liveBoard) {
        try {
          liveBoard.delete();
        } catch {
          /* ignore */
        }
        boardRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id]);

  const refreshFromBoard = useCallback((board: FfishBoard) => {
    const f = board.fen();
    setFen(f);
    setLegalMoves(parseLegalMoves(board.legalMoves()));
    setTurn(board.turn() ? 'white' : 'black');
    setIsCheck(board.isCheck());
  }, []);

  const handleUserMove = useCallback(
    async (from: string, to: string) => {
      if (status !== 'playing' || engineThinking) return;
      const board = boardRef.current;
      if (!board) return;

      const uci = `${from}${to}`;
      // Validate. parseLegalMoves returns just from+to (no promotion);
      // for the drill we don't need promotion handling — Bia isn't in
      // any of the endgame positions.
      const legal = parseLegalMoves(board.legalMoves());
      if (!legal.includes(uci)) return;

      board.push(uci);
      setLastMove({ from, to });
      const usedAfter = userMovesUsed + 1;
      setUserMovesUsed(usedAfter);
      refreshFromBoard(board);

      // Check for mate from the user.
      if (board.isGameOver(true)) {
        const result = board.result(true);
        const userWon = result === '1-0'; // user always plays white
        if (userWon) {
          setStatus('won');
          recordDrillClear(level.id, usedAfter);
        } else {
          setStatus('failed');
        }
        return;
      }

      // User used all the moves but didn't mate → count expired.
      if (usedAfter >= level.countLimit) {
        setStatus('failed');
        return;
      }

      // Engine reply.
      setEngineThinking(true);
      try {
        const preset = DIFFICULTY_PRESETS[level.engineDifficulty];
        const result = await searchBestMove(board.fen(), preset);
        const reply = result.bestMove;
        if (reply && reply.length >= 4) {
          board.push(reply);
          setLastMove({ from: reply.slice(0, 2), to: reply.slice(2, 4) });
          refreshFromBoard(board);
          if (board.isGameOver(true)) {
            // Engine somehow mated us (unlikely in these positions) or
            // game ended in a draw — count as failure.
            setStatus('failed');
          }
        }
      } catch {
        /* engine error — leave state for user to retry */
      } finally {
        setEngineThinking(false);
      }
    },
    [status, engineThinking, userMovesUsed, level.id, level.countLimit, level.engineDifficulty, refreshFromBoard],
  );

  const reset = () => {
    const ffishPromise = loadFfish();
    ffishPromise.then((ffish) => {
      const board = boardRef.current;
      if (board) {
        try {
          board.delete();
        } catch {
          /* ignore */
        }
      }
      const fresh = new ffish.Board('makruk', level.fen);
      boardRef.current = fresh;
      setUserMovesUsed(0);
      setLastMove(null);
      setShowHint(false);
      setStatus('playing');
      refreshFromBoard(fresh);
    });
  };

  const remaining = level.countLimit - userMovesUsed;
  const remainingPct = (remaining / level.countLimit) * 100;
  const movesNextLevel = nextLevel(level.id);
  const score =
    status === 'won' ? drillScore(userMovesUsed, level.countLimit) : null;

  return (
    <main className="drill-page drill-runner">
      <button
        className="drill-back"
        onClick={() => navigate({ tab: 'counting' })}
        aria-label="กลับรายการ"
      >
        ← รายการ
      </button>

      <header className="drill-header">
        <h2>{level.title}</h2>
        <p className="label-aside">{level.description}</p>
      </header>

      <div className="drill-layout">
        <div className="drill-board-col">
          {status === 'loading' && <p className="label-aside">กำลังโหลด…</p>}
          {status !== 'loading' && (
            <Board
              fen={fen}
              legalMoves={status === 'playing' ? legalMoves : []}
              flipped={false}
              disabled={status !== 'playing' || engineThinking}
              turn={turn}
              isCheck={isCheck}
              lastMove={lastMove}
              hint={null}
              onMove={handleUserMove}
            />
          )}
        </div>

        <aside className="drill-sidebar">
          <div className="drill-counter">
            <div className="drill-counter-label">เหลือ</div>
            <div className="drill-counter-value">
              {Math.max(0, remaining)} <span className="drill-counter-unit">ตา</span>
            </div>
            <div
              className={`drill-counter-bar ${
                remainingPct < 25 ? 'is-danger' : remainingPct < 50 ? 'is-warn' : ''
              }`}
            >
              <div
                className="drill-counter-fill"
                style={{ width: `${Math.max(0, remainingPct)}%` }}
              />
            </div>
            <div className="label-aside">
              ใช้ไป {userMovesUsed} / กรอบ {level.countLimit}
            </div>
          </div>

          {engineThinking && (
            <p className="label-aside">🤔 คู่ต่อสู้คิด…</p>
          )}

          {showHint && (
            <div className="drill-hint">
              💡 {level.hint}
            </div>
          )}

          {status === 'playing' && !showHint && (
            <button
              className="drill-action drill-secondary"
              onClick={() => setShowHint(true)}
            >
              💡 ขอคำใบ้
            </button>
          )}

          {status === 'won' && score && (
            <div className="drill-result is-won">
              <div className="drill-result-icon">🏆</div>
              <div className="drill-result-title">ผ่าน!</div>
              <div className="drill-result-meta">
                ใช้ {userMovesUsed} ตา · กรอบ {level.countLimit}
              </div>
              <div className="drill-result-stars">{'⭐'.repeat(score.stars)}</div>
              <div className="drill-result-actions">
                <button onClick={reset} className="drill-action drill-secondary">
                  ↻ ลองอีกครั้ง
                </button>
                {movesNextLevel && (
                  <button
                    onClick={() => navigate({ tab: 'counting', id: movesNextLevel })}
                    className="drill-action"
                  >
                    ระดับถัดไป →
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="drill-result is-failed">
              <div className="drill-result-icon">💔</div>
              <div className="drill-result-title">
                {userMovesUsed >= level.countLimit ? 'กรอบเวลาหมด' : 'จบเกมแล้ว'}
              </div>
              <div className="drill-result-meta">
                ใช้ {userMovesUsed} ตา / กรอบ {level.countLimit}
              </div>
              <div className="drill-result-actions">
                <button onClick={reset} className="drill-action">
                  ↻ ลองอีกครั้ง
                </button>
                <button
                  onClick={() => {
                    setShowHint(true);
                    reset();
                  }}
                  className="drill-action drill-secondary"
                >
                  💡 ลองพร้อมคำใบ้
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function nextLevel(currentId: string): string | null {
  const idx = DRILL_LEVELS.findIndex((l) => l.id === currentId);
  if (idx < 0) return null;
  return DRILL_LEVELS[idx + 1]?.id ?? null;
}
