// Per-row history replay viewer.
//
// Issue #21: every finished game in stats.history needs a "step through
// the moves" surface. We reuse the same building blocks the Exhibition
// replay uses (loadFfish → push each UCI → collect FENs, BoardLayout
// shell, disabled <Board>) so the visual rhythm matches Play / Puzzles
// / Exhibition exactly.
//
// What this is NOT:
//   - It does NOT run an engine, score, or re-analyze. Re-analyze
//     belongs to the (in-flight) ReviewRuntime contract and is
//     surfaced through a separate button — see ProfilePage.
//   - It does NOT mutate stats or talk to the worker. Pure viewer.
//
// Edge cases this handles:
//   - record.moves missing/empty (legacy records before plyCount-bearing
//     history) → render the start position, disable steppers, show a
//     'ไม่มีรายละเอียดตา' notice.
//   - moves array doesn't replay cleanly (ffish push() throws on an
//     illegal UCI for the current position) → bail out at that ply
//     instead of crashing; show whatever prefix we managed to load.
//   - Component unmounts mid-load → don't setState, don't leak the
//     ffish Board instance.

import { useEffect, useMemo, useState } from 'react';
import { Board } from '../../components/Board';
import { BoardLayout } from '../../components/BoardLayout';
import { loadFfish, MAKRUK_START_FEN } from '../../lib/makruk';
import { DIFFICULTY_LABELS } from '../../lib/engine';
import type { GameRecord } from '../../lib/stats';

type Props = {
  record: GameRecord;
  /** Called when the user dismisses the viewer (back button, Esc). */
  onClose: () => void;
};

export function HistoryReplay({ record, onClose }: Props) {
  const moves = record.moves ?? [];
  const [fens, setFens] = useState<string[]>([MAKRUK_START_FEN]);
  const [ply, setPly] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Replay through ffish once on mount to compute the per-ply FEN
  // array. This is the same pattern Exhibition uses; keeping the
  // shape identical means a future shared "replay" hook can absorb
  // both call sites without code surgery.
  useEffect(() => {
    if (moves.length === 0) return;
    let cancelled = false;
    loadFfish().then((ffish) => {
      if (cancelled) return;
      const ffishAny = ffish as unknown as {
        Board: new (variant: string, fen: string) => {
          push: (uci: string) => void;
          fen: () => string;
          delete: () => void;
        };
      };
      const board = new ffishAny.Board('makruk', MAKRUK_START_FEN);
      const out: string[] = [MAKRUK_START_FEN];
      try {
        for (let i = 0; i < moves.length; i++) {
          try {
            board.push(moves[i]);
            out.push(board.fen());
          } catch (e) {
            // An illegal move in the persisted record (rare — usually
            // means the record was hand-edited or the rules engine
            // changed). Show what we have so far + a notice.
            if (!cancelled) {
              setLoadError(
                `ไม่สามารถเล่นต่อจากตาที่ ${i + 1} (${moves[i]}): ${String(e)}`,
              );
            }
            break;
          }
        }
        if (!cancelled) setFens(out);
      } finally {
        board.delete();
      }
    }).catch((e: unknown) => {
      if (!cancelled) setLoadError(`โหลด ffish ไม่ได้: ${String(e)}`);
    });
    return () => {
      cancelled = true;
    };
  }, [moves]);

  const maxPly = fens.length - 1;
  const safePly = Math.min(ply, maxPly);
  const currentFen = fens[safePly] ?? MAKRUK_START_FEN;
  const lastMoveUci = safePly > 0 ? moves[safePly - 1] : null;

  const dateLabel = useMemo(() => {
    const d = new Date(record.date);
    return d.toLocaleString('th-TH');
  }, [record.date]);

  const outcomeLabel =
    record.outcome === 'win' ? 'ชนะ' : record.outcome === 'loss' ? 'แพ้' : 'เสมอ';
  const outcomeClass =
    record.outcome === 'win' ? 'is-win' : record.outcome === 'loss' ? 'is-loss' : 'is-draw';

  return (
    <section className="history-replay">
      <button
        className="history-replay-back"
        onClick={onClose}
        aria-label="ปิดผู้เล่นซ้ำ"
      >
        ← กลับประวัติเกม
      </button>
      <BoardLayout
        left={
          <header className="history-replay-header">
            <div className="history-replay-vs">
              <span className="history-replay-side">
                คุณ ({record.userSide === 'white' ? '♔' : '♚'})
              </span>
              <span className={`history-replay-outcome ${outcomeClass}`}>
                {outcomeLabel}
              </span>
              <span className="history-replay-side">
                vs {record.opponentLabel ?? DIFFICULTY_LABELS[record.ratingBucket]}
              </span>
            </div>
            <p className="label-aside">
              {record.plyCount} ตา · {dateLabel}
              {record.ratingDelta !== 0 && (
                <>
                  {' · '}
                  <span className={record.ratingDelta >= 0 ? 'up' : 'down'}>
                    {record.ratingDelta >= 0 ? '+' : ''}
                    {record.ratingDelta}
                  </span>
                  {' → '}
                  {record.ratingAfter}
                </>
              )}
            </p>
            {loadError && (
              <p className="history-replay-warning" role="status">
                ⚠ {loadError}
              </p>
            )}
            {moves.length === 0 && (
              <p className="history-replay-warning" role="status">
                ไม่มีรายละเอียดตา — เกมนี้บันทึกก่อน Phase ที่เก็บ moves
              </p>
            )}
          </header>
        }
        board={
          <Board
            fen={currentFen}
            legalMoves={[]}
            flipped={record.userSide === 'black'}
            disabled
            turn={safePly % 2 === 0 ? 'white' : 'black'}
            isCheck={false}
            lastMove={
              lastMoveUci
                ? { from: lastMoveUci.slice(0, 2), to: lastMoveUci.slice(2, 4) }
                : null
            }
            hint={null}
            onMove={() => undefined}
          />
        }
        right={
          <div className="history-replay-stepper">
            <button
              onClick={() => setPly(0)}
              disabled={safePly === 0 || moves.length === 0}
              aria-label="ตาแรก"
            >
              ⏮
            </button>
            <button
              onClick={() => setPly((p) => Math.max(0, p - 1))}
              disabled={safePly === 0 || moves.length === 0}
              aria-label="ตาก่อน"
            >
              ◀
            </button>
            <span className="label-aside history-replay-ply">
              ตา {safePly} / {maxPly}
            </span>
            <button
              onClick={() => setPly((p) => Math.min(maxPly, p + 1))}
              disabled={safePly === maxPly || moves.length === 0}
              aria-label="ตาถัดไป"
            >
              ▶
            </button>
            <button
              onClick={() => setPly(maxPly)}
              disabled={safePly === maxPly || moves.length === 0}
              aria-label="ตาสุดท้าย"
            >
              ⏭
            </button>
          </div>
        }
      />
    </section>
  );
}
