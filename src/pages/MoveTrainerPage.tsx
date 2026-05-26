// 📖 Move Trainer — drill a known opening's moves until they stick.
//
// Routes:
//   /#/movetrainer            → opening picker
//   /#/movetrainer/<openId>   → drill mode for that opening
//
// Drill flow:
//   • Replay opening through ffish to compute the FEN after each ply
//   • Each odd ply (1, 3) the user must produce — even plies the
//     "opponent" auto-plays so the user only drills their own side
//   • Correct first-try → +1 to perfect score, advance
//   • Wrong → red flash, reveal, retry on the SAME ply (no perfect
//     credit) — once they get it, advance

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board as FfishBoard } from 'ffish-es6';
import { Board } from '../components/Board';
import { loadFfish, MAKRUK_START_FEN, parseLegalMoves } from '../lib/makruk';
import { loadOpenings } from '../lib/content';
import type { Opening } from '../lib/extraContentSchema';
import {
  loadTrainerProgress,
  recordTrainerRun,
} from '../lib/moveTrainer';
import { navigate } from '../lib/router';

type Props = { openingId: string | null };

export function MoveTrainerPage({ openingId }: Props) {
  if (!openingId) return <TrainerIndex />;
  return <TrainerRunner openingId={openingId} />;
}

// ─── Picker ────────────────────────────────────────────────────

function TrainerIndex() {
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const progress = loadTrainerProgress();

  useEffect(() => {
    let cancelled = false;
    loadOpenings().then((o) => {
      if (!cancelled) setOpenings(o);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="trainer-page">
      <button className="trainer-back" onClick={() => navigate({ tab: 'study' })}>
        ← กลับ ทฤษฎี
      </button>
      <header className="trainer-header">
        <h2>📖 Move Trainer</h2>
        <p className="label-aside">
          ฝึกจำ opening ทีละ ply · กดถูก = +1 คะแนน · เปิด opening ที่ลง ratingBand
          เหมาะกับคุณก่อน
        </p>
      </header>

      {!openings && <p className="label-aside">กำลังโหลด…</p>}
      {openings && openings.length === 0 && (
        <p className="label-aside">ยังไม่มี opening · เพิ่มผ่าน JSON</p>
      )}
      {openings && (
        <div className="trainer-list">
          {openings.map((o) => {
            const best = progress.bestByOpening[o.id];
            const userMoves = Math.ceil(o.moves.length / 2);
            return (
              <button
                key={o.id}
                className={`trainer-card ${best && best.perfectMoves === userMoves ? 'is-mastered' : ''}`}
                onClick={() => navigate({ tab: 'movetrainer', id: o.id })}
              >
                <div className="trainer-card-head">
                  <strong>{o.name}</strong>
                  {best && (
                    <span className="trainer-card-best">
                      {best.perfectMoves}/{userMoves}
                      {best.perfectMoves === userMoves && ' ⭐'}
                    </span>
                  )}
                </div>
                <p className="trainer-card-desc">{o.description}</p>
                <div className="label-aside">
                  {o.moves.length} ply · ของคุณต้องเล่น {userMoves} ตา
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

// ─── Drill runner ──────────────────────────────────────────────

type DrillStatus = 'loading' | 'playing' | 'done';

function TrainerRunner({ openingId }: { openingId: string }) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const [status, setStatus] = useState<DrillStatus>('loading');
  const [fens, setFens] = useState<string[]>([MAKRUK_START_FEN]);
  const [legalByPly, setLegalByPly] = useState<string[][]>([]);
  const [ply, setPly] = useState(0);
  const [perfectCount, setPerfectCount] = useState(0);
  const [mistakesThisPly, setMistakesThisPly] = useState(0);
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null);
  const [revealHint, setRevealHint] = useState<{ from: string; to: string } | null>(null);

  const boardRef = useRef<FfishBoard | null>(null);

  useEffect(() => {
    let cancelled = false;
    let live: FfishBoard | null = null;
    Promise.all([loadOpenings(), loadFfish()]).then(([catalog, ffish]) => {
      if (cancelled) return;
      const op = catalog.find((o) => o.id === openingId) ?? null;
      if (!op) {
        setStatus('done');
        return;
      }
      setOpening(op);
      // Pre-replay the opening to capture FEN + legal moves at each ply.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ffishAny = ffish as any;
      live = new ffishAny.Board('makruk', MAKRUK_START_FEN);
      boardRef.current = live;
      const fenAt: string[] = [MAKRUK_START_FEN];
      const legalAt: string[][] = [parseLegalMoves(live!.legalMoves())];
      for (const mv of op.moves) {
        live!.push(mv);
        fenAt.push(live!.fen());
        legalAt.push(parseLegalMoves(live!.legalMoves()));
      }
      // Reset board to start so the user plays from move 1.
      live!.delete();
      live = new ffishAny.Board('makruk', MAKRUK_START_FEN);
      boardRef.current = live;
      setFens(fenAt);
      setLegalByPly(legalAt);
      setStatus('playing');
    });
    return () => {
      cancelled = true;
      if (live) {
        try { live.delete(); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingId]);

  const handleMove = useCallback(
    (from: string, to: string) => {
      if (status !== 'playing' || !opening) return;
      const board = boardRef.current;
      if (!board) return;
      const expected = opening.moves[ply];
      const userMove = `${from}${to}`;
      if (userMove === expected || userMove.startsWith(expected.slice(0, 4))) {
        // Correct
        board.push(expected);
        setFlash('correct');
        setRevealHint(null);
        if (mistakesThisPly === 0) setPerfectCount((p) => p + 1);
        // Auto-play opponent reply (next ply) if there is one
        const nextPly = ply + 1;
        if (nextPly < opening.moves.length) {
          const oppMove = opening.moves[nextPly];
          board.push(oppMove);
          setPly(nextPly + 1);
          setMistakesThisPly(0);
        } else {
          // User just played the final ply — done.
          setPly(opening.moves.length);
          setStatus('done');
          // Total moves = ceil(opening.moves.length / 2) — user plays
          // every other ply starting from ply 0.
          const userTotal = Math.ceil(opening.moves.length / 2);
          recordTrainerRun(opening.id, perfectCount + (mistakesThisPly === 0 ? 1 : 0), userTotal);
        }
        setTimeout(() => setFlash(null), 250);
      } else {
        // Wrong
        setFlash('wrong');
        setMistakesThisPly((m) => m + 1);
        setRevealHint({ from: expected.slice(0, 2), to: expected.slice(2, 4) });
        setTimeout(() => setFlash(null), 400);
      }
    },
    [status, opening, ply, mistakesThisPly, perfectCount],
  );

  const currentFen = fens[ply] ?? MAKRUK_START_FEN;
  const currentLegal = status === 'playing' ? (legalByPly[ply] ?? []) : [];
  const userTotal = opening ? Math.ceil(opening.moves.length / 2) : 0;

  return (
    <main className="trainer-page trainer-runner">
      <button className="trainer-back" onClick={() => navigate({ tab: 'movetrainer' })}>
        ← รายการ
      </button>
      {!opening && status !== 'loading' && (
        <p className="trainer-error">⚠ ไม่พบ opening id นี้</p>
      )}
      {opening && (
        <>
          <header className="trainer-header">
            <h2>{opening.name}</h2>
            <p className="label-aside">{opening.description}</p>
          </header>
          <div className="trainer-layout">
            <div className={`trainer-board ${flash ? `flash-${flash}` : ''}`}>
              <Board
                fen={currentFen}
                legalMoves={currentLegal}
                flipped={false}
                disabled={status !== 'playing'}
                turn={currentFen.split(' ')[1] === 'w' ? 'white' : 'black'}
                isCheck={false}
                lastMove={null}
                hint={revealHint}
                onMove={handleMove}
              />
            </div>
            <aside className="trainer-sidebar">
              <div className="trainer-counter">
                <div className="trainer-counter-label">คะแนน</div>
                <div className="trainer-counter-value">
                  {perfectCount} / {userTotal}
                </div>
              </div>
              {status === 'playing' && (
                <p className="label-aside">
                  ตาที่ {Math.floor(ply / 2) + 1} ของคุณ · เดิน{' '}
                  {currentFen.split(' ')[1] === 'w' ? '♔ ขาว' : '♚ ดำ'}
                </p>
              )}
              {revealHint && (
                <p className="trainer-hint">
                  💡 ตาที่ถูก: {revealHint.from} → {revealHint.to}
                </p>
              )}
              {status === 'done' && (
                <div className="trainer-result">
                  <div className="trainer-result-icon">
                    {perfectCount === userTotal ? '⭐' : '✓'}
                  </div>
                  <div className="trainer-result-title">
                    จบรอบ! {perfectCount} / {userTotal}
                  </div>
                  {perfectCount === userTotal && (
                    <div className="label-aside">ไม่มีพลาดเลย · เก่งมาก</div>
                  )}
                  <div className="trainer-result-actions">
                    <button onClick={() => window.location.reload()}>↻ เล่นซ้ำ</button>
                    <button
                      onClick={() => navigate({ tab: 'movetrainer' })}
                      className="secondary"
                    >
                      เลือก opening อื่น
                    </button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
