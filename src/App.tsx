import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
  getActiveEngineId,
  isNNUELoaded,
  loadNNUE,
  searchBestMove,
  setActiveEngine,
  type Difficulty,
} from './lib/engine';
import { log, timeStart, timeEnd } from './lib/log';
import {
  CPU_RATINGS,
  clearStats,
  loadStats,
  recommendedLevel,
  recordGame,
  saveStats,
  type UserStats,
} from './lib/stats';
// Page components are loaded lazily so the initial bundle only ships
// what's needed for /#/play (the default landing). Visiting another
// tab triggers a dynamic import on first use; subsequent visits hit
// the bundler's chunk cache and feel instant. Tradeoff: ~80–120ms
// extra latency on FIRST navigation to each new tab vs. ~30% smaller
// initial JS payload. Worth it on mobile, invisible on desktop.
const LearnPage = lazy(() =>
  import('./pages/LearnPage').then((m) => ({ default: m.LearnPage })),
);
const StudyPage = lazy(() =>
  import('./pages/StudyPage').then((m) => ({ default: m.StudyPage })),
);
const PuzzlesPage = lazy(() =>
  import('./pages/PuzzlesPage').then((m) => ({ default: m.PuzzlesPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const CustomPage = lazy(() =>
  import('./pages/CustomPage').then((m) => ({ default: m.CustomPage })),
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const BotDetailPage = lazy(() =>
  import('./pages/BotDetailPage').then((m) => ({ default: m.BotDetailPage })),
);
const CountingDrillPage = lazy(() =>
  import('./pages/CountingDrillPage').then((m) => ({ default: m.CountingDrillPage })),
);
const PuzzleRushPage = lazy(() =>
  import('./pages/PuzzleRushPage').then((m) => ({ default: m.PuzzleRushPage })),
);
const ExhibitionPage = lazy(() =>
  import('./pages/ExhibitionPage').then((m) => ({ default: m.ExhibitionPage })),
);
const CertPage = lazy(() =>
  import('./pages/CertPage').then((m) => ({ default: m.CertPage })),
);
import { loadSettings, type Settings } from './lib/settings';
import {
  playCapture,
  playCheck,
  playDraw,
  playLoss,
  playMove,
  playWin,
} from './lib/audio';
import {
  clearSavedGame,
  hasResumableGame,
  loadSavedGame,
  saveCurrentGame,
} from './lib/gameState';
import { autoAnalyze, nnueAutoLoad } from './lib/flags';
import { fenToPieceMap } from './lib/makruk';
import { searchTopMoves } from './lib/engine';
import { EvalBar } from './components/EvalBar';
import { ClockDisplay } from './components/Clock';
import {
  TIME_CONTROLS,
  clockFromControl,
  tickClock,
  applyMove as clockApplyMove,
  startClock,
  type ClockState,
  type TimeControl,
} from './lib/clock';
import { MultiPV } from './components/MultiPV';
import type { EvalInfo, EvalScore } from './lib/evalParser';
import { explain as coachExplain, type CoachOutput } from './lib/chessCoach';
import { GameReport } from './components/GameReport';
import { ErrorBoundary } from './components/ErrorBoundary';
import { toast } from './components/Toast';
import { OnboardingModal } from './components/OnboardingModal';
import { ActivityTicker } from './components/ActivityTicker';
import { BottomNav } from './components/BottomNav';
import { TodayStrip } from './components/TodayStrip';
import { hasOnboarded } from './lib/onboarding';
import { haptic } from './lib/haptic';
import {
  enableCloud,
  hasStoredSession,
  loadSession,
  syncHistoryFromServer,
} from './lib/backend/cloudSession';
import { getBackend } from './lib/backend';
import { useRoute, navigate, type Tab } from './lib/router';
import { thaiSquare, thaiUci } from './lib/thaiUci';
import {
  loadStreak,
  saveStreak,
  recordActivity,
} from './lib/streak';
import {
  evaluateAchievements,
  loadUnlocks,
  saveUnlocks,
} from './lib/achievements';
import {
  applyGauntletOutcome,
  currentLevel as gauntletCurrentLevel,
  loadGauntlet,
  saveGauntlet,
} from './lib/gauntlet';
import { applyEventOutcome, matchEvent } from './lib/events';
import { loadPuzzles } from './lib/content';
import { loadPuzzleProgress } from './lib/puzzleProgress';
import { loadLessonProgress } from './lib/learnProgress';

// Visible-in-nav tabs only. `cert` is a route but doesn't show in the
// tab bar (filtered out below); the type still covers it.
const TAB_LABELS: Record<Tab, string> = {
  play:     '♔ เล่น',
  // Visual-audit feedback: "ฝึก" + "ศึกษา" both translated as "study"
  // and felt overlapping. Rename to functional labels:
  //   learn → "บทเรียน" (lessons / curriculum starting from rules)
  //   study → "ทฤษฎี"  (theory: openings, endgames, tactical themes)
  learn:    '🎓 บทเรียน',
  study:    '📖 ทฤษฎี',
  puzzles:  '🧩 ปริศนา',
  custom:   '🎨 ออกแบบ',
  library:  '📚 คลัง',
  profile:  '👤 โปรไฟล์',
  settings: '⚙️ ตั้งค่า',
  about:    'ℹ️ เกี่ยวกับ',
  cert:     '', // hidden — visited via shareable URL only
  bots:     '', // hidden — visited via /#/bots/<bot-id> deep link
  counting: '', // hidden — visited via /#/counting or /#/counting/<level>
  rush:     '', // hidden — visited via /#/rush
  exhibition: '', // hidden — visited via /#/exhibition or /#/exhibition/<id>
};
const VISIBLE_TABS: Tab[] = (Object.keys(TAB_LABELS) as Tab[]).filter(
  (t) => TAB_LABELS[t] !== '',
);

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
  | 'play-white' // user plays white, computer plays black
  | 'play-black' // user plays black, computer plays white
  | 'self-play'  // computer plays both sides — autopilot, watch + review
  | 'manual';    // user plays both sides (testing/exploration)

const MODE_LABELS: Record<Mode, string> = {
  'play-white': 'เล่นเป็นขาว (vs คอม)',
  'play-black': 'เล่นเป็นดำ (vs คอม)',
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
  /** FEN snapshot AFTER each ply, parallel to `history`. historyFens[0]
   * is the starting position; historyFens[N] is the position after
   * history[N-1] has been pushed. Used to power click-to-inspect on
   * the move list — replay-free O(1) lookup. */
  const [historyFens, setHistoryFens] = useState<string[]>([]);
  /** When non-null, the board displays the FEN at this ply instead of
   * the live position. User input is locked. null = live. */
  const [inspectPly, setInspectPly] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<Mode>('play-white');
  const [speed, setSpeed] = useState<Speed>('normal');
  const [thinking, setThinking] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [timeControlId, setTimeControlId] = useState<string>('unlimited');
  const [clock, setClock] = useState<ClockState | null>(null);
  const [hint, setHint] = useState<{ from: Square; to: Square } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintInfo, setHintInfo] = useState<string | null>(null);
  const [hintCoach, setHintCoach] = useState<CoachOutput | null>(null);
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

  // Variation explorer (lichess-style "what if I had played differently?").
  // When non-null, overrides the review-mode board FEN with a "what if"
  // position derived from playing the engine's best move (or a chosen
  // alternative). The exploration is a linear line — stepping forward
  // appends moves, going back pops. UI exits via "กลับ" button.
  const [exploreVariation, setExploreVariation] = useState<{
    /** Ply being reviewed when exploration started — used to return cleanly. */
    fromPly: number;
    /** Starting FEN of the variation (= fenBefore of the move we're alt'ing). */
    fenStart: string;
    /** UCI moves played from fenStart in this exploration. */
    line: string[];
    /** Per-ply FENs (length = line.length + 1, fens[0] === fenStart). */
    fens: string[];
    /** Which step in the line is shown on the board (0 = fenStart). */
    cursor: number;
  } | null>(null);

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

  // User preferences (sounds, animation, eval bar...). Read at mount,
  // re-loaded whenever the user leaves the Settings tab so newly-saved
  // values take effect without needing a full reload.
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  // On-demand engine analysis — triggered by the 🔍 วิเคราะห์ button.
  // analysisLines holds the top-N candidate moves; liveEval is the
  // single-number eval for the EvalBar.
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisLines, setAnalysisLines] = useState<EvalInfo[]>([]);
  const [liveEval, setLiveEval] = useState<EvalScore | null>(null);

  /** Sub-tab for the Play-page sidebar so the whole UI fits in one
   * viewport without scrolling. Three orthogonal slices of the
   * normally-stacked sidebar content. */
  type SidebarTab = 'game' | 'help' | 'moves';
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('game');

  // Auto-analyze trigger: Custom or Library may set the
  // openmakruk_auto_analyze flag in localStorage before navigating
  // to /#/play. When the Play board first becomes ready, we honour
  // the flag (and clear it) by running handleAnalyze once.
  const autoAnalyzeFiredRef = useRef(false);

  // Save & resume — when a game is in progress in a play mode, snapshot
  // the move history + game options to localStorage. On Play tab mount
  // we offer to restore. gameStartedAtRef stamps a single startedAt so
  // multiple saves of the same game share a timestamp.
  const gameStartedAtRef = useRef<number>(Date.now());
  const [resumeAvailable, setResumeAvailable] = useState<boolean>(() => hasResumableGame());

  // Track previous history length + FEN to detect new moves / captures
  // for sound effects.
  const prevHistoryLenRef = useRef(0);
  const prevPieceCountRef = useRef<number | null>(null);

  // Rated vs Casual: in Rated mode hint/undo are disabled and the
  // game's outcome is written to the rating ledger. Casual is the
  // default — practice with assist; nothing affects the rating.
  // Self-play and manual modes are always Casual regardless of toggle.
  const [rated, setRated] = useState(false);
  // Active route. Hash-synced via `useRoute` so back/forward buttons,
  // deep links, and refresh all land on the same screen. Sub-resource
  // ids (route.id) and query params (route.params) let pages deep-link
  // into a specific lesson / puzzle / library entry.
  const route = useRoute();
  const currentTab: Tab = route.tab;
  const setCurrentTab = (t: Tab) => navigate({ tab: t });
  const [loadError, setLoadError] = useState<string | null>(null);
  const pendingTimer = useRef<number | null>(null);

  // Onboarding gate: show on first ever visit. Read once at mount so
  // subsequent re-renders don't keep popping the modal — the flag flips
  // in the modal's onClose. Defer initial value to a lazy initializer
  // so localStorage isn't touched during render.
  const [showOnboarding, setShowOnboarding] = useState(() => !hasOnboarded());

  // Cloud session restore: if a previous visit enabled cloud sync, the
  // bearer token is in localStorage. Re-attach to the active backend
  // registry asynchronously; UI doesn't block on it. Failure leaves
  // the app in offline mode silently — the Settings page exposes a
  // "re-enable" button if the user notices.
  useEffect(() => {
    if (!hasStoredSession()) return;
    enableCloud({})
      .then(async () => {
        // After session activates, pull recent games from the server
        // and merge into local stats. Lets a user who plays on phone
        // and then opens laptop see those games immediately.
        const local = loadStats();
        const merged = await syncHistoryFromServer(local.history);
        if (merged !== local.history) {
          const next = { ...local, history: merged };
          saveStats(next);
          setStats(next);
        }
      })
      .catch(() => {
        // Server unreachable or token rejected. We don't toast here
        // because boot-time errors should be quiet; the user can
        // re-enable explicitly from Settings.
      });
  }, []);

  // Daily streak — pulse on every app boot. recordActivity is
  // idempotent within a day, so multiple visits don't double-count.
  useEffect(() => {
    const next = recordActivity(loadStreak());
    saveStreak(next);
    log('streak.pulse', { current: next.current, longest: next.longest });
  }, []);

  // Achievement evaluation — runs whenever stats / puzzle / lesson
  // progress changes. New unlocks are toasted. Best-effort: failures
  // here never block gameplay.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const puzzles = await loadPuzzles();
        if (cancelled) return;
        const streak = loadStreak();
        const ctx = {
          stats,
          puzzleProgress: loadPuzzleProgress(),
          lessonProgress: loadLessonProgress(),
          puzzles,
          streakCurrent: streak.current,
          streakLongest: streak.longest,
        };
        const { newlyUnlocked, updated } = evaluateAchievements(ctx, loadUnlocks());
        if (newlyUnlocked.length > 0) {
          saveUnlocks(updated);
          for (const a of newlyUnlocked) {
            toast.success(`${a.icon} ปลดล็อก: ${a.name}`);
            log('achievement.unlock', { id: a.id });
          }
        }
      } catch (err) {
        log('achievement.eval.error', { error: String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [stats.totalGames, stats.rating, state?.fen]);

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
        setHistoryFens([b.fen()]);
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
          setHistoryFens((f) => [...f, board.fen()]);
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
          setHistoryFens((f) => [...f, board.fen()]);
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

  /** Effective board view: when inspecting a past ply, override fen +
   * lastMove + legalMoves so the user sees that historical snapshot.
   * Moves are disabled in inspect mode (viewDisabled gate). */
  const inspectedView = useMemo(() => {
    if (inspectPly === null || !state) return null;
    const fen = historyFens[inspectPly] ?? state.fen;
    const moveUci = inspectPly > 0 ? history[inspectPly - 1] : null;
    const lm = moveUci ? parseUci(moveUci) : null;
    return {
      fen,
      lastMove: lm ? { from: lm.from, to: lm.to } : null,
    };
  }, [inspectPly, historyFens, history, state]);

  // Clear hint whenever the position changes — once a move is played
  // (by either side), last hint is stale and shouldn't linger.
  useEffect(() => {
    setHint(null);
    setHintInfo(null);
    setHintCoach(null);
    // Analysis is also position-specific — drop it on any move so the
    // user re-runs analyze for the new position.
    setAnalysisLines([]);
    setLiveEval(null);
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
    // Only Rated games hit the rating ledger — Casual practice doesn't.
    if (!rated) {
      log('stats.skip', { reason: 'casual', result: forcedResult ?? state.result });
      gameRecordedRef.current = true;
      return;
    }
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
    // Apply outcome to active gauntlet (if any). Runs alongside rating
    // bookkeeping so a gauntlet win counts whether or not the user is
    // in rated mode.
    const g = loadGauntlet();
    if (g.active) {
      const userColor: 'white' | 'black' = mode === 'play-white' ? 'white' : 'black';
      const result = forcedResult ?? state.result;
      let outcome: 'win' | 'loss' | 'draw';
      if (result === '1/2-1/2') outcome = 'draw';
      else if (result === '1-0') outcome = userColor === 'white' ? 'win' : 'loss';
      else if (result === '0-1') outcome = userColor === 'black' ? 'win' : 'loss';
      else { gameRecordedRef.current = true; return; }
      const updated = applyGauntletOutcome(g, outcome);
      saveGauntlet(updated);
      log('gauntlet.applyOutcome', { outcome, cursor: updated.cursor, status: updated.outcome });
      if (updated.outcome === 'completed') {
        toast.success('🏆 Gauntlet Master! ชนะ CPU ทั้ง 4 ระดับติด ๆ');
      } else if (updated.outcome === 'failed') {
        toast.info(`🏰 Gauntlet จบ — ผ่านได้ ${updated.cursor} ระดับ. ลองใหม่!`);
      }
    }
    // Apply outcome to active event (if engine + difficulty match).
    const activeEvent = matchEvent(settings.engineId, difficulty);
    if (activeEvent) {
      const userColor: 'white' | 'black' = mode === 'play-white' ? 'white' : 'black';
      const result = forcedResult ?? state.result;
      let outcome: 'win' | 'loss' | 'draw';
      if (result === '1/2-1/2') outcome = 'draw';
      else if (result === '1-0') outcome = userColor === 'white' ? 'win' : 'loss';
      else if (result === '0-1') outcome = userColor === 'black' ? 'win' : 'loss';
      else { gameRecordedRef.current = true; return; }
      const scored = applyEventOutcome(activeEvent, outcome);
      log('event.applyOutcome', { event: activeEvent.id, outcome, total: scored.totalGames });
      if (outcome === 'win') {
        toast.info(`🎯 ${activeEvent.name}: +${activeEvent.pointsPerWin} pt`);
      }
    }
    // Cloud sync — fire-and-forget. Falls through quietly if backend is
    // NoOp or recordGame is not supported. We compute the outcome from
    // the same state above; duplicating the small switch here is cheaper
    // than restructuring the entire effect to share locals.
    const backend = getBackend();
    if (backend.isOnline() && backend.recordGame) {
      const userColor: 'white' | 'black' = mode === 'play-white' ? 'white' : 'black';
      const result = forcedResult ?? state.result;
      let outcome: 'win' | 'loss' | 'draw' | null = null;
      if (result === '1/2-1/2') outcome = 'draw';
      else if (result === '1-0') outcome = userColor === 'white' ? 'win' : 'loss';
      else if (result === '0-1') outcome = userColor === 'black' ? 'win' : 'loss';
      if (outcome) {
        const session = loadSession();
        if (session.token) {
          backend
            .recordGame(session.token, {
              opponent: settings.engineId === 'fairy-stockfish' ? difficulty : settings.engineId,
              userSide: userColor,
              outcome,
              plyCount: history.length,
              moves: history,
              finalFen: state.fen,
              timeControlId: timeControlId === 'unlimited' ? null : timeControlId,
              mode: rated ? 'rated' : 'casual',
            })
            .then((res) => {
              log('cloud.gameRecorded', {
                id: res.id,
                ratingDelta: res.ratingDelta,
                ratingAfter: res.ratingAfter,
                newBadges: res.newBadges,
              });
              // Toast each newly-earned badge. Tier-aware emoji so
              // the user sees if it was a small bronze or a heavyweight
              // diamond.
              if (res.newBadges && res.newBadges.length > 0) {
                for (const id of res.newBadges) {
                  toast.success(`🏅 ปลดล็อก badge: ${id}`);
                }
              }
            })
            .catch((err) => {
              log('cloud.gameRecord.failed', { error: String(err) });
              // Don't toast — server error shouldn't block the game-end
              // UX. The local stats already saved successfully.
            });
        }
      }
    }
    gameRecordedRef.current = true;
  }, [state?.isGameOver, state?.result, forcedResult, mode, difficulty, history.length, rated, settings.engineId, timeControlId, history, state?.fen]);

  // Auto-enable NNUE on next visit if it was enabled before — the
  // IndexedDB cache makes this near-instant. Effects must live above the
  // loading/error early-returns to keep React's hook order stable.
  useEffect(() => {
    if (!board || !state) return;
    if (nnueState !== 'off') return;
    try {
      if (nnueAutoLoad.read() && !isNNUELoaded()) {
        setNnueState('loading');
        setNnueProgress({ loaded: 0, total: 0 });
        loadNNUE(undefined, (loaded, total) => {
          setNnueProgress({ loaded, total });
        })
          .then(() => {
            setNnueState('on');
            setNnueProgress(null);
          })
          .catch((err) => {
            console.error('NNUE auto-load failed:', err);
            setNnueState('off');
            setNnueProgress(null);
          });
      }
    } catch {
      // localStorage disabled — silently skip
    }
  }, [board, state?.fen, nnueState]);

  // Learning mode (auto-hint every user turn) was removed — the
  // critique was correct: clicking along an arrow every move is just
  // autopilot with extra friction, no actual learning happens. The
  // Mistake Coach toggle (next sprint) replaces it.

  // Re-load settings whenever the user leaves the Settings tab, so
  // sound/volume/etc. changes take effect on Play without a refresh.
  useEffect(() => {
    if (currentTab !== 'settings') {
      setSettings(loadSettings());
    }
  }, [currentTab]);

  // Sync active engine to settings.engineId. Skipped when the chosen
  // engine is already active (avoid tearing down + reinitting on every
  // settings re-load). The actual engine swap is async — caller side
  // (Play page) tolerates this because all engine calls go through
  // `getActiveEngine()` which awaits init.
  useEffect(() => {
    if (!settings.engineId) return;
    if (getActiveEngineId() === settings.engineId) return;
    setActiveEngine(settings.engineId).catch((err) => {
      log('engineSwap.error', { id: settings.engineId, error: String(err) });
    });
  }, [settings.engineId]);

  // Sound effects on every new move. Compare history length + total
  // piece count (parsed from current FEN) against the previous state
  // to decide between playMove and playCapture. End-of-game cues
  // override the regular move sounds.
  useEffect(() => {
    if (!state) {
      prevHistoryLenRef.current = 0;
      prevPieceCountRef.current = null;
      return;
    }
    const newLen = history.length;
    const prevLen = prevHistoryLenRef.current;
    const pieceCount = Object.keys(fenToPieceMap(state.fen)).length;
    const prevCount = prevPieceCountRef.current;
    const advanced = newLen > prevLen;
    prevHistoryLenRef.current = newLen;
    prevPieceCountRef.current = pieceCount;
    if (!advanced) return;
    // Haptic always fires (no setting gate) — it costs nothing on
    // platforms without vibrate, and the rare device with vibrate
    // enabled and sounds disabled (e.g. quiet train commute) is
    // exactly when haptic carries the signal.
    if (state.isGameOver || forcedResult) {
      haptic('mate');
    } else if (state.isCheck) {
      haptic('check');
    } else if (prevCount !== null && pieceCount < prevCount) {
      haptic('capture');
    } else {
      haptic('move');
    }
    if (!settings.soundsEnabled) return;
    const userSide = mode === 'play-white' ? 'white' : mode === 'play-black' ? 'black' : null;
    const vol = settings.soundsVolume;
    if (state.isGameOver || forcedResult) {
      const result = forcedResult ?? state.result;
      if (result === '1/2-1/2') playDraw(vol);
      else if (result === '1-0') (userSide === 'white' ? playWin : playLoss)(vol);
      else if (result === '0-1') (userSide === 'black' ? playWin : playLoss)(vol);
      else playMove(vol);
      return;
    }
    if (state.isCheck) {
      playCheck(vol);
      return;
    }
    // Piece count dropped → a capture just happened. (Promotion alone
    // doesn't reduce piece count.)
    if (prevCount !== null && pieceCount < prevCount) {
      playCapture(vol);
      return;
    }
    playMove(vol);
  }, [history.length, state?.fen, state?.isCheck, state?.isGameOver, state?.result, forcedResult, mode, settings.soundsEnabled, settings.soundsVolume]);

  // Persist the in-progress game to localStorage on every move. Only
  // save in actual play modes — self-play / manual aren't resumable.
  useEffect(() => {
    if (!state || history.length === 0) return;
    if (mode !== 'play-white' && mode !== 'play-black') return;
    if (state.isGameOver || forcedResult) return;
    if (history.length === 1) gameStartedAtRef.current = Date.now();
    saveCurrentGame({
      version: 2,
      startedAt: gameStartedAtRef.current,
      lastMoveAt: Date.now(),
      startFen: MAKRUK_START_FEN,
      moves: history,
      mode: rated ? 'rated' : 'casual',
      difficulty,
      nnue: nnueState === 'on',
      timeControlId: timeControlId === 'unlimited' ? null : timeControlId,
      clockMs: clock ? { white: clock.white, black: clock.black } : null,
      userSide: mode === 'play-white' ? 'white' : 'black',
    });
  }, [history.length, state?.isGameOver, state?.fen, mode, rated, difficulty, nnueState, forcedResult, timeControlId, clock]);

  // Once a game ends, drop the saved game so the next visit starts
  // fresh and doesn't offer "resume" on a terminal position.
  useEffect(() => {
    if (state?.isGameOver || forcedResult) {
      clearSavedGame();
      setResumeAvailable(false);
    }
  }, [state?.isGameOver, forcedResult]);

  // Auto-analyze on Play mount when Custom / Library set the flag.
  // Fires at most once per session — re-arms only by setting the flag
  // again (which Custom + Library do as part of their navigation).
  useEffect(() => {
    if (!board || !state || autoAnalyzeFiredRef.current) return;
    if (currentTab !== 'play') return;
    try {
      if (autoAnalyze.read()) {
        autoAnalyze.clear();
        autoAnalyzeFiredRef.current = true;
        void handleAnalyze();
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, state?.fen, currentTab]);

  // ── Gauntlet enforcement ───────────────────────────────────────
  // When a gauntlet run is active, force difficulty to its current
  // rung. Also ensure rated mode is on so the result actually
  // counts toward stats. Mode stays user-chosen (play-white or
  // play-black) since gauntlet doesn't dictate side.
  useEffect(() => {
    const g = loadGauntlet();
    if (!g.active) return;
    const level = gauntletCurrentLevel(g);
    if (!level) return;
    if (difficulty !== level) setDifficulty(level);
    if (!rated) setRated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, currentTab]);

  // ── Clock: initialise + tick + flag-fall ─────────────────────────
  // When user picks a non-unlimited time control AND a game starts
  // (first move played), spin up a ClockState. Tick at 10 Hz while
  // running. On flag-fall, force-end the game so the player who lost
  // on time records a loss.
  useEffect(() => {
    if (timeControlId === 'unlimited') {
      if (clock !== null) setClock(null);
      return;
    }
    // Re-init clock at the start of a fresh game (no history yet).
    if (history.length === 0 && clock === null) {
      const tc = TIME_CONTROLS.find((t) => t.id === timeControlId);
      if (!tc) return;
      const fresh = clockFromControl(tc, Date.now());
      setClock(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeControlId, history.length]);

  // Start the clock running on the side-to-move once the first move
  // happens (or game already in progress).
  useEffect(() => {
    if (!clock || clock.flagged) return;
    if (state?.isGameOver || forcedResult) return;
    if (currentTab !== 'play') return;
    if (history.length === 0) return;
    const sideToMove: 'white' | 'black' = state?.turn ?? 'white';
    if (clock.running === sideToMove) return; // already running on right side
    setClock((c) => (c ? startClock(c, sideToMove, Date.now()) : c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, state?.turn, state?.isGameOver, forcedResult, currentTab]);

  // 10 Hz tick. Cheap — only runs while a clock is active + game live.
  useEffect(() => {
    if (!clock || clock.flagged) return;
    if (clock.running === null) return;
    if (state?.isGameOver || forcedResult) return;
    const interval = window.setInterval(() => {
      setClock((c) => (c ? tickClock(c, Date.now()) : c));
    }, 100);
    return () => window.clearInterval(interval);
  }, [clock?.running, clock?.flagged, state?.isGameOver, forcedResult]);

  // Flag-fall handler — when a clock hits 0, the side that flagged
  // loses on time. Translate to a forced result so the existing
  // game-over UI + auto-recorder picks it up.
  useEffect(() => {
    if (!clock?.flagged) return;
    if (forcedResult) return;
    // The side that flagged loses. White flagged → black wins (0-1).
    const result = clock.flagged === 'white' ? '0-1' : '1-0';
    setForcedResult(result);
    log('clock.flagFall', { side: clock.flagged });
  }, [clock?.flagged, forcedResult]);

  // Apply increment + swap clock side after every move (user or CPU).
  // We use history length as the trigger; whichever side just moved
  // gets the increment.
  const prevHistoryLenForClockRef = useRef(0);
  useEffect(() => {
    const prev = prevHistoryLenForClockRef.current;
    const newLen = history.length;
    prevHistoryLenForClockRef.current = newLen;
    if (!clock || clock.flagged) return;
    if (newLen <= prev) return; // not an advance (history reset / undo)
    // The side that JUST moved is opposite to current state.turn.
    // history.length odd = white just moved (1, 3, 5…); even = black.
    const mover: 'white' | 'black' = newLen % 2 === 1 ? 'white' : 'black';
    setClock((c) => (c ? clockApplyMove(c, mover, Date.now()) : c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length]);

  // ── Live evaluation bar ───────────────────────────────────────────
  // When Settings.showEvalBar is on, run a low-depth background
  // search on every position change so the EvalBar reflects the
  // current evaluation without the user having to press Analyze.
  // Light-weight (depth 10 ~ 100-300 ms); cancel-safe via a token
  // ref so out-of-order completions don't overwrite a newer eval.
  const liveEvalTokenRef = useRef(0);
  useEffect(() => {
    if (!settings.showEvalBar) return;
    if (!board || !state) return;
    if (currentTab !== 'play') return;
    if (state.isGameOver || forcedResult) return;
    // Skip during the user's main Analyze run — that one uses higher
    // depth + multi-PV; we'd just thrash the engine.
    if (analyzing) return;
    // Skip in review mode (eval bar is driven by the analysis archive).
    if (reviewActive) return;
    // Skip in inspect mode (viewer state, not real game state).
    if (inspectPly !== null) return;

    const token = ++liveEvalTokenRef.current;
    let cancelled = false;
    searchBestMove(state.fen, { depth: 10 })
      .then((result) => {
        if (cancelled) return;
        if (token !== liveEvalTokenRef.current) return; // newer search already started
        if (typeof result.mateIn === 'number') {
          setLiveEval({ type: 'mate', mate: result.mateIn });
        } else if (typeof result.scoreCp === 'number') {
          setLiveEval({ type: 'cp', cp: result.scoreCp });
        }
      })
      .catch(() => {
        // Engine error — leave liveEval as last known good
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state?.fen,
    settings.showEvalBar,
    currentTab,
    analyzing,
    reviewActive,
    inspectPly,
    state?.isGameOver,
    forcedResult,
  ]);

  // Cancel any active exploration when the user steps to a different
  // ply in review (or exits review entirely) — the exploration was
  // scoped to a specific ply's fenBefore and would be confusing if it
  // persisted after the user moved on. Must live above the early
  // returns to satisfy React's Rules of Hooks (always same order).
  useEffect(() => {
    if (!exploreVariation) return;
    if (!reviewActive) { setExploreVariation(null); return; }
    if (exploreVariation.fromPly !== reviewPly) setExploreVariation(null);
  }, [reviewPly, reviewActive, exploreVariation]);

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
    setHistoryFens((f) => [...f, board.fen()]);
    setState(snapshot(board));
    // Hint banner / Coach panel becomes stale once the user moves — clear
    // them so the sidebar doesn't keep showing yesterday's recommendation.
    setHint(null);
    setHintInfo(null);
    setHintCoach(null);
    // If the user got pushed into the "ผู้ช่วย" sub-tab by an earlier
    // hint/analyze click, jump them back to the move log so they can see
    // their own move land + decide what to do next.
    if (sidebarTab === 'help') setSidebarTab('moves');
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
    toast.confirm('ยอมแพ้ในเกมนี้? (จะเสีย rating)', {
      confirmLabel: 'ยอมแพ้',
      destructive: true,
      onConfirm: () => {
        if (!state) return;
        log('user.resign', { mode, fullmove: state.fullmove });
        const userColor: 'white' | 'black' =
          mode === 'play-white' ? 'white' : 'black';
        const losingResult = userColor === 'white' ? '0-1' : '1-0';
        // Keep history intact so the user can still review the game;
        // the auto-recorder effect picks up forcedResult and writes
        // the loss into stats. Game-over overlay also keys off it.
        setForcedResult(losingResult);
      },
    });
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
    setHistoryFens([board.fen()]);
    setInspectPly(null);
    setState(snapshot(board));
    // Reset clock back to its initial state for the chosen time control.
    if (timeControlId !== 'unlimited') {
      const tc = TIME_CONTROLS.find((t) => t.id === timeControlId);
      if (tc) setClock(clockFromControl(tc, Date.now()));
    } else {
      setClock(null);
    }
    setForcedResult(null);
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
      nnueAutoLoad.set(true);
    } catch (err) {
      console.error('NNUE load failed:', err);
      setNnueState('off');
      setNnueProgress(null);
    }
  };

  const handleAnalyze = async () => {
    if (!state || analyzing) return;
    setSidebarTab('help'); // surface the output where it'll appear
    setAnalyzing(true);
    log('analyze.request', { fen: state.fen });
    try {
      const lines = await searchTopMoves(state.fen, { depth: 14 }, 3);
      const infos: EvalInfo[] = lines.map((l) => ({
        depth: l.depth,
        multipv: l.multipv,
        score:
          typeof l.mateIn === 'number'
            ? { type: 'mate', mate: l.mateIn }
            : { type: 'cp', cp: l.scoreCp ?? 0 },
        pv: l.pv,
      }));
      setAnalysisLines(infos);
      if (infos[0]) setLiveEval(infos[0].score);
      log('analyze.done', { lines: infos.length, depth: infos[0]?.depth });
    } catch (err) {
      console.error('analyze failed:', err);
      log('analyze.error', { error: String(err) });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleHint = async () => {
    if (!state || hintLoading || thinking || state.isGameOver) return;
    if (userSide !== 'both' && userSide !== state.turn) return;
    setSidebarTab('help'); // surface the Coach panel where the result lands
    setHintLoading(true);
    log('hint.request', { fen: state.fen });
    try {
      const result = await searchBestMove(state.fen, { depth: 14 });
      if (result.bestMove && result.bestMove !== '(none)' && result.bestMove !== '0000') {
        const { from, to } = parseUci(result.bestMove);
        setHint({ from: from as Square, to: to as Square });
        // Build the Chess Coach explanation: simulate the recommended
        // move on a throwaway ffish board to get the resulting FEN,
        // then feed before/after + engine eval into the rule-based
        // explainer. This is what produces the natural-language
        // "💰 จับเรือฟรี" / "🪤 ม้า fork ขุน+เรือ" etc. messages.
        try {
          const ffish = await loadFfish();
          const tmpBoard = new ffish.Board('makruk', state.fen);
          try {
            tmpBoard.push(result.bestMove);
            const coach = coachExplain({
              fenBefore: state.fen,
              fenAfter: tmpBoard.fen(),
              moveUci: result.bestMove,
              scoreCpAfter: result.scoreCp,
              mateInAfter: result.mateIn,
              depth: result.depth,
            });
            setHintCoach(coach);
          } finally {
            tmpBoard.delete();
          }
        } catch (err) {
          log('hint.coachFailed', { error: String(err) });
          setHintCoach(null);
        }
        // Keep the compact eval label as a fallback string. Phrase it in
        // user-friendly Thai instead of engine jargon — non-chess players
        // will read this without knowing what "eval +1.50" means.
        let info = '';
        if (typeof result.mateIn === 'number') {
          info = `รุกจนใน ${Math.abs(result.mateIn)} ตา`;
        } else if (typeof result.scoreCp === 'number') {
          const cp = result.scoreCp;
          const pawns = Math.abs(cp / 100).toFixed(1);
          if (cp > 50) info = `ได้เปรียบ ~${pawns} เบี้ย`;
          else if (cp < -50) info = `เสียเปรียบ ~${pawns} เบี้ย`;
          else info = 'สูสี';
        }
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
  // Three view modes, in priority order:
  //   1. reviewActive  — post-game engine analysis stepping
  //   2. inspectedView — mid-game peek at a past ply (lightweight,
  //                      no engine)
  //   3. live          — actual current position, input enabled
  // When variation exploration is active, its cursor wins over the
  // normal review-ply FEN. That's how "what if I had played the engine
  // move instead?" projects onto the same board without losing the
  // review state behind it.
  const viewFen = exploreVariation
    ? exploreVariation.fens[exploreVariation.cursor] ?? exploreVariation.fenStart
    : reviewActive
      ? reviewPly === 0
        ? MAKRUK_START_FEN
        : reviewMoves[reviewPly - 1]?.fenAfter ?? state.fen
      : inspectedView
        ? inspectedView.fen
        : state.fen;
  const viewLastMove = exploreVariation
    ? exploreVariation.cursor > 0
      ? parseUci(exploreVariation.line[exploreVariation.cursor - 1])
      : null
    : reviewActive
      ? reviewPly === 0
        ? null
        : (() => {
            const m = reviewMoves[reviewPly - 1];
            return m ? parseUci(m.uci) : null;
          })()
      : inspectedView
        ? inspectedView.lastMove
        : lastMove;
  const viewLegalMoves = reviewActive || inspectedView ? [] : state.legalMoves;
  const viewDisabled =
    reviewActive ||
    inspectedView !== null ||
    thinking ||
    state.isGameOver ||
    (userSide !== 'both' && userSide !== state.turn);
  const reviewCurrent = reviewActive && reviewPly > 0 ? reviewMoves[reviewPly - 1] : null;

  /**
   * Start exploring a variation from the currently-reviewed move. Plays
   * the engine's recommended move on a throwaway ffish board to get the
   * resulting FEN, then offers a stepper UI for following the engine's
   * continuation (we fetch more PV moves as the user advances).
   */
  const handleStartExploration = async () => {
    if (!reviewCurrent || exploreVariation) return;
    try {
      const ffish = await loadFfish();
      const tmpBoard = new ffish.Board('makruk', reviewCurrent.fenBefore);
      try {
        const ok = tmpBoard.push(reviewCurrent.bestMove);
        if (!ok) {
          log('explore.startFailed', { reason: 'illegal-best-move', move: reviewCurrent.bestMove });
          return;
        }
        const fenAfter = tmpBoard.fen();
        setExploreVariation({
          fromPly: reviewPly,
          fenStart: reviewCurrent.fenBefore,
          line: [reviewCurrent.bestMove],
          fens: [reviewCurrent.fenBefore, fenAfter],
          cursor: 1,
        });
        log('explore.start', { ply: reviewPly, line: reviewCurrent.bestMove });
      } finally {
        tmpBoard.delete();
      }
    } catch (err) {
      log('explore.error', { error: String(err) });
    }
  };

  /** Step the exploration cursor forward — if the line ends, ask the
   *  engine for the next best move from the current position. */
  const handleExploreNext = async () => {
    if (!exploreVariation) return;
    const ev = exploreVariation;
    if (ev.cursor < ev.line.length) {
      setExploreVariation({ ...ev, cursor: ev.cursor + 1 });
      return;
    }
    // At the end of the known line — ask engine for next move.
    try {
      const result = await searchBestMove(ev.fens[ev.cursor], { depth: 12 });
      if (!result.bestMove || result.bestMove === '(none)' || result.bestMove === '0000') return;
      const ffish = await loadFfish();
      const tmpBoard = new ffish.Board('makruk', ev.fens[ev.cursor]);
      try {
        tmpBoard.push(result.bestMove);
        const nextFen = tmpBoard.fen();
        setExploreVariation({
          ...ev,
          line: [...ev.line, result.bestMove],
          fens: [...ev.fens, nextFen],
          cursor: ev.cursor + 1,
        });
      } finally {
        tmpBoard.delete();
      }
    } catch (err) {
      log('explore.next.error', { error: String(err) });
    }
  };

  const handleExplorePrev = () => {
    if (!exploreVariation || exploreVariation.cursor === 0) return;
    setExploreVariation({ ...exploreVariation, cursor: exploreVariation.cursor - 1 });
  };

  const handleExitExploration = () => {
    setExploreVariation(null);
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

  const suggestedLevel = recommendedLevel(stats.rating);
  const isVsCpu = mode === 'play-white' || mode === 'play-black';
  // The "effective" rated flag — self-play and manual are always casual
  // because there's no sensible Elo update against yourself.
  const effectivelyRated = isVsCpu && rated;

  const handleResume = () => {
    if (!board) return;
    const saved = loadSavedGame();
    if (!saved) {
      setResumeAvailable(false);
      return;
    }
    // Reset board to start, then replay every saved move.
    for (let i = 0; i < history.length; i++) board.pop();
    const fens: string[] = [board.fen()];
    let applied = 0;
    for (const move of saved.moves) {
      try {
        board.push(move);
        fens.push(board.fen());
        applied += 1;
      } catch {
        // Saved move is no longer legal (engine version skew, position
        // corruption); bail out and start fresh from where we got.
        break;
      }
    }
    setHistory(saved.moves.slice(0, applied));
    setHistoryFens(fens);
    setInspectPly(null);
    setState(snapshot(board));
    gameStartedAtRef.current = saved.startedAt;
    setMode(saved.userSide === 'white' ? 'play-white' : 'play-black');
    setFlipped(saved.userSide === 'black');
    setDifficulty(saved.difficulty);
    setRated(saved.mode === 'rated');
    // Restore clock if the saved game was timed. Unlimited games keep
    // clock = null. For timed games, reconstruct ClockState from the
    // saved increment + the saved ms-remaining for each side. The
    // running side is whoever's turn it is now (= state.turn) and
    // the side that's about to move owns the elapsed time until
    // they actually move.
    if (saved.timeControlId && saved.timeControlId !== 'unlimited' && saved.clockMs) {
      const tc = TIME_CONTROLS.find((t) => t.id === saved.timeControlId);
      if (tc) {
        const sideToMove: 'white' | 'black' = board.turn() ? 'white' : 'black';
        setTimeControlId(saved.timeControlId);
        setClock({
          white: saved.clockMs.white,
          black: saved.clockMs.black,
          incrementMs: tc.incrementSeconds * 1000,
          running: sideToMove,
          lastTickMs: Date.now(),
          flagged: null,
        });
      }
    } else {
      setTimeControlId('unlimited');
      setClock(null);
    }
    setResumeAvailable(false);
    log('game.resumed', { plies: applied, mode: saved.mode, timeControl: saved.timeControlId });
  };

  const handleDiscardSaved = () => {
    clearSavedGame();
    setResumeAvailable(false);
    log('game.savedDiscarded');
  };

  const handleResetAll = () => {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    clearSavedGame();
    setResumeAvailable(false);
    for (let i = 0; i < history.length; i++) board.pop();
    setHistory([]);
    setHistoryFens([board.fen()]);
    setInspectPly(null);
    setState(snapshot(board));
    setSelfPlayPaused(false);
    setSelfPlayStopReason(null);
    setForcedResult(null);
    setDrawOfferRefused(null);
    gameRecordedRef.current = false;
    clearStats();
    setStats(loadStats());
  };

  return (
    <div className={`app ${state.isCheck && currentTab === 'play' ? 'is-check' : ''}`}>
      <header className="app-header">
        <div className="app-header-brand">
          <h1>OpenMakruk</h1>
          <span className="app-header-version">v0.1</span>
        </div>
        <nav className="tabs" role="tablist">
          {VISIBLE_TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={currentTab === t}
              className={`tab ${currentTab === t ? 'is-active' : ''}`}
              onClick={() => setCurrentTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
        <button
          className="app-profile-widget"
          onClick={() => setCurrentTab('profile')}
          title="ดูโปรไฟล์ + ประวัติเกม"
          aria-label={`โปรไฟล์: ${stats.displayName} · rating ${stats.rating}`}
        >
          {(() => {
            const streak = loadStreak();
            const days = streak.current;
            return days > 0 ? (
              <span
                className="app-profile-streak"
                title={`เข้ามาเล่น ${days} วันติดต่อกัน · longest ${streak.longest}`}
                aria-label={`streak ${days} วันติด`}
              >
                🔥 {days}<span className="app-profile-unit">d</span>
              </span>
            ) : null;
          })()}
          <span className="app-profile-name">{stats.displayName}</span>
          <span
            className="app-profile-rating"
            title={`rating ${stats.rating} · K-factor 32`}
            aria-label={`rating ${stats.rating}`}
          >
            <span className="app-profile-rating-label">R</span>
            {stats.rating}
          </span>
        </button>
      </header>
      <ActivityTicker />

      <Suspense
        fallback={
          <div className="page-loading" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <p>กำลังโหลดหน้า…</p>
          </div>
        }
      >
      {currentTab === 'learn' && (
        <ErrorBoundary scope="learn">
          <LearnPage initialLessonId={route.id} />
        </ErrorBoundary>
      )}
      {currentTab === 'study' && (
        <ErrorBoundary scope="study">
          <StudyPage
            onLoadPuzzleTheme={(_tag) => {
              // Navigate to puzzles tab. Future enhancement: pass the
              // tag as a query param so PuzzlesPage filters by it.
              navigate({ tab: 'puzzles' });
            }}
          />
        </ErrorBoundary>
      )}
      {currentTab === 'puzzles' && (
        <ErrorBoundary scope="puzzles">
          <PuzzlesPage initialPuzzleId={route.id} />
        </ErrorBoundary>
      )}
      {currentTab === 'custom' && (
        <ErrorBoundary scope="custom"><CustomPage
          initialFen={state.fen}
          onLoadPosition={(fen: string) => {
            try {
              loadFfish().then((ffish) => {
                if (board) board.delete();
                const fresh = new ffish.Board('makruk', fen);
                setBoard(fresh);
                setHistory([]);
                setHistoryFens([fresh.fen()]);
                setInspectPly(null);
                setState(snapshot(fresh));
                setForcedResult(null);
                setDrawOfferRefused(null);
                gameRecordedRef.current = false;
                setSelfPlayPaused(false);
                setSelfPlayStopReason(null);
                setCurrentTab('play');
                log('custom.position.loaded', { fen });
              });
            } catch (err) {
              console.error('Load custom position failed:', err);
              toast.error('โหลด position ไม่สำเร็จ — FEN อาจไม่ถูกต้องตามกฎหมากรุกไทย');
            }
          }}
        /></ErrorBoundary>
      )}
      {currentTab === 'library' && (
        <ErrorBoundary scope="library"><LibraryPage
          initialPositionId={route.id}
          onLoad={(fen) => {
            try {
              loadFfish().then((ffish) => {
                if (board) board.delete();
                const fresh = new ffish.Board('makruk', fen);
                setBoard(fresh);
                setHistory([]);
                setHistoryFens([fresh.fen()]);
                setInspectPly(null);
                setState(snapshot(fresh));
                setForcedResult(null);
                setDrawOfferRefused(null);
                gameRecordedRef.current = false;
                setSelfPlayPaused(false);
                setSelfPlayStopReason(null);
                setCurrentTab('play');
                log('library.position.loaded', { fen });
              });
            } catch (err) {
              console.error('Load library position failed:', err);
              toast.error('โหลด position ไม่สำเร็จ');
            }
          }}
        /></ErrorBoundary>
      )}
      {currentTab === 'profile' && (
        <ErrorBoundary scope="profile"><ProfilePage
          stats={stats}
          onStatsChange={setStats}
          onResetAll={handleResetAll}
        /></ErrorBoundary>
      )}
      {currentTab === 'settings' && (
        <ErrorBoundary scope="settings"><SettingsPage /></ErrorBoundary>
      )}
      {currentTab === 'about' && (
        <ErrorBoundary scope="about"><AboutPage /></ErrorBoundary>
      )}
      {currentTab === 'cert' && (
        <ErrorBoundary scope="cert"><CertPage slug={route.id} /></ErrorBoundary>
      )}
      {currentTab === 'bots' && (
        <ErrorBoundary scope="bots"><BotDetailPage botId={route.id} /></ErrorBoundary>
      )}
      {currentTab === 'counting' && (
        <ErrorBoundary scope="counting"><CountingDrillPage levelId={route.id} /></ErrorBoundary>
      )}
      {currentTab === 'rush' && (
        <ErrorBoundary scope="rush"><PuzzleRushPage /></ErrorBoundary>
      )}
      {currentTab === 'exhibition' && (
        <ErrorBoundary scope="exhibition"><ExhibitionPage gameId={route.id} /></ErrorBoundary>
      )}
      </Suspense>
      {currentTab === 'play' && (
      <ErrorBoundary scope="play"><main>
        <TodayStrip />
        {settings.showEvalBar && (
          <div className="eval-bar-live-wrap">
            <EvalBar score={liveEval} flipped={flipped} />
          </div>
        )}
        <div className="board-container">
          {resumeAvailable && history.length === 0 && (
            <div className="resume-banner">
              <div className="resume-banner-text">
                ⏸ มีเกมที่ค้างไว้ — ต้องการเล่นต่อหรือไม่?
              </div>
              <div className="resume-banner-actions">
                <button className="resume-button-primary" onClick={handleResume}>
                  ▶ ดำเนินต่อ
                </button>
                <button className="resume-button-secondary" onClick={handleDiscardSaved}>
                  🗑 เริ่มใหม่
                </button>
              </div>
            </div>
          )}
          {inspectPly !== null && !reviewActive && (
            <div className="inspect-banner" role="status">
              🔍 กำลังดูตา{inspectPly === 0 ? ' เริ่มต้น' : `ที่ ${inspectPly}`} (ตำแหน่งย้อนหลัง · กระดานล็อก)
              <button
                type="button"
                className="inspect-banner-live"
                onClick={() => setInspectPly(null)}
              >
                ← กลับไปเล่นต่อ
              </button>
            </div>
          )}
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
            pieceSet={settings.pieceSet}
            boardTheme={settings.boardTheme}
            language={settings.language}
            showCoordinates={settings.showCoordinates}
            highlightLastMove={settings.highlightLastMove}
            showLegalDots={settings.showLegalDots}
            animationMs={settings.animationMs}
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
                {(() => {
                  // Compute outcome for Next-CTA hierarchy. Falls back to
                  // draw-ish when state.result is "*" (forced result path).
                  const effectiveResult = forcedResult ?? state.result;
                  const userWonHere =
                    (mode === 'play-white' && effectiveResult === '1-0') ||
                    (mode === 'play-black' && effectiveResult === '0-1');
                  const drawHere = effectiveResult === '1/2-1/2';
                  const userLostHere =
                    (mode === 'play-white' && effectiveResult === '0-1') ||
                    (mode === 'play-black' && effectiveResult === '1-0');
                  const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'master'];
                  const idx = DIFFICULTIES.indexOf(difficulty);
                  const harder = idx >= 0 && idx < DIFFICULTIES.length - 1 ? DIFFICULTIES[idx + 1] : null;
                  const easier = idx > 0 ? DIFFICULTIES[idx - 1] : null;
                  const stepTarget = userWonHere ? harder : userLostHere ? easier : harder;
                  const stepLabel = userWonHere
                    ? '⏫ ระดับยากขึ้น'
                    : userLostHere
                      ? '⏬ ระดับง่ายขึ้น'
                      : '🔀 เปลี่ยนระดับ';
                  return (
                    <>
                      <div className="game-over-actions next-cta-row">
                        <button className="game-over-button primary" onClick={handleReset}>
                          ⟳ เล่นซ้ำ
                        </button>
                        {stepTarget && (
                          <button
                            className="game-over-button primary"
                            onClick={() => {
                              setDifficulty(stepTarget);
                              handleReset();
                            }}
                            title={`เปลี่ยนคู่ต่อสู้เป็น ${DIFFICULTY_LABELS[stepTarget]}`}
                          >
                            {stepLabel}
                            <span className="game-over-button-sub">
                              {DIFFICULTY_LABELS[stepTarget]}
                            </span>
                          </button>
                        )}
                        <button
                          className="game-over-button primary"
                          onClick={() => navigate({ tab: 'puzzles' })}
                        >
                          🧩 ลองปริศนา
                        </button>
                      </div>
                      <div className="game-over-actions next-cta-secondary">
                        <button
                          className="game-over-button game-over-review secondary"
                          onClick={handleStartReview}
                          disabled={reviewLoading || history.length === 0}
                        >
                          {reviewLoading
                            ? `🔍 วิเคราะห์... ${reviewProgress?.current ?? 0}/${reviewProgress?.total ?? 0}`
                            : '🔍 ดูรีวิวเกม'}
                        </button>
                        <button
                          className="game-over-button secondary"
                          onClick={() => {
                            const oppName = DIFFICULTY_LABELS[difficulty];
                            const plyCount = history.length;
                            const outcomeText = drawHere
                              ? `เสมอกับ ${oppName}`
                              : userWonHere
                                ? `ผมชนะ ${oppName}`
                                : `ผมแพ้ ${oppName}`;
                            const text = `${outcomeText} ใน ${plyCount} ตา · มาลองเล่น Makruk กัน`;
                            const url = 'https://openmakruk.com';
                            if (typeof navigator.share === 'function') {
                              navigator
                                .share({ title: 'OpenMakruk', text, url })
                                .catch(() => undefined);
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
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
        <aside className="sidebar">
          {clock && !reviewActive && (
            <ClockDisplay
              clock={clock}
              userSide={mode === 'play-white' ? 'white' : 'black'}
            />
          )}
          {reviewActive && (
            <ReviewTabbedPanel
              moves={reviewMoves}
              currentPly={reviewPly}
              currentMove={reviewCurrent}
              userSide={
                mode === 'play-white' ? 'white' :
                mode === 'play-black' ? 'black' : null
              }
              result={forcedResult ?? state.result ?? '*'}
              onPlySelect={setReviewPly}
              onExit={handleExitReview}
              exploreVariation={exploreVariation}
              onExploreStart={handleStartExploration}
              onExploreNext={handleExploreNext}
              onExplorePrev={handleExplorePrev}
              onExploreExit={handleExitExploration}
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

          {!reviewActive && (
            <div className="sidebar-tabs" role="tablist">
              {(
                [
                  ['game', '🎮 เกม'],
                  ['help', '🧠 ผู้ช่วย'],
                  ['moves', '📜 ตาเดิน'],
                ] as [SidebarTab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  role="tab"
                  className={`sidebar-tab ${sidebarTab === t ? 'is-active' : ''}`}
                  onClick={() => setSidebarTab(t)}
                  aria-selected={sidebarTab === t}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className={`sidebar-tab-content sidebar-tab-${sidebarTab}`}>
          {!reviewActive && sidebarTab === 'game' && <>
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
            <span className="label">เวลา</span>
            <select
              value={timeControlId}
              onChange={(e) => {
                const next = e.target.value;
                if (history.length > 0 && next !== timeControlId) {
                  toast.confirm('เปลี่ยน time control จะรีเซ็ตเกมปัจจุบัน. ยืนยัน?', {
                    onConfirm: () => { handleReset(); setTimeControlId(next); setClock(null); },
                  });
                  return;
                }
                setTimeControlId(next);
                setClock(null); // re-init on next render via the timeControl effect
              }}
            >
              {TIME_CONTROLS.map((tc: TimeControl) => (
                <option key={tc.id} value={tc.id}>{tc.label}</option>
              ))}
            </select>
          </div>

          {isVsCpu && (
            <label className={`rated-toggle ${rated ? 'is-rated' : 'is-casual'}`}>
              <input
                type="checkbox"
                checked={rated}
                onChange={(e) => {
                  const nextRated = e.target.checked;
                  if (history.length > 0) {
                    toast.confirm('เปลี่ยนโหมด rated/casual จะรีเซ็ตเกมปัจจุบัน. ยืนยัน?', {
                      onConfirm: () => { handleReset(); setRated(nextRated); },
                    });
                    return;
                  }
                  setRated(nextRated);
                }}
              />
              <span className="rated-toggle-text">
                {rated ? (
                  <>
                    🏆 <strong>จัดอันดับ</strong> (rated · ไม่มี hint/undo · บันทึก Elo)
                  </>
                ) : (
                  <>
                    🎮 <strong>ฝึก</strong> (casual · hint/undo เปิด · ไม่บันทึก Elo)
                  </>
                )}
              </span>
            </label>
          )}

          <details className="advanced-controls">
            <summary>⚙ ตั้งค่า engine (NNUE / ความเร็ว)</summary>
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
          </details>

          </>}{/* end of sidebarTab === 'game' (config block) */}

          {!reviewActive && sidebarTab === 'game' && <>
          <div
            className={`turn-badge turn-${state.turn} ${thinking ? 'is-thinking' : ''} ${state.isCheck ? 'is-check' : ''}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
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

          </>}{/* end of sidebarTab === 'game' (state block) */}

          {!reviewActive && sidebarTab === 'moves' && <>
          <div className="controls">
            <button
              className="hint-button"
              onClick={handleHint}
              disabled={
                effectivelyRated ||
                hintLoading ||
                thinking ||
                state.isGameOver ||
                (userSide !== 'both' && userSide !== state.turn)
              }
              title={effectivelyRated ? 'Hint ปิดในโหมดจัดอันดับ' : 'ขอเครื่องแนะนำตาเดิน'}
            >
              {hintLoading ? (
                <>
                  <span className="spinner-sm" aria-hidden="true" />
                  กำลังคิด...
                </>
              ) : effectivelyRated ? (
                <>🔒 Hint (rated)</>
              ) : (
                <>💡 ขอ Hint</>
              )}
            </button>
            <button
              onClick={handleUndo}
              disabled={effectivelyRated || history.length === 0 || thinking}
              title={effectivelyRated ? 'Undo ปิดในโหมดจัดอันดับ' : 'ย้อนตาเดิน'}
            >
              {effectivelyRated ? '🔒 ย้อน' : '↶ ย้อน'}
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

          {history.length > 0 && (
            <div className="move-log">
              <div className="move-log-header">
                <span className="label">ตาเดินในเกมนี้</span>
                {inspectPly !== null && (
                  <button
                    className="move-log-live"
                    onClick={() => setInspectPly(null)}
                    title="กลับไปดูตำแหน่งปัจจุบัน"
                  >
                    🔴 LIVE
                  </button>
                )}
              </div>
              <div className="move-log-list" role="list">
                <button
                  role="listitem"
                  className={`move-log-row start ${
                    inspectPly === 0 ? 'is-current' : ''
                  }`}
                  onClick={() => setInspectPly(0)}
                  title="ตำแหน่งเริ่มต้น"
                >
                  <span className="move-log-num">0</span>
                  <span className="move-log-uci">⏪ start</span>
                </button>
                {history.map((uci, i) => {
                  const ply = i + 1;
                  const isWhite = i % 2 === 0;
                  const isCurrent = inspectPly === ply;
                  return (
                    <button
                      key={`${ply}-${uci}`}
                      role="listitem"
                      className={`move-log-row ${isCurrent ? 'is-current' : ''}`}
                      onClick={() => setInspectPly(ply)}
                    >
                      <span className="move-log-num">{ply}</span>
                      <span className="move-log-side">{isWhite ? '♔' : '♚'}</span>
                      <span className="move-log-uci">{thaiUci(uci)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </>}{/* end of sidebarTab === 'moves' */}

          {!reviewActive && sidebarTab === 'help' && <>
          {hint && (
            <div className={`hint-info coach-${hintCoach?.strength ?? 'neutral'}`}>
              <div className="hint-info-header">
                💡 แนะนำ <strong>{thaiSquare(hint.from)} → {thaiSquare(hint.to)}</strong>
                {hintInfo && (
                  <span className="hint-info-eval">{hintInfo}</span>
                )}
              </div>
              {hintCoach ? (
                <>
                  <div className="hint-info-headline">{hintCoach.headline}</div>
                  {hintCoach.details.length > 0 && (
                    <ul className="hint-info-details">
                      {hintCoach.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                hintInfo && <span className="label-aside">{hintInfo}</span>
              )}
            </div>
          )}

          {/* On-demand position analysis: top-3 candidate moves +
              eval bar. Eval bar + Multi-PV ONLY appear after the
              user explicitly clicks Analyze — otherwise this panel
              eats vertical space on mobile and pushes the board
              off-screen. */}
          <div className="analyze-panel">
            <button
              className="analyze-button"
              onClick={handleAnalyze}
              disabled={analyzing || !board}
            >
              {analyzing
                ? '🔍 กำลังวิเคราะห์ตำแหน่ง...'
                : analysisLines.length > 0
                  ? '🔁 วิเคราะห์ใหม่'
                  : '🔍 วิเคราะห์ตำแหน่ง (top 3)'}
            </button>
            {analysisLines.length > 0 && (
              <div className="analyze-row">
                <EvalBar score={liveEval} depth={analysisLines[0]?.depth} flipped={flipped} />
                <MultiPV lines={analysisLines} />
              </div>
            )}
            {analysisLines.length > 0 && (
              <button
                className="analyze-close"
                onClick={() => {
                  setAnalysisLines([]);
                  setLiveEval(null);
                }}
                title="ซ่อนผลวิเคราะห์"
              >
                ✕ ปิดผลวิเคราะห์
              </button>
            )}
          </div>
          </>}{/* end of sidebarTab === 'help' */}

          </div>{/* end of .sidebar-tab-content */}
        </aside>
      </main></ErrorBoundary>
      )}
      {/* Footer kept minimal — version + a single source link. The
          old "v0.1 · Fairy-Stockfish · hint · review · NNUE-ready"
          jargon string was dev-signature spillage on every page;
          credits + stack details now live on the About page. */}
      <footer>
        <p>
          <a href="https://github.com/cnatthaphon/openmakruk" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          {' · '}
          <button
            type="button"
            className="footer-about-link"
            onClick={() => setCurrentTab('about')}
          >
            เกี่ยวกับ
          </button>
        </p>
      </footer>
      <BottomNav currentTab={currentTab} />
      {showOnboarding && (
        <OnboardingModal onClose={() => setShowOnboarding(false)} />
      )}
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

type ReviewSideFilter = 'both' | 'white' | 'black';
type ReviewSeverityFilter = 'all' | 'mistakes' | 'blunders-only';
type ReviewSubTab = 'summary' | 'moments' | 'details';

/**
 * Tabbed wrapper that fits a full post-game review into a single
 * viewport-height panel — instead of one long scrollable column.
 *   📊 สรุป — accuracy + counts + verdict
 *   🎯 ตาสำคัญ — key-moment cards with arrows on mini-boards
 *   📋 รายละเอียด — position nav + filterable move list (legacy)
 */
type ExploreVariationState = {
  fromPly: number;
  fenStart: string;
  line: string[];
  fens: string[];
  cursor: number;
} | null;

function ReviewTabbedPanel({
  moves,
  currentPly,
  currentMove,
  userSide,
  result,
  onPlySelect,
  onExit,
  exploreVariation,
  onExploreStart,
  onExploreNext,
  onExplorePrev,
  onExploreExit,
}: {
  moves: AnnotatedMove[];
  currentPly: number;
  currentMove: AnnotatedMove | null;
  userSide: 'white' | 'black' | null;
  result: string;
  onPlySelect: (ply: number) => void;
  onExit: () => void;
  exploreVariation: ExploreVariationState;
  onExploreStart: () => void;
  onExploreNext: () => void;
  onExplorePrev: () => void;
  onExploreExit: () => void;
}) {
  const [tab, setTab] = useState<ReviewSubTab>('summary');
  return (
    <div className="review-tabbed">
      <div className="review-tabbed-header">
        <strong>🔍 รีวิวเกม</strong>
        <button className="review-exit" onClick={onExit} aria-label="ออก">✕</button>
      </div>
      <div className="review-subtabs">
        {([
          ['summary', '📊 สรุป'],
          ['moments', '🎯 ตาสำคัญ'],
          ['details', '📋 รายละเอียด'],
        ] as [ReviewSubTab, string][]).map(([t, label]) => (
          <button
            key={t}
            className={`review-subtab ${tab === t ? 'is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === 'summary' || tab === 'moments') && (
        <GameReport
          moves={moves}
          userSide={userSide}
          result={result}
          onJumpToPly={(ply) => {
            onPlySelect(ply);
            setTab('details');
          }}
          subView={tab}
        />
      )}
      {tab === 'details' && (
        <ReviewPanel
          moves={moves}
          currentPly={currentPly}
          currentMove={currentMove}
          onPlySelect={onPlySelect}
          onExit={onExit}
          hideHeader
          exploreVariation={exploreVariation}
          onExploreStart={onExploreStart}
          onExploreNext={onExploreNext}
          onExplorePrev={onExplorePrev}
          onExploreExit={onExploreExit}
        />
      )}
    </div>
  );
}

function ReviewPanel({
  moves,
  currentPly,
  currentMove,
  onPlySelect,
  onExit,
  hideHeader,
  exploreVariation,
  onExploreStart,
  onExploreNext,
  onExplorePrev,
  onExploreExit,
}: {
  moves: AnnotatedMove[];
  currentPly: number;
  currentMove: AnnotatedMove | null;
  onPlySelect: (ply: number) => void;
  onExit: () => void;
  /** When inside the tabbed wrapper, the parent already shows the
   * "🔍 รีวิวเกม" title + close button. Hide ours to avoid duplicating. */
  hideHeader?: boolean;
  exploreVariation: ExploreVariationState;
  onExploreStart: () => void;
  onExploreNext: () => void;
  onExplorePrev: () => void;
  onExploreExit: () => void;
}) {
  const summary = useMemo(() => summarize(moves), [moves]);
  const total = moves.length;
  const [sideFilter, setSideFilter] = useState<ReviewSideFilter>('both');
  const [severityFilter, setSeverityFilter] =
    useState<ReviewSeverityFilter>('all');

  // Filtered subset for the move list, but never filter the navigator
  // — full ply count + step controls always reflect the full game.
  const filteredMoves = useMemo(() => {
    return moves.filter((m) => {
      if (sideFilter !== 'both' && m.side !== sideFilter) return false;
      if (severityFilter === 'mistakes') {
        return ['inaccuracy', 'mistake', 'blunder'].includes(m.classification);
      }
      if (severityFilter === 'blunders-only') {
        return m.classification === 'blunder';
      }
      return true;
    });
  }, [moves, sideFilter, severityFilter]);
  return (
    <div className="review-panel">
      {!hideHeader && (
        <div className="review-header">
          <strong>🔍 รีวิวเกม</strong>
          <button className="review-exit" onClick={onExit} aria-label="ออกจากรีวิว">
            ✕
          </button>
        </div>
      )}

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
              <strong>{thaiUci(currentMove.bestMove)}</strong>
              {!exploreVariation && (
                <button
                  type="button"
                  className="review-explore-button"
                  onClick={onExploreStart}
                  title="ลองเล่นตาที่เครื่องแนะนำดูว่าเกมจะเป็นยังไง"
                >
                  🔍 ลองดูว่าเป็นยังไง
                </button>
              )}
            </div>
          )}
          {exploreVariation && exploreVariation.fromPly === currentPly && (
            <div className="review-explore-stepper">
              <div className="review-explore-stepper-header">
                🔍 กำลังดู "what if" line — เริ่มที่ตา {currentPly}
                <button
                  type="button"
                  className="review-explore-exit"
                  onClick={onExploreExit}
                >
                  ← กลับไปดูเกมจริง
                </button>
              </div>
              <div className="review-explore-line">
                <span className="label">Line:</span>{' '}
                {exploreVariation.line.map((mv, i) => (
                  <span
                    key={i}
                    className={`review-explore-move ${
                      i + 1 === exploreVariation.cursor ? 'is-current' : ''
                    }`}
                  >
                    {thaiUci(mv)}
                  </span>
                ))}
              </div>
              <div className="review-explore-controls">
                <button
                  type="button"
                  onClick={onExplorePrev}
                  disabled={exploreVariation.cursor === 0}
                >
                  ◀ ย้อน
                </button>
                <span className="label-aside">
                  ตา {exploreVariation.cursor} / {exploreVariation.line.length}
                </span>
                <button type="button" onClick={onExploreNext}>
                  ▶ เดินต่อ (engine)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="review-filters">
        <div className="review-filter-group">
          <span className="review-filter-label">ฝ่าย:</span>
          {(['both', 'white', 'black'] as ReviewSideFilter[]).map((s) => (
            <button
              key={s}
              className={`review-filter-button ${sideFilter === s ? 'is-active' : ''}`}
              onClick={() => setSideFilter(s)}
            >
              {s === 'both' ? 'ทั้งสอง' : s === 'white' ? '♔ ขาว' : '♚ ดำ'}
            </button>
          ))}
        </div>
        <div className="review-filter-group">
          <span className="review-filter-label">ระดับ:</span>
          {(
            [
              ['all', 'ทั้งหมด'],
              ['mistakes', 'ไม่แม่นยำ+'],
              ['blunders-only', 'เฉพาะร้ายแรง'],
            ] as [ReviewSeverityFilter, string][]
          ).map(([s, label]) => (
            <button
              key={s}
              className={`review-filter-button ${severityFilter === s ? 'is-active' : ''}`}
              onClick={() => setSeverityFilter(s)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="label-aside">
          แสดง {filteredMoves.length} / {moves.length} ตา
        </span>
      </div>

      <div className="review-list" role="list">
        {filteredMoves.length === 0 ? (
          <div className="review-empty label-aside">
            ไม่พบตาเดินตามตัวกรอง
          </div>
        ) : (
          filteredMoves.map((m) => (
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
                style={{
                  color: CLASSIFICATION_COLORS[m.classification],
                  borderColor: CLASSIFICATION_COLORS[m.classification],
                }}
                title={CLASSIFICATION_LABELS[m.classification]}
              >
                {CLASSIFICATION_GLYPHS[m.classification]}{' '}
                {CLASSIFICATION_LABELS[m.classification]}
              </span>
              <span className="review-row-eval">{formatEval(m.evalAfter)}</span>
            </button>
          ))
        )}
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

