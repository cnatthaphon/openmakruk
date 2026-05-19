import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board as FfishBoard } from 'ffish-es6';
import { Board } from './components/Board';
import {
  loadFfish,
  parseCounting,
  parseLegalMoves,
  parseUci,
  type CountInfo,
  type Square,
} from './lib/makruk';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_PRESETS,
  searchBestMove,
  type Difficulty,
} from './lib/engine';
import { log, timeStart, timeEnd } from './lib/log';

type BoardState = {
  turn: 'white' | 'black';
  isCheck: boolean;
  isGameOver: boolean;
  result: string;
  legalMoves: string[];
  fen: string;
  fullmove: number;
  counting: CountInfo;
};

type Mode =
  | 'play-white' // user plays white, computer plays black (default)
  | 'play-black' // user plays black, computer plays white
  | 'self-play' // computer plays both sides (testing/demo)
  | 'manual'; // user plays both sides (testing/exploration)

const MODE_LABELS: Record<Mode, string> = {
  'play-white': 'เล่นเป็นขาว (vs คอม)',
  'play-black': 'เล่นเป็นดำ (vs คอม)',
  'self-play': 'คอม vs คอม (ทดสอบ)',
  manual: 'เล่นเองทั้งสองฝั่ง',
};

type Speed = 'slow' | 'normal' | 'fast' | 'instant';

const SPEED_MS: Record<Speed, number> = {
  slow: 1500,
  normal: 600,
  fast: 200,
  instant: 0,
};

const SPEED_LABELS: Record<Speed, string> = {
  slow: 'ช้า (1.5 วิ)',
  normal: 'ปกติ (0.6 วิ)',
  fast: 'เร็ว (0.2 วิ)',
  instant: 'ทันที',
};

export default function App() {
  const [board, setBoard] = useState<FfishBoard | null>(null);
  const [state, setState] = useState<BoardState | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<Mode>('play-white');
  const [speed, setSpeed] = useState<Speed>('normal');
  const [thinking, setThinking] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [hint, setHint] = useState<{ from: Square; to: Square } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintInfo, setHintInfo] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pendingTimer = useRef<number | null>(null);

  // Load ffish-es6 once on mount.
  useEffect(() => {
    let cancelled = false;
    timeStart('ffish.load');
    log('ffish.load.start');
    loadFfish()
      .then((ffish) => {
        if (cancelled) return;
        timeEnd('ffish.load');
        const b = new ffish.Board('makruk');
        setBoard(b);
        setState(snapshot(b));
        log('game.ready', { fen: b.fen() });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load Fairy-Stockfish WASM:', err);
        setLoadError(err?.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Computer move trigger. Whenever the turn matches a "computer" side
  // (per current mode), schedule an auto-move after a short delay.
  useEffect(() => {
    if (!board || !state) return;
    if (state.isGameOver) return;

    const computerSide = computerSideForMode(mode);
    if (computerSide === null) return; // manual: no computer
    if (computerSide !== 'both' && computerSide !== state.turn) return;

    setThinking(true);
    let cancelled = false;
    const startedAt = Date.now();

    (async () => {
      try {
        const preset = DIFFICULTY_PRESETS[difficulty];
        const { bestMove } = await searchBestMove(state.fen, preset);

        if (cancelled) return;
        if (!bestMove || bestMove === '(none)' || bestMove === '0000') {
          setThinking(false);
          return;
        }
        // Validate against current legal moves in case the position drifted.
        const legalUci = state.legalMoves.find(
          (m) => m === bestMove || m.startsWith(bestMove),
        );
        const move = legalUci ?? bestMove;

        // Honour the "speed" floor so the user can see the move land. The
        // engine may already have spent more time than the floor — in that
        // case we apply immediately.
        const elapsed = Date.now() - startedAt;
        const floor = SPEED_MS[speed];
        const wait = Math.max(0, floor - elapsed);

        pendingTimer.current = window.setTimeout(() => {
          if (cancelled) return;
          board.push(move);
          setHistory((h) => [...h, move]);
          setState(snapshot(board));
          setThinking(false);
        }, wait);
      } catch (err) {
        if (cancelled) return;
        console.error('engine search failed:', err);
        const fallback = state.legalMoves[0];
        if (fallback) {
          board.push(fallback);
          setHistory((h) => [...h, fallback]);
          setState(snapshot(board));
        }
        setThinking(false);
      }
    })();

    return () => {
      cancelled = true;
      if (pendingTimer.current !== null) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      setThinking(false);
    };
  }, [board, state, mode, speed, difficulty]);

  const lastMove = useMemo(() => {
    const last = history[history.length - 1];
    if (!last) return null;
    const { from, to } = parseUci(last);
    return { from, to };
  }, [history]);

  // Clear hint whenever the position changes — once a move is played
  // (by either side), last hint is stale and shouldn't linger.
  useEffect(() => {
    setHint(null);
    setHintInfo(null);
  }, [state?.fen]);

  if (loadError) {
    return (
      <div className="screen error">
        <h2>โหลด engine ไม่สำเร็จ</h2>
        <pre>{loadError}</pre>
        <p>ลอง refresh หน้านี้ หรือเปิด console ดู error</p>
      </div>
    );
  }

  if (!state || !board) {
    return (
      <div className="screen loading">
        <div className="spinner" aria-hidden="true" />
        <p>กำลังโหลด Fairy-Stockfish WASM...</p>
      </div>
    );
  }

  const userSide = userSideForMode(mode);

  // chessground hands us (from, to) after both click-to-move and drag-drop.
  // We only need to validate against the legal move list and push.
  const handleMove = (from: Square, to: Square) => {
    if (state.isGameOver) {
      log('user.move.reject', { reason: 'gameOver', from, to });
      return;
    }
    if (thinking) {
      log('user.move.reject', { reason: 'thinking', from, to });
      return;
    }
    if (userSide !== 'both' && userSide !== state.turn) {
      log('user.move.reject', {
        reason: 'notYourTurn',
        from, to, turn: state.turn, userSide,
      });
      return;
    }

    const tryMove = state.legalMoves.find(
      (m) => m.slice(0, 2) === from && m.slice(2, 4) === to,
    );
    if (!tryMove) {
      log('user.move.reject', {
        reason: 'illegal',
        from, to,
        availableFromSquare: state.legalMoves.filter((m) => m.slice(0, 2) === from),
      });
      return;
    }

    board.push(tryMove);
    setHistory((h) => [...h, tryMove]);
    setState(snapshot(board));
    log('user.move.applied', { move: tryMove });
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    const undoCount = userSide === 'both' || userSide === null ? 1 : Math.min(2, history.length);
    for (let i = 0; i < undoCount; i++) board.pop();
    setHistory((h) => h.slice(0, -undoCount));
    setState(snapshot(board));
  };

  const handleReset = () => {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    for (let i = 0; i < history.length; i++) board.pop();
    setHistory([]);
    setState(snapshot(board));
  };

  const handleHint = async () => {
    if (!state || hintLoading || thinking || state.isGameOver) return;
    if (userSide !== 'both' && userSide !== state.turn) return;
    setHintLoading(true);
    log('hint.request', { fen: state.fen });
    try {
      const result = await searchBestMove(state.fen, { depth: 14 });
      if (result.bestMove && result.bestMove !== '(none)' && result.bestMove !== '0000') {
        const { from, to } = parseUci(result.bestMove);
        setHint({ from: from as Square, to: to as Square });
        // Build a short info line — eval from side-to-move POV.
        let info = '';
        if (typeof result.mateIn === 'number') {
          info = `รุกจน ${Math.abs(result.mateIn)} ตา`;
        } else if (typeof result.scoreCp === 'number') {
          const pawns = (result.scoreCp / 100).toFixed(2);
          info = `eval ${result.scoreCp > 0 ? '+' : ''}${pawns}`;
        }
        if (result.depth) info += `${info ? ' · ' : ''}depth ${result.depth}`;
        setHintInfo(info || null);
        log('hint.shown', {
          move: result.bestMove,
          scoreCp: result.scoreCp,
          mateIn: result.mateIn,
          depth: result.depth,
        });
      }
    } catch (err) {
      console.error('hint search failed:', err);
      log('hint.error', { error: String(err) });
    } finally {
      setHintLoading(false);
    }
  };

  const handleModeChange = (newMode: Mode) => {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    setMode(newMode);
    if (newMode === 'play-black') setFlipped(true);
    else if (newMode === 'play-white') setFlipped(false);
  };

  return (
    <div className="app">
      <header>
        <h1>OpenMakruk</h1>
        <p className="tagline">หมากรุกไทย · v0.0 prototype</p>
      </header>
      <main>
        <Board
          fen={state.fen}
          legalMoves={state.legalMoves}
          flipped={flipped}
          disabled={thinking || state.isGameOver || (userSide !== 'both' && userSide !== state.turn)}
          turn={state.turn}
          isCheck={state.isCheck}
          lastMove={lastMove}
          hint={hint}
          onMove={handleMove}
        />
        <aside className="sidebar">
          <div className="mode-picker">
            <span className="label">โหมด</span>
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as Mode)}
            >
              {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
                <option key={m} value={m}>{MODE_LABELS[m]}</option>
              ))}
            </select>
          </div>

          <div className="mode-picker">
            <span className="label">ระดับคอม</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
                <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
              ))}
            </select>
          </div>

          <div className="mode-picker">
            <span className="label">ความเร็วคอม (ขั้นต่ำ)</span>
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value as Speed)}
            >
              {(Object.keys(SPEED_LABELS) as Speed[]).map((s) => (
                <option key={s} value={s}>{SPEED_LABELS[s]}</option>
              ))}
            </select>
          </div>


          <div className={`turn-badge turn-${state.turn} ${thinking ? 'is-thinking' : ''}`}>
            {thinking ? (
              <>
                <span className="spinner-sm" aria-hidden="true" />
                <span>คอมกำลังคิด...</span>
              </>
            ) : (
              <>
                <span className="turn-glyph">
                  {state.turn === 'white' ? '♔' : '♚'}
                </span>
                <span>
                  {userSide === state.turn || userSide === 'both'
                    ? 'ตาคุณ'
                    : `ตาคอม (${state.turn === 'white' ? 'ขาว' : 'ดำ'})`}
                </span>
              </>
            )}
            {state.isCheck && <span className="check-flag">รุก!</span>}
          </div>

          <div className="status">
            <div>
              <span className="label">รอบที่:</span> {state.fullmove}
              <span className="label-aside"> ({history.length} ตา)</span>
            </div>
            {state.counting.active && (
              <div className="count-indicator">
                <span className="label">นับ:</span>{' '}
                <strong>{state.counting.current}</strong>
                {' / '}
                <span>{state.counting.target}</span>
                <span className="label-aside">
                  {' '}เหลือ {state.counting.remaining} ตา · ถ้าไล่ไม่จน → เสมอ
                </span>
              </div>
            )}
            {state.isGameOver && (
              <div className="gameover">
                จบเกม · {formatResult(state.result, state.counting)}
              </div>
            )}
          </div>

          <div className="controls">
            <button
              className="hint-button"
              onClick={handleHint}
              disabled={
                hintLoading ||
                thinking ||
                state.isGameOver ||
                (userSide !== 'both' && userSide !== state.turn)
              }
            >
              {hintLoading ? (
                <>
                  <span className="spinner-sm" aria-hidden="true" />
                  กำลังคิด...
                </>
              ) : (
                <>💡 ขอ Hint</>
              )}
            </button>
            <button onClick={handleUndo} disabled={history.length === 0 || thinking}>
              ↶ ย้อน
            </button>
            <button onClick={handleReset} disabled={history.length === 0}>
              ⟳ เริ่มใหม่
            </button>
            <button onClick={() => setFlipped((f) => !f)}>
              ⇅ พลิกกระดาน
            </button>
          </div>
          {hint && hintInfo && (
            <div className="hint-info">
              💡 แนะนำ <strong>{hint.from} → {hint.to}</strong>
              {' · '}
              <span className="label-aside">{hintInfo}</span>
            </div>
          )}

          <div className="note">
            <strong>v0.1:</strong> ใช้ Fairy-Stockfish engine จริงแล้ว
            (classical eval, ยังไม่ได้โหลด Makruk NNUE network).
            ปรับระดับด้านบนเพื่อให้คอมเล่นง่ายขึ้น/ยากขึ้น.
          </div>

          <div className="fen">
            <span className="label">FEN:</span>
            <code>{state.fen}</code>
          </div>
        </aside>
      </main>
      <footer>
        <p>
          v0.0 · เล่นกับคอม (random) · self-play test ·
          <a href="https://github.com/cnatthaphon/openmakruk" target="_blank" rel="noopener noreferrer">
            {' '}GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

function formatResult(result: string, counting: CountInfo): string {
  // ffish returns "1-0", "0-1", "1/2-1/2", "*"
  if (result === '1-0') return 'ขาวชนะ (1-0)';
  if (result === '0-1') return 'ดำชนะ (0-1)';
  if (result === '1/2-1/2') {
    if (counting.active && counting.remaining === 0) {
      return 'เสมอ (นับไม่จน — ½-½)';
    }
    return 'เสมอ (½-½)';
  }
  return result;
}

function snapshot(b: FfishBoard): BoardState {
  const fen = b.fen();
  // claimDraw=true makes ffish honour Makruk's counting rule + 3-fold
  // repetition: when the weak side (bare king) hits the count limit
  // without being mated, the game is declared drawn automatically.
  return {
    turn: b.turn() ? 'white' : 'black',
    isCheck: b.isCheck(),
    isGameOver: b.isGameOver(true),
    result: b.result(true),
    legalMoves: parseLegalMoves(b.legalMoves()),
    fen,
    fullmove: b.fullmoveNumber(),
    counting: parseCounting(fen),
  };
}

function computerSideForMode(mode: Mode): 'white' | 'black' | 'both' | null {
  switch (mode) {
    case 'play-white': return 'black';
    case 'play-black': return 'white';
    case 'self-play':  return 'both';
    case 'manual':     return null;
  }
}

function userSideForMode(mode: Mode): 'white' | 'black' | 'both' | null {
  switch (mode) {
    case 'play-white': return 'white';
    case 'play-black': return 'black';
    case 'self-play':  return null;
    case 'manual':     return 'both';
  }
}

