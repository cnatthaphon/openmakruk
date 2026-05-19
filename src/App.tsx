import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board as FfishBoard } from 'ffish-es6';
import { Board } from './components/Board';
import {
  loadFfish,
  MAKRUK_START_FEN,
  parseCounting,
  parseLegalMoves,
  parseUci,
  type CountInfo,
  type Square,
} from './lib/makruk';
import {
  analyzeGame,
  CLASSIFICATION_COLORS,
  CLASSIFICATION_GLYPHS,
  CLASSIFICATION_LABELS,
  formatEval,
  summarize,
  type AnnotatedMove,
  type Classification,
} from './lib/review';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_PRESETS,
  isNNUELoaded,
  loadNNUE,
  searchBestMove,
  type Difficulty,
} from './lib/engine';
import { log, timeStart, timeEnd } from './lib/log';
import {
  CPU_RATINGS,
  loadStats,
  recommendedLevel,
  recordGame,
  saveStats,
  type UserStats,
} from './lib/stats';

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
  | 'learning'   // user plays, but engine auto-suggests the best move every user turn
  | 'self-play'  // computer plays both sides — autopilot, watch + review
  | 'manual';    // user plays both sides (testing/exploration)

const MODE_LABELS: Record<Mode, string> = {
  'play-white': 'เล่นเป็นขาว (vs คอม)',
  'play-black': 'เล่นเป็นดำ (vs คอม)',
  learning:     '🎓 เรียนรู้ (คอมแนะนำทุกตา)',
  'self-play':  '🤖 คอม vs คอม (autopilot)',
  manual:       'เล่นเองทั้งสองฝั่ง',
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
  const [stats, setStats] = useState<UserStats>(() => loadStats());
  const gameRecordedRef = useRef(false);
  const [nnueState, setNnueState] = useState<'off' | 'loading' | 'on'>('off');
  const [nnueProgress, setNnueProgress] = useState<{ loaded: number; total: number } | null>(null);

  // Move review state
  const [reviewMoves, setReviewMoves] = useState<AnnotatedMove[]>([]);
  const [reviewPly, setReviewPly] = useState(0); // 0 = initial position
  const [reviewActive, setReviewActive] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<{ current: number; total: number } | null>(
    null,
  );

  // Self-play pause / auto-stop. Engines at < skill 20 introduce small
  // randomness so 3-fold repetition doesn't reliably trigger; we add our
  // own ply cap + halfmove-clock stagnation guard so users don't watch
  // a shuffle forever.
  const [selfPlayPaused, setSelfPlayPaused] = useState(false);
  const [selfPlayStopReason, setSelfPlayStopReason] = useState<
    'user' | 'max-plies' | 'stagnation' | null
  >(null);

  // forcedResult lets us end the game outside of ffish's normal
  // checkmate/stalemate detection — i.e. resignation and accepted draw
  // offer. When non-null we treat the game as over: CPU stops moving,
  // the overlay appears, and rating gets recorded with this result.
  const [forcedResult, setForcedResult] = useState<string | null>(null);
  const [drawOfferPending, setDrawOfferPending] = useState(false);
  const [drawOfferRefused, setDrawOfferRefused] = useState<string | null>(null);
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
    if (state.isGameOver || forcedResult) return;

    const computerSide = computerSideForMode(mode);
    if (computerSide === null) return; // manual: no computer
    if (computerSide !== 'both' && computerSide !== state.turn) return;

    // Self-play guards: manual pause + 200-fullmove ceiling + halfmove
    // stagnation (capture/pawn-less shuffle). Engines below skill 20
    // introduce small randomness, so 3-fold repetition often never
    // exactly fires — we add the safety net here.
    if (mode === 'self-play') {
      if (selfPlayPaused) return;
      if (state.fullmove > 200) {
        setSelfPlayPaused(true);
        setSelfPlayStopReason('max-plies');
        log('selfPlay.autoPause', { reason: 'max-plies', fullmove: state.fullmove });
        return;
      }
      if (!state.counting.active) {
        const fenParts = state.fen.split(' ');
        const halfmove = fenParts.length > 4 ? Number(fenParts[4]) || 0 : 0;
        if (halfmove > 100) {
          setSelfPlayPaused(true);
          setSelfPlayStopReason('stagnation');
          log('selfPlay.autoPause', { reason: 'stagnation', halfmove });
          return;
        }
      }
    }

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
  }, [board, state, mode, speed, difficulty, selfPlayPaused, forcedResult]);

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

  // Record a finished game into rating + per-level stats. Only counts
  // vs-CPU games (play-white / play-black) — self-play and manual
  // modes aren't competitive.
  useEffect(() => {
    if (!state || (!state.isGameOver && !forcedResult)) {
      gameRecordedRef.current = false;
      return;
    }
    if (gameRecordedRef.current) return;
    if (mode !== 'play-white' && mode !== 'play-black') return;
    if (history.length === 0) return; // safeguard against stale gameover on init
    const userColor: 'white' | 'black' = mode === 'play-white' ? 'white' : 'black';
    const recordResult = forcedResult ?? state.result;
    setStats((prev) => {
      const next = recordGame(prev, difficulty, userColor, recordResult, history.length);
      saveStats(next);
      log('stats.gameRecorded', {
        result: state.result,
        outcome:
          state.result === '1-0'
            ? userColor === 'white' ? 'win' : 'loss'
            : state.result === '0-1'
              ? userColor === 'black' ? 'win' : 'loss'
              : 'draw',
        opponent: difficulty,
        ratingBefore: prev.rating,
        ratingAfter: next.rating,
        delta: next.rating - prev.rating,
      });
      return next;
    });
    gameRecordedRef.current = true;
  }, [state?.isGameOver, state?.result, forcedResult, mode, difficulty, history.length]);

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

  const handleToggleSelfPlay = () => {
    setSelfPlayPaused((paused) => {
      const next = !paused;
      if (next) {
        if (pendingTimer.current !== null) {
          clearTimeout(pendingTimer.current);
          pendingTimer.current = null;
        }
        setSelfPlayStopReason('user');
        log('selfPlay.pause', { reason: 'user', fullmove: state?.fullmove });
      } else {
        setSelfPlayStopReason(null);
        log('selfPlay.resume', { fullmove: state?.fullmove });
      }
      return next;
    });
  };

  const handleTakeOverFromSelfPlay = () => {
    if (!state) return;
    // Whichever side is to move becomes the user's; the other stays CPU.
    const newMode: Mode = state.turn === 'white' ? 'play-white' : 'play-black';
    setMode(newMode);
    if (newMode === 'play-black') setFlipped(true);
    else setFlipped(false);
    setSelfPlayPaused(false);
    setSelfPlayStopReason(null);
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  };

  const handleResign = () => {
    if (!board || !state || state.isGameOver || forcedResult) return;
    if (mode !== 'play-white' && mode !== 'play-black') return;
    if (!confirm('ยอมแพ้ในเกมนี้? (จะเสีย rating)')) return;
    log('user.resign', { mode, fullmove: state.fullmove });
    const userColor: 'white' | 'black' = mode === 'play-white' ? 'white' : 'black';
    const losingResult = userColor === 'white' ? '0-1' : '1-0';
    // Keep history intact so the user can still review the game; the
    // auto-recorder effect picks up forcedResult and writes the loss
    // into stats. The game-over overlay also keys off forcedResult.
    setForcedResult(losingResult);
  };

  const handleOfferDraw = async () => {
    if (!board || !state || state.isGameOver || forcedResult) return;
    if (mode !== 'play-white' && mode !== 'play-black') return;
    if (thinking || drawOfferPending) return;
    setDrawOfferPending(true);
    setDrawOfferRefused(null);
    log('user.drawOffer.request', { fen: state.fen, fullmove: state.fullmove });
    try {
      // Quick depth-12 search; engine's scoreCp tells us whether the
      // opponent would happily agree to a draw.
      const result = await searchBestMove(state.fen, { depth: 12 });
      const userColor: 'white' | 'black' = mode === 'play-white' ? 'white' : 'black';
      const isUserToMove = state.turn === userColor;
      // searchBestMove returns eval from current side-to-move's POV.
      // We need the OPPONENT's POV (the side deciding whether to accept).
      let opponentCp: number | undefined;
      if (typeof result.scoreCp === 'number') {
        opponentCp = isUserToMove ? -result.scoreCp : result.scoreCp;
      }

      if (typeof result.mateIn === 'number' && result.mateIn !== 0) {
        const opponentMate = isUserToMove ? -result.mateIn : result.mateIn;
        if (opponentMate > 0) {
          setDrawOfferRefused(`คอมไม่ยอมเสมอ — เห็น mate in ${opponentMate}`);
          log('user.drawOffer.refused', { reason: 'opponentMate', mateIn: opponentMate });
          return;
        }
      }

      // Threshold: opponent accepts when they're not clearly winning.
      // 60cp = ~half a pawn, a forgiving cutoff so end-game equal
      // positions get drawn even with some imprecision.
      const ACCEPT_THRESHOLD = 60;
      if (typeof opponentCp === 'number' && opponentCp >= ACCEPT_THRESHOLD) {
        setDrawOfferRefused(
          `คอมไม่ยอมเสมอ — เห็นว่าตัวเองได้เปรียบ (+${(opponentCp / 100).toFixed(2)})`,
        );
        log('user.drawOffer.refused', { reason: 'opponentWinning', opponentCp });
        return;
      }

      log('user.drawOffer.accepted', { opponentCp });
      setForcedResult('1/2-1/2');
    } catch (err) {
      console.error('draw offer eval failed:', err);
      log('user.drawOffer.error', { error: String(err) });
    } finally {
      setDrawOfferPending(false);
    }
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

  const handleEnableNNUE = async () => {
    if (nnueState !== 'off') return;
    // If preference was previously enabled in this browser, the NNUE blob
    // is likely already in IndexedDB → fast path. Otherwise this triggers
    // a one-time 46 MB download.
    setNnueState('loading');
    setNnueProgress({ loaded: 0, total: 0 });
    try {
      await loadNNUE(undefined, (loaded, total) => {
        setNnueProgress({ loaded, total });
      });
      setNnueState('on');
      setNnueProgress(null);
      try {
        localStorage.setItem('openmakruk_nnue', '1');
      } catch {
        // ignore — best-effort persistence
      }
    } catch (err) {
      console.error('NNUE load failed:', err);
      setNnueState('off');
      setNnueProgress(null);
    }
  };

  // Auto-enable NNUE on next visit if it was enabled before — the
  // IndexedDB cache makes this near-instant. We trigger it once the
  // engine + board are ready so we don't compete with the initial
  // search-time work.
  useEffect(() => {
    if (!board || !state) return;
    if (nnueState !== 'off') return;
    try {
      if (localStorage.getItem('openmakruk_nnue') === '1' && !isNNUELoaded()) {
        handleEnableNNUE();
      }
    } catch {
      // localStorage disabled — silently skip
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, state?.fen]);

  // Learning mode = auto-trigger hint on every user turn (no explicit
  // button press). Only when it's the user's turn AND we haven't shown
  // a hint already for this position.
  useEffect(() => {
    if (mode !== 'learning') return;
    if (!state || state.isGameOver || thinking || hint || hintLoading) return;
    if (userSide !== 'both' && userSide !== state.turn) return;
    // Defer one tick so the move animation lands first.
    const t = window.setTimeout(() => {
      handleHint();
    }, 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, state?.fen, state?.isGameOver, thinking, hint, hintLoading]);

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

  const handleStartReview = async () => {
    if (reviewLoading || reviewActive) return;
    if (history.length === 0 || !board) return;
    setReviewLoading(true);
    setReviewProgress({ current: 0, total: history.length });
    log('review.start', { moves: history.length });
    try {
      const ffish = await loadFfish();
      const reviewBoard = new ffish.Board('makruk');
      try {
        const annotated = await analyzeGame(reviewBoard, history, (current, total) => {
          setReviewProgress({ current, total });
        });
        setReviewMoves(annotated);
        setReviewPly(annotated.length);
        setReviewActive(true);
        log('review.ready', { moves: annotated.length, summary: summarize(annotated) });
      } finally {
        reviewBoard.delete();
      }
    } catch (err) {
      console.error('review failed:', err);
      log('review.error', { error: String(err) });
    } finally {
      setReviewLoading(false);
      setReviewProgress(null);
    }
  };

  const handleExitReview = () => {
    setReviewActive(false);
    setReviewMoves([]);
    setReviewPly(0);
  };

  // Derived "view" state. When in review mode we override the board
  // FEN + lastMove with the snapshot at reviewPly; the real game state
  // is preserved so the user can exit review and keep playing if desired.
  const viewFen = reviewActive
    ? reviewPly === 0
      ? MAKRUK_START_FEN
      : reviewMoves[reviewPly - 1]?.fenAfter ?? state.fen
    : state.fen;
  const viewLastMove = reviewActive
    ? reviewPly === 0
      ? null
      : (() => {
          const m = reviewMoves[reviewPly - 1];
          return m ? parseUci(m.uci) : null;
        })()
    : lastMove;
  const viewLegalMoves = reviewActive ? [] : state.legalMoves;
  const viewDisabled =
    reviewActive ||
    thinking ||
    state.isGameOver ||
    (userSide !== 'both' && userSide !== state.turn);
  const reviewCurrent = reviewActive && reviewPly > 0 ? reviewMoves[reviewPly - 1] : null;

  const handleModeChange = (newMode: Mode) => {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    setMode(newMode);
    if (newMode === 'play-black') setFlipped(true);
    else if (newMode === 'play-white') setFlipped(false);
  };

  const suggestedLevel = recommendedLevel(stats.rating);

  return (
    <div className={`app ${state.isCheck ? 'is-check' : ''}`}>
      <header>
        <h1>OpenMakruk</h1>
        <p className="tagline">หมากรุกไทย · v0.1 · NNUE + Review + Profile</p>
      </header>
      <main>
        <div className="board-container">
          <Board
            fen={viewFen}
            legalMoves={viewLegalMoves}
            flipped={flipped}
            disabled={viewDisabled}
            turn={state.turn}
            isCheck={!reviewActive && state.isCheck}
            lastMove={viewLastMove}
            hint={reviewActive ? null : hint}
            onMove={handleMove}
          />
          {(state.isGameOver || forcedResult) && !reviewActive && (
            <div className="game-over-overlay" role="dialog" aria-live="polite">
              <div className="game-over-card">
                <div className="game-over-icon">
                  {gameOverIcon(forcedResult ?? state.result, mode)}
                </div>
                <div className="game-over-result">
                  {forcedResult
                    ? formatForcedResult(forcedResult, mode)
                    : formatResult(state.result, state.counting)}
                </div>
                {gameOverSubtitle(forcedResult ?? state.result, mode, state.counting) && (
                  <div className="game-over-subtitle">
                    {forcedResult
                      ? forcedSubtitle(forcedResult, mode)
                      : gameOverSubtitle(state.result, mode, state.counting)}
                  </div>
                )}
                <div className="game-over-actions">
                  <button
                    className="game-over-button game-over-review"
                    onClick={handleStartReview}
                    disabled={reviewLoading || history.length === 0}
                  >
                    {reviewLoading
                      ? `🔍 กำลังวิเคราะห์... ${reviewProgress?.current ?? 0}/${reviewProgress?.total ?? 0}`
                      : '🔍 ดูรีวิวเกม'}
                  </button>
                  <button className="game-over-button" onClick={handleReset}>
                    ⟳ เริ่มเกมใหม่
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <aside className="sidebar">
          {reviewActive && (
            <ReviewPanel
              moves={reviewMoves}
              currentPly={reviewPly}
              currentMove={reviewCurrent}
              onPlySelect={setReviewPly}
              onExit={handleExitReview}
            />
          )}
          {!reviewActive && (state.isGameOver || forcedResult) && history.length > 0 && (
            <button
              className="review-launch-button"
              onClick={handleStartReview}
              disabled={reviewLoading}
            >
              {reviewLoading
                ? `🔍 กำลังวิเคราะห์... ${reviewProgress?.current ?? 0}/${reviewProgress?.total ?? 0}`
                : '🔍 ดูรีวิวเกม'}
            </button>
          )}
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

          <div className="nnue-picker">
            {nnueState === 'on' ? (
              <div className="nnue-active">
                <span className="nnue-badge">⚡ NNUE</span>
                <span className="label-aside">+248 Elo · ใช้งานอยู่</span>
              </div>
            ) : nnueState === 'loading' ? (
              <div className="nnue-loading">
                <span className="spinner-sm" aria-hidden="true" />
                <div className="nnue-loading-text">
                  กำลังโหลด NNUE...
                  {nnueProgress && nnueProgress.total > 0 && (
                    <>
                      {' '}
                      {(nnueProgress.loaded / 1024 / 1024).toFixed(1)} /
                      {' '}{(nnueProgress.total / 1024 / 1024).toFixed(1)} MB
                      <div className="nnue-bar">
                        <div
                          className="nnue-bar-fill"
                          style={{
                            width: `${(nnueProgress.loaded / nnueProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <button
                className="nnue-enable-button"
                onClick={handleEnableNNUE}
                disabled={!board || !state}
              >
                ⚡ เปิด NNUE (+248 Elo, โหลด 1 ครั้ง ~46 MB)
              </button>
            )}
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


          <div className={`turn-badge turn-${state.turn} ${thinking ? 'is-thinking' : ''} ${state.isCheck ? 'is-check' : ''}`}>
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
            {state.isCheck && <span className="check-flag">⚠ รุก!</span>}
          </div>

          {state.isCheck && (
            <div className="check-banner" role="alert">
              <strong>ขุนถูกรุก!</strong>{' '}
              ต้องบล็อก/หนี/จับตัวที่รุกเท่านั้น (ตาเดินอื่นถูก reject อัตโนมัติ)
            </div>
          )}

          <ProfilePanel stats={stats} suggestedLevel={suggestedLevel} />


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

          {mode === 'self-play' && !state.isGameOver && (
            <div className="self-play-controls">
              <button
                className={`self-play-pause ${selfPlayPaused ? 'is-paused' : ''}`}
                onClick={handleToggleSelfPlay}
              >
                {selfPlayPaused ? '▶ เล่นต่อ' : '⏸ พักคอม'}
              </button>
              {selfPlayPaused && (
                <button
                  className="self-play-takeover"
                  onClick={handleTakeOverFromSelfPlay}
                >
                  🎮 เล่นเอง (เป็น{state.turn === 'white' ? 'ขาว' : 'ดำ'})
                </button>
              )}
              {selfPlayStopReason && selfPlayStopReason !== 'user' && (
                <div className="self-play-banner">
                  {selfPlayStopReason === 'max-plies'
                    ? `หยุดอัตโนมัติ — เล่นเกิน 200 รอบ (${state.fullmove}) แต่ยังไม่จบ`
                    : `หยุดอัตโนมัติ — ไม่มี capture/pawn move เกิน 100 ตา (ดูเหมือนเดินวน)`}
                </div>
              )}
            </div>
          )}

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
            {(mode === 'play-white' || mode === 'play-black') &&
              !state.isGameOver &&
              !forcedResult &&
              history.length > 0 && (
                <>
                  <button
                    className="draw-button"
                    onClick={handleOfferDraw}
                    disabled={thinking || drawOfferPending}
                    title="ขอเสมอ — คอมจะตัดสินจากค่า eval ปัจจุบัน"
                  >
                    {drawOfferPending ? (
                      <>
                        <span className="spinner-sm" aria-hidden="true" />
                        กำลังพิจารณา...
                      </>
                    ) : (
                      <>🤝 ขอเสมอ</>
                    )}
                  </button>
                  <button
                    className="resign-button"
                    onClick={handleResign}
                    disabled={thinking}
                    title="ยอมแพ้ — บันทึกเป็น loss"
                  >
                    🏳 ยอมแพ้
                  </button>
                </>
              )}
          </div>
          {drawOfferRefused && (
            <div className="draw-refused-banner">{drawOfferRefused}</div>
          )}
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
          v0.1 · Fairy-Stockfish · hint · review · NNUE-ready ·
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

function ProfilePanel({
  stats,
  suggestedLevel,
}: {
  stats: UserStats;
  suggestedLevel: Difficulty;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const recent = stats.history.slice(0, 10);
  return (
    <div className="rating-panel">
      <div className="rating-header">
        <span className="label">🏆 Rating</span>
        <strong className="rating-value">{stats.rating}</strong>
        <span className="label-aside">({stats.totalGames} เกม)</span>
      </div>
      <div className="rating-recommend">
        แนะนำเล่นที่: <strong>{DIFFICULTY_LABELS[suggestedLevel]}</strong>
      </div>
      <div className="rating-byLevel">
        {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => {
          const r = stats.byLevel[d];
          const total = r.wins + r.losses + r.draws;
          return (
            <div key={d} className="rating-row">
              <span className="rating-row-name">{DIFFICULTY_LABELS[d]}</span>
              <span className="rating-row-stats">
                {total === 0 ? (
                  <span className="label-aside">ยังไม่เคยเล่น</span>
                ) : (
                  <>
                    <span className="win">{r.wins}W</span>{' '}
                    <span className="loss">{r.losses}L</span>{' '}
                    <span className="draw">{r.draws}D</span>
                    <span className="label-aside"> · ~{CPU_RATINGS[d]}</span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {recent.length > 0 && (
        <>
          <button
            className="history-toggle"
            onClick={() => setShowHistory((s) => !s)}
          >
            {showHistory ? '▾ ซ่อนประวัติเกม' : '▸ ดูประวัติ ' + recent.length + ' เกมล่าสุด'}
          </button>
          {showHistory && (
            <div className="history-list" role="list">
              {recent.map((g, i) => (
                <div key={i} className="history-row" role="listitem">
                  <span className={`h-outcome ${g.outcome}`}>
                    {g.outcome === 'win' ? 'W' : g.outcome === 'loss' ? 'L' : 'D'}
                  </span>
                  <span className="h-opponent">{DIFFICULTY_LABELS[g.opponent]}</span>
                  <span className="h-date">{formatDateShort(g.date)}</span>
                  <span className={`h-delta ${g.ratingDelta >= 0 ? 'up' : 'down'}`}>
                    {g.ratingDelta >= 0 ? '+' : ''}
                    {g.ratingDelta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatDateShort(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function ReviewPanel({
  moves,
  currentPly,
  currentMove,
  onPlySelect,
  onExit,
}: {
  moves: AnnotatedMove[];
  currentPly: number;
  currentMove: AnnotatedMove | null;
  onPlySelect: (ply: number) => void;
  onExit: () => void;
}) {
  const summary = useMemo(() => summarize(moves), [moves]);
  const total = moves.length;
  return (
    <div className="review-panel">
      <div className="review-header">
        <strong>🔍 รีวิวเกม</strong>
        <button className="review-exit" onClick={onExit} aria-label="ออกจากรีวิว">
          ✕
        </button>
      </div>

      <div className="review-summary">
        {(Object.keys(CLASSIFICATION_LABELS) as Classification[]).map((c) => (
          <span
            key={c}
            className="review-summary-chip"
            style={{ borderColor: CLASSIFICATION_COLORS[c] }}
          >
            <span style={{ color: CLASSIFICATION_COLORS[c] }}>
              {CLASSIFICATION_GLYPHS[c]}
            </span>{' '}
            {summary[c]}
          </span>
        ))}
      </div>

      <div className="review-nav">
        <button onClick={() => onPlySelect(0)} disabled={currentPly === 0}>
          ⏮
        </button>
        <button onClick={() => onPlySelect(Math.max(0, currentPly - 1))} disabled={currentPly === 0}>
          ◀
        </button>
        <span className="review-position">
          {currentPly} / {total}
        </span>
        <button
          onClick={() => onPlySelect(Math.min(total, currentPly + 1))}
          disabled={currentPly === total}
        >
          ▶
        </button>
        <button onClick={() => onPlySelect(total)} disabled={currentPly === total}>
          ⏭
        </button>
      </div>

      {currentMove && (
        <div className="review-current">
          <div className="review-current-move">
            <span className="label">{currentMove.ply}.</span>{' '}
            <strong>{currentMove.uci}</strong>{' '}
            <span
              className="review-tag"
              style={{
                color: CLASSIFICATION_COLORS[currentMove.classification],
                borderColor: CLASSIFICATION_COLORS[currentMove.classification],
              }}
            >
              {CLASSIFICATION_GLYPHS[currentMove.classification]}{' '}
              {CLASSIFICATION_LABELS[currentMove.classification]}
            </span>
          </div>
          <div className="review-current-eval">
            <span className="label">Eval:</span>{' '}
            {formatEval(currentMove.evalBefore)} → {formatEval(currentMove.evalAfter)}
            {currentMove.delta > 50 && (
              <span className="label-aside"> (เสีย {(currentMove.delta / 100).toFixed(1)})</span>
            )}
          </div>
          {!currentMove.isBest && (
            <div className="review-current-best">
              <span className="label">เครื่องแนะนำ:</span>{' '}
              <strong>{currentMove.bestMove}</strong>
            </div>
          )}
        </div>
      )}

      <div className="review-list" role="list">
        {moves.map((m) => (
          <button
            key={m.ply}
            role="listitem"
            className={`review-row ${m.ply === currentPly ? 'is-current' : ''}`}
            onClick={() => onPlySelect(m.ply)}
            style={{ borderLeftColor: CLASSIFICATION_COLORS[m.classification] }}
          >
            <span className="review-row-num">{m.ply}.</span>
            <span className="review-row-side">{m.side === 'white' ? '♔' : '♚'}</span>
            <span className="review-row-uci">{m.uci}</span>
            <span
              className="review-row-tag"
              style={{ color: CLASSIFICATION_COLORS[m.classification] }}
              title={CLASSIFICATION_LABELS[m.classification]}
            >
              {CLASSIFICATION_GLYPHS[m.classification]}
            </span>
            <span className="review-row-eval">{formatEval(m.evalAfter)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatForcedResult(result: string, mode: Mode): string {
  if (result === '1/2-1/2') return 'เสมอ (ตกลงเสมอ ½-½)';
  // resign
  if (mode === 'play-white' && result === '0-1') return 'ยอมแพ้ — ดำชนะ (0-1)';
  if (mode === 'play-black' && result === '1-0') return 'ยอมแพ้ — ขาวชนะ (1-0)';
  return result;
}

function forcedSubtitle(result: string, mode: Mode): string {
  if (result === '1/2-1/2') return 'คอมยอมรับข้อเสนอเสมอ';
  if (mode === 'play-white' || mode === 'play-black') {
    return 'คุณยอมแพ้ในเกมนี้ — rating ปรับเป็น loss';
  }
  return '';
}

function gameOverIcon(result: string, mode: Mode): string {
  if (result === '1/2-1/2') return '🤝';
  const userWon =
    (mode === 'play-white' && result === '1-0') ||
    (mode === 'play-black' && result === '0-1');
  if (mode === 'play-white' || mode === 'play-black') {
    return userWon ? '🏆' : '😞';
  }
  // self-play / manual: neutral celebration
  return '🎉';
}

function gameOverSubtitle(result: string, mode: Mode, counting: CountInfo): string | null {
  if (mode !== 'play-white' && mode !== 'play-black') return null;
  if (result === '1/2-1/2') {
    if (counting.active && counting.remaining === 0) {
      return 'ฝ่ายแข็งกว่าไล่ไม่จนภายใน count limit';
    }
    return 'ไม่ฝ่ายไหนชนะ';
  }
  const userWon =
    (mode === 'play-white' && result === '1-0') ||
    (mode === 'play-black' && result === '0-1');
  return userWon ? 'ยินดีด้วย! คุณชนะคอม 🎯' : 'คอมเก่งกว่ารอบนี้ — ลองอีกครั้ง';
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
    case 'learning':   return 'black'; // learning mode: user plays white, engine suggests
    case 'self-play':  return 'both';
    case 'manual':     return null;
  }
}

function userSideForMode(mode: Mode): 'white' | 'black' | 'both' | null {
  switch (mode) {
    case 'play-white': return 'white';
    case 'play-black': return 'black';
    case 'learning':   return 'white'; // user plays white in learning mode
    case 'self-play':  return null;
    case 'manual':     return 'both';
  }
}

