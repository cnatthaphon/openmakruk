// 🛡️ Survive page — defensive challenge built on top of the
// existing defense-category puzzles.
//
// Picker (/#/survive) lists each defense position with the player's
// best plies-survived. Picking one starts a defensive game where
// the engine plays the attacking side at master difficulty and the
// player has to survive SURVIVE_TARGET_PLIES of their own moves.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board as FfishBoard } from 'ffish-es6';
import { Board } from '../components/Board';
import { BoardLayout } from '../components/BoardLayout';
import { BackButton } from '../components/BackButton';
import { loadFfish, parseLegalMoves } from '../lib/makruk';
import { loadPuzzles } from '../lib/content';
import type { Puzzle } from '../lib/puzzleSchema';
import { searchBestMove, DIFFICULTY_PRESETS } from '../lib/engine';
import {
  SURVIVE_TARGET_PLIES,
  loadSurviveProgress,
  recordSurviveRun,
} from '../lib/surviveMode';
import { navigate } from '../lib/router';

type Props = { positionId: string | null };

export function SurvivePage({ positionId }: Props) {
  if (!positionId) return <SurviveIndex />;
  return <SurviveRunner positionId={positionId} />;
}

// ─── Picker ──────────────────────────────────────────────────

function SurviveIndex() {
  const [positions, setPositions] = useState<Puzzle[] | null>(null);
  const progress = loadSurviveProgress();

  useEffect(() => {
    let cancelled = false;
    loadPuzzles().then((all) => {
      if (cancelled) return;
      setPositions(all.filter((p) => p.category === 'defense'));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="survive-page">
      <BackButton to="puzzles">ปริศนา</BackButton>
      <header className="survive-header">
        <h2>🛡️ Survive the attack</h2>
        <p className="label-aside">
          ตำแหน่งภายใต้แรงกดดัน · ป้องกันให้ครบ {SURVIVE_TARGET_PLIES} ตา (ของคุณ) โดยไม่ถูกรุกฆาต = ชนะ
        </p>
      </header>

      {!positions && <p className="label-aside">กำลังโหลด…</p>}
      {positions && positions.length === 0 && (
        <p className="label-aside">ยังไม่มีตำแหน่ง defense · เพิ่มได้ผ่าน JSON</p>
      )}
      {positions && positions.length > 0 && (
        <div className="survive-list">
          {positions.map((p) => {
            const best = progress.bestById[p.id];
            const cleared = best && best.plies >= SURVIVE_TARGET_PLIES;
            return (
              <button
                key={p.id}
                className={`survive-card ${cleared ? 'is-cleared' : ''}`}
                onClick={() => navigate({ tab: 'survive', id: p.id })}
              >
                <div className="survive-card-head">
                  <strong>{p.id}</strong>
                  {best && (
                    <span className="survive-card-best">
                      ดีที่สุด: {best.plies} ตา {cleared && '⭐'}
                    </span>
                  )}
                </div>
                <div className="label-aside">
                  rating {p.rating} · {p.themes.join(' · ')}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

// ─── Runner ──────────────────────────────────────────────────

type Status = 'loading' | 'playing' | 'cleared' | 'mated';

function SurviveRunner({ positionId }: { positionId: string }) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [fen, setFen] = useState<string>('');
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [turn, setTurn] = useState<'white' | 'black'>('white');
  const [isCheck, setIsCheck] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [userPlies, setUserPlies] = useState(0);
  const [engineThinking, setEngineThinking] = useState(false);
  const [userSide, setUserSide] = useState<'white' | 'black'>('white');

  const boardRef = useRef<FfishBoard | null>(null);

  useEffect(() => {
    let cancelled = false;
    let live: FfishBoard | null = null;
    Promise.all([loadPuzzles(), loadFfish()]).then(([catalog, ffish]) => {
      if (cancelled) return;
      const p = catalog.find((x) => x.id === positionId);
      if (!p) {
        setStatus('mated');
        return;
      }
      setPuzzle(p);
      setUserSide(p.toMove);
       
      const ffishAny = ffish as any;
      live = new ffishAny.Board('makruk', p.fen);
      boardRef.current = live;
      setFen(live!.fen());
      setLegalMoves(parseLegalMoves(live!.legalMoves()));
      setTurn(live!.turn() ? 'white' : 'black');
      setIsCheck(live!.isCheck());
      setStatus('playing');
    });
    return () => {
      cancelled = true;
      if (live) try { live.delete(); } catch { /* ignore */ }
    };
  }, [positionId]);

  const refresh = useCallback((board: FfishBoard) => {
    setFen(board.fen());
    setLegalMoves(parseLegalMoves(board.legalMoves()));
    setTurn(board.turn() ? 'white' : 'black');
    setIsCheck(board.isCheck());
  }, []);

  const handleMove = useCallback(
    async (from: string, to: string) => {
      if (status !== 'playing' || engineThinking) return;
      const board = boardRef.current;
      if (!board) return;
      const uci = `${from}${to}`;
      const legal = parseLegalMoves(board.legalMoves());
      if (!legal.includes(uci)) return;

      board.push(uci);
      setLastMove({ from, to });
      const plies = userPlies + 1;
      setUserPlies(plies);
      refresh(board);

      // After user's move — check game-over
      if (board.isGameOver(true)) {
        const result = board.result(true);
        const userWon = (result === '1-0' && userSide === 'white') ||
                        (result === '0-1' && userSide === 'black');
        if (userWon || result === '1/2-1/2') {
          // User survived via mate, stalemate, or draw — count as cleared
          setStatus('cleared');
          recordSurviveRun(positionId, plies);
        } else {
          setStatus('mated');
        }
        return;
      }

      if (plies >= SURVIVE_TARGET_PLIES) {
        // Survived target — record + cleared
        setStatus('cleared');
        recordSurviveRun(positionId, plies);
        return;
      }

      // Engine reply (attacking side) at master difficulty
      setEngineThinking(true);
      try {
        const preset = DIFFICULTY_PRESETS.master;
        const result = await searchBestMove(board.fen(), preset);
        const reply = result.bestMove;
        if (reply && reply.length >= 4) {
          board.push(reply);
          setLastMove({ from: reply.slice(0, 2), to: reply.slice(2, 4) });
          refresh(board);
          if (board.isGameOver(true)) {
            const r = board.result(true);
            const userWonAfter = (r === '1-0' && userSide === 'white') ||
                                 (r === '0-1' && userSide === 'black');
            if (userWonAfter || r === '1/2-1/2') {
              setStatus('cleared');
              recordSurviveRun(positionId, plies);
            } else {
              setStatus('mated');
            }
          }
        }
      } catch {
        /* engine error — let user retry */
      } finally {
        setEngineThinking(false);
      }
    },
    [status, engineThinking, userPlies, positionId, userSide, refresh],
  );

  return (
    <main className="survive-page survive-runner">
      <BackButton to="survive">รายการ Survive</BackButton>
      {!puzzle && status === 'mated' && (
        <p className="survive-error">⚠ ไม่พบตำแหน่ง</p>
      )}
      {puzzle && (
        <BoardLayout
          left={
            <header className="survive-runner-head">
              <h2>{puzzle.id}</h2>
              <p className="label-aside">
                คุณป้องกัน {userSide === 'white' ? '♔ ขาว' : '♚ ดำ'} · ต้องอยู่รอด {SURVIVE_TARGET_PLIES} ตา
              </p>
            </header>
          }
          board={
            <Board
              fen={fen}
              legalMoves={status === 'playing' ? legalMoves : []}
              flipped={userSide === 'black'}
              disabled={status !== 'playing' || engineThinking}
              turn={turn}
              isCheck={isCheck}
              lastMove={lastMove}
              hint={null}
              onMove={handleMove}
            />
          }
          right={
            <>
              <div className="survive-counter">
                ผ่าน {userPlies} / {SURVIVE_TARGET_PLIES}
                {engineThinking && <div className="label-aside">🤔 ฝ่ายโจมตีคิด…</div>}
              </div>
              {status === 'cleared' && (
                <div className="survive-result is-cleared">
                  <div className="survive-result-icon">🛡️</div>
                  <div className="survive-result-title">รอดแล้ว!</div>
                  <div className="label-aside">ผ่าน {userPlies} ตา</div>
                  <button className="survive-restart" onClick={() => window.location.reload()}>
                    ↻ ลองอีกครั้ง
                  </button>
                </div>
              )}
              {status === 'mated' && (
                <div className="survive-result is-mated">
                  <div className="survive-result-icon">💔</div>
                  <div className="survive-result-title">ถูกรุกฆาตที่ตา {userPlies}</div>
                  <div className="label-aside">ลองมุมใหม่</div>
                  <button className="survive-restart" onClick={() => window.location.reload()}>
                    ↻ ลองอีกครั้ง
                  </button>
                </div>
              )}
            </>
          }
        />
      )}
    </main>
  );
}
