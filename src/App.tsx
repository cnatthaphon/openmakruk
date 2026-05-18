import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board as FfishBoard } from 'ffish-es6';
import { Board } from './components/Board';
import {
  fenToPieceMap,
  loadFfish,
  parseLegalMoves,
  parseUci,
  type PieceMap,
  type Square,
} from './lib/makruk';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_PRESETS,
  searchBestMove,
  type Difficulty,
} from './lib/engine';

type BoardState = {
  pieces: PieceMap;
  turn: 'white' | 'black';
  isCheck: boolean;
  isGameOver: boolean;
  result: string;
  legalMoves: string[];
  fen: string;
  fullmove: number;
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
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<Mode>('play-white');
  const [speed, setSpeed] = useState<Speed>('normal');
  const [showArrow, setShowArrow] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [loadError, setLoadError] = useState<string | null>(null);
  const pendingTimer = useRef<number | null>(null);

  // Load ffish-es6 once on mount.
  useEffect(() => {
    let cancelled = false;
    loadFfish()
      .then((ffish) => {
        if (cancelled) return;
        const b = new ffish.Board('makruk');
        setBoard(b);
        setState(snapshot(b));
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
          setSelected(null);
          setThinking(false);
        }, wait);
      } catch (err) {
        if (cancelled) return;
        console.error('engine search failed:', err);
        // Fall back to a legal move so the game doesn't deadlock.
        const fallback = state.legalMoves[0];
        if (fallback) {
          board.push(fallback);
          setHistory((h) => [...h, fallback]);
          setState(snapshot(board));
        }
        setSelected(null);
        setThinking(false);
      }
    })();

    return () => {
      cancelled = true;
      if (pendingTimer.current !== null) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
    };

    return () => {
      if (pendingTimer.current !== null) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      setThinking(false);
    };
  }, [board, state, mode, speed, difficulty]);

  const legalDestinations: Square[] = useMemo(() => {
    if (!selected || !state) return [];
    return state.legalMoves
      .filter((m) => m.startsWith(selected))
      .map((m) => parseUci(m).to);
  }, [selected, state]);

  const lastMove = useMemo(() => {
    const last = history[history.length - 1];
    return last ? parseUci(last) : null;
  }, [history]);

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

  const handleSquareClick = (square: Square) => {
    if (state.isGameOver) return;
    if (thinking) return; // disable input while computer is thinking
    if (userSide !== 'both' && userSide !== state.turn) return; // not user's turn

    const piece = state.pieces[square];
    const isOwnPiece = piece && pieceMatchesTurn(piece, state.turn);

    if (selected === null) {
      if (isOwnPiece) setSelected(square);
      return;
    }

    if (selected === square) {
      setSelected(null);
      return;
    }

    const tryMove = state.legalMoves.find(
      (m) => m.slice(0, 2) === selected && m.slice(2, 4) === square,
    );

    if (tryMove) {
      board.push(tryMove);
      setHistory((h) => [...h, tryMove]);
      setState(snapshot(board));
      setSelected(null);
      return;
    }

    if (isOwnPiece) {
      setSelected(square);
    } else {
      setSelected(null);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    // If playing against computer, undo two plies so it's user's turn again.
    const undoCount = userSide === 'both' || userSide === null ? 1 : Math.min(2, history.length);
    for (let i = 0; i < undoCount; i++) board.pop();
    setHistory((h) => h.slice(0, -undoCount));
    setState(snapshot(board));
    setSelected(null);
  };

  const handleReset = () => {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    for (let i = 0; i < history.length; i++) board.pop();
    setHistory([]);
    setState(snapshot(board));
    setSelected(null);
  };

  const handleModeChange = (newMode: Mode) => {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    setMode(newMode);
    setSelected(null);
    // Auto-flip board to put user's side at bottom
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
          pieces={state.pieces}
          selected={selected}
          legalDestinations={legalDestinations}
          lastMove={lastMove}
          flipped={flipped}
          showArrow={showArrow}
          onSquareClick={handleSquareClick}
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

          <label className="toggle">
            <input
              type="checkbox"
              checked={showArrow}
              onChange={(e) => setShowArrow(e.target.checked)}
            />
            <span>แสดงลูกศรตาเดิน</span>
          </label>

          <div className="status">
            <div>
              <span className="label">ตาเดิน:</span>{' '}
              <strong>{state.turn === 'white' ? 'ขาว ♔' : 'ดำ ♚'}</strong>
              {state.isCheck && <span className="check"> · รุก!</span>}
              {thinking && <span className="thinking"> · คอมคิด...</span>}
            </div>
            <div>
              <span className="label">ตาที่:</span> {state.fullmove}
            </div>
            {state.isGameOver && (
              <div className="gameover">
                จบเกม · {state.result}
              </div>
            )}
          </div>

          <div className="controls">
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

function snapshot(b: FfishBoard): BoardState {
  const fen = b.fen();
  return {
    pieces: fenToPieceMap(fen),
    turn: b.turn() ? 'white' : 'black',
    isCheck: b.isCheck(),
    isGameOver: b.isGameOver(),
    result: b.result(),
    legalMoves: parseLegalMoves(b.legalMoves()),
    fen,
    fullmove: b.fullmoveNumber(),
  };
}

function pieceMatchesTurn(piece: string, turn: 'white' | 'black'): boolean {
  const white = piece === piece.toUpperCase();
  return (white && turn === 'white') || (!white && turn === 'black');
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

