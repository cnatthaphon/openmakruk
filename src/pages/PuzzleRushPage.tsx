// 🔥 Puzzle Rush page — timed back-to-back puzzle solving.
//
// Flow:
//   1. Intro screen: shows personal best + "Start" button
//   2. Active run: timer + score + strikes + current puzzle board
//   3. End screen: final score, share, "go again" button
//
// Movement validation is v1-simple: we only check whether the user's
// first move matches puzzle.solution[0]. Multi-move puzzle solutions
// (where the user has to play multiple moves to finish the line) get
// treated as "first move = full credit" — which makes Rush more about
// throughput than depth. This matches lichess Rush's UX intuition.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board as FfishBoard } from 'ffish-es6';
import { Board } from '../components/Board';
import { BoardLayout } from '../components/BoardLayout';
import { loadFfish, parseLegalMoves } from '../lib/makruk';
import { loadPuzzles } from '../lib/content';
import type { Puzzle } from '../lib/puzzleSchema';
import {
  RUSH_DURATION_MS,
  RUSH_MAX_STRIKES,
  buildRushQueue,
  formatRushTime,
  loadRushBest,
  recordRushRun,
} from '../lib/puzzleRush';
import { navigate } from '../lib/router';

type RushStatus = 'intro' | 'playing' | 'ended';

export function PuzzleRushPage() {
  const [status, setStatus] = useState<RushStatus>('intro');
  const [queue, setQueue] = useState<Puzzle[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(RUSH_DURATION_MS);
  const [fen, setFen] = useState<string>('');
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [turn, setTurn] = useState<'white' | 'black'>('white');
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null);

  const boardRef = useRef<FfishBoard | null>(null);
  const ffishRef = useRef<typeof import('ffish-es6') | null>(null);

  const best = loadRushBest();

  // Pre-load ffish + puzzles so the first "Start" click is instant.
  useEffect(() => {
    loadFfish().then((m) => {
      ffishRef.current = m as unknown as typeof import('ffish-es6');
    });
  }, []);

  // Timer: counts down once the user starts.
  useEffect(() => {
    if (status !== 'playing') return;
    const tick = setInterval(() => {
      setTimeLeftMs((t) => {
        if (t <= 1000) {
          clearInterval(tick);
          endRunRef.current?.();
          return 0;
        }
        return t - 1000;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [status]);

  // Load the current puzzle's position into a fresh ffish board.
  useEffect(() => {
    if (status !== 'playing') return;
    const puzzle = queue[queueIdx];
    if (!puzzle) return;
    const ffish = ffishRef.current;
    if (!ffish) return;
    if (boardRef.current) {
      try {
        boardRef.current.delete();
      } catch {
        /* ignore */
      }
    }
     
    const ffishAny = ffish as any;
    const board = new ffishAny.Board('makruk', puzzle.fen);
    boardRef.current = board;
    setFen(board.fen());
    setLegalMoves(parseLegalMoves(board.legalMoves()));
    setTurn(board.turn() ? 'white' : 'black');
  }, [status, queue, queueIdx]);

  const startRun = useCallback(async () => {
    const puzzles = await loadPuzzles();
    const q = buildRushQueue(puzzles);
    if (q.length === 0) return;
    setQueue(q);
    setQueueIdx(0);
    setScore(0);
    setStrikes(0);
    setTimeLeftMs(RUSH_DURATION_MS);
    setStatus('playing');
  }, []);

  const endRunRef = useRef<() => void>(() => undefined);
  endRunRef.current = useCallback(() => {
    if (status === 'ended') return;
    recordRushRun({
      score,
      strikesAtEnd: strikes,
      timeLeftMs,
    });
    setStatus('ended');
  }, [status, score, strikes, timeLeftMs]);

  const advance = useCallback(() => {
    setQueueIdx((i) => i + 1);
    setFlash(null);
  }, []);

  const handleMove = useCallback(
    (from: string, to: string) => {
      if (status !== 'playing') return;
      const puzzle = queue[queueIdx];
      if (!puzzle) return;
      const uci = `${from}${to}`;
      const expected = puzzle.solution[0]?.slice(0, 4);
      const userMoveCore = uci.slice(0, 4);
      const correct = expected === userMoveCore;
      if (correct) {
        setScore((s) => s + 1);
        setFlash('correct');
        setTimeout(advance, 250);
      } else {
        const newStrikes = strikes + 1;
        setStrikes(newStrikes);
        setFlash('wrong');
        if (newStrikes >= RUSH_MAX_STRIKES) {
          // Use a tiny delay so the wrong-move flash registers before
          // the end screen takes over.
          setTimeout(() => endRunRef.current?.(), 400);
        } else {
          setTimeout(advance, 600);
        }
      }
    },
    [status, queue, queueIdx, strikes, advance],
  );

  if (status === 'intro') {
    return (
      <main className="rush-page">
        <button
          className="rush-back"
          onClick={() => navigate({ tab: 'puzzles' })}
        >
          ← กลับ Puzzles
        </button>
        <header className="rush-intro">
          <div className="rush-intro-icon" aria-hidden="true">
            🔥
          </div>
          <h2>Puzzle Rush</h2>
          <p className="label-aside">
            แก้ปริศนาให้ได้มากที่สุดใน 3 นาที · ผิด 3 ครั้ง = จบ
          </p>
          <div className="rush-intro-best">
            {best.score > 0 ? (
              <>
                🏆 personal best: <strong>{best.score}</strong>
              </>
            ) : (
              <span className="label-aside">ยังไม่เคยทำ — ลองได้เลย</span>
            )}
          </div>
          <button className="rush-start" onClick={startRun}>
            ⚡ เริ่ม Rush
          </button>
        </header>
      </main>
    );
  }

  const puzzle = queue[queueIdx];
  if (status === 'playing' && !puzzle) {
    // Queue exhausted (unlikely with the curated 74+ pool, but safe).
    endRunRef.current?.();
  }

  const hud = (
    <div className="rush-hud">
      <div className="rush-hud-stat rush-hud-time">
        <span className="rush-hud-label">⏱️</span>
        <span className="rush-hud-value">{formatRushTime(timeLeftMs)}</span>
      </div>
      <div className="rush-hud-stat rush-hud-score">
        <span className="rush-hud-label">✅</span>
        <span className="rush-hud-value">{score}</span>
      </div>
      <div className="rush-hud-stat rush-hud-strikes">
        <span className="rush-hud-label">❌</span>
        <span className="rush-hud-value">
          {strikes}/{RUSH_MAX_STRIKES}
        </span>
      </div>
    </div>
  );

  return (
    <main className="rush-page rush-active">
      {status === 'playing' && puzzle && (
        <BoardLayout
          left={hud}
          board={
            <div className={`rush-board ${flash ? `flash-${flash}` : ''}`}>
              <Board
                fen={fen}
                legalMoves={legalMoves}
                flipped={turn === 'black'}
                disabled={flash !== null}
                turn={turn}
                isCheck={false}
                lastMove={null}
                hint={null}
                onMove={handleMove}
              />
            </div>
          }
          right={
            <p className="label-aside rush-board-hint">
              {turn === 'white' ? '♔ ขาวเดิน' : '♚ ดำเดิน'} · ปริศนาที่{' '}
              {queueIdx + 1}
            </p>
          }
        />
      )}

      {status === 'ended' && (
        <div className="rush-result">
          <div className="rush-result-icon">🔥</div>
          <h2>จบรอบ!</h2>
          <div className="rush-result-score">
            {score} <span className="label-aside">แก้ถูก</span>
          </div>
          <div className="label-aside">
            {strikes >= RUSH_MAX_STRIKES
              ? `จบเพราะผิด ${RUSH_MAX_STRIKES} ครั้ง`
              : 'หมดเวลา 3 นาที'}
          </div>
          {best.score > 0 && (
            <div className="rush-result-best">
              🏆 personal best: <strong>{Math.max(best.score, score)}</strong>
              {score > best.score && ' · 🎉 ทำลายสถิติ!'}
            </div>
          )}
          <div className="rush-result-actions">
            <button className="rush-start" onClick={startRun}>
              🔄 ลองอีกครั้ง
            </button>
            <button
              className="rush-secondary"
              onClick={() => {
                const text = `Puzzle Rush · ${score} ปริศนาใน 3 นาที · openmakruk.com`;
                const url = 'https://openmakruk.com/#/rush';
                if (typeof navigator.share === 'function') {
                  navigator.share({ title: 'Puzzle Rush', text, url }).catch(() => undefined);
                } else {
                  const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(
                    url,
                  )}&text=${encodeURIComponent(text)}`;
                  window.open(lineUrl, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              📤 แชร์
            </button>
            <button
              className="rush-secondary"
              onClick={() => navigate({ tab: 'puzzles' })}
            >
              ← กลับ Puzzles
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
