// Thin wrapper over `fairy-stockfish-nnue.wasm` that exposes a Promise-based
// `search(fen, opts)` for the React layer. The engine loader (stockfish.js)
// is fetched dynamically as a global script and creates internal pthread
// workers, so search runs off the main thread without us managing a Worker
// directly.
//
// UCI cheat sheet (commands we actually send):
//   uci                                → engine identifies, ends with "uciok"
//   isready                            → engine ack with "readyok"
//   setoption name UCI_Variant value makruk
//   setoption name Skill Level value 0..20
//   position fen <fen>
//   go depth N  |  go movetime MS
//   bestmove <uci> ponder <uci>        ← reply we wait for

declare global {
  interface Window {
    Stockfish?: (opts?: Record<string, unknown>) => Promise<EngineInstance>;
  }
}

type EngineInstance = {
  postMessage: (cmd: string) => void;
  addMessageListener: (cb: (line: string) => void) => void;
  removeMessageListener: (cb: (line: string) => void) => void;
  terminate: () => void;
};

export type SearchOpts = {
  // Pick ONE of (depth, movetime). Engine takes whichever is more restrictive
  // when both are given, but we keep it explicit.
  depth?: number;
  movetime?: number;
  // Stockfish skill level 0..20 (0 = blunder-prone, 20 = full strength).
  skillLevel?: number;
};

export type SearchResult = {
  bestMove: string;          // UCI like "e3e4"
  ponder?: string;           // expected opponent reply
  scoreCp?: number;          // centipawn eval from side-to-move POV
  mateIn?: number;           // mate distance if applicable
  depth?: number;
};

let enginePromise: Promise<EngineInstance> | null = null;

export function getEngine(): Promise<EngineInstance> {
  if (!enginePromise) enginePromise = bootEngine();
  return enginePromise;
}

async function bootEngine(): Promise<EngineInstance> {
  // The package's stockfish.js is a UMD/CJS bundle that attaches to
  // window.Stockfish when loaded as a regular <script>. Vite's module
  // bundler chokes on its `document.currentScript` / pthread bootstrap,
  // so we side-step bundling by loading it from /public/engine/ at runtime.
  await loadScript('/engine/stockfish.js');
  if (typeof window.Stockfish !== 'function') {
    throw new Error('stockfish.js loaded but window.Stockfish is not a factory');
  }

  const sf = await window.Stockfish({
    // The package looks for stockfish.wasm + stockfish.worker.js next to
    // stockfish.js. Without locateFile it'd hit /stockfish.wasm at site root.
    locateFile: (file: string) => `/engine/${file}`,
  });

  await sendAndWait(sf, 'uci', (line) => line === 'uciok');
  sf.postMessage('setoption name UCI_Variant value makruk');
  await sendAndWait(sf, 'isready', (line) => line === 'readyok');

  return sf;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Avoid double-injection on HMR / StrictMode double-mount.
    const existing = document.querySelector(`script[data-engine-src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.dataset.engineSrc = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

function sendAndWait(
  sf: EngineInstance,
  cmd: string,
  done: (line: string) => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const listener = (line: string) => {
      if (done(line)) {
        sf.removeMessageListener(listener);
        resolve();
      }
    };
    sf.addMessageListener(listener);
    sf.postMessage(cmd);
  });
}

export async function searchBestMove(
  fen: string,
  opts: SearchOpts = {},
): Promise<SearchResult> {
  const sf = await getEngine();

  if (typeof opts.skillLevel === 'number') {
    sf.postMessage(`setoption name Skill Level value ${opts.skillLevel}`);
  }
  sf.postMessage(`position fen ${fen}`);

  let scoreCp: number | undefined;
  let mateIn: number | undefined;
  let depth: number | undefined;

  const result = await new Promise<SearchResult>((resolve) => {
    const listener = (line: string) => {
      if (line.startsWith('info')) {
        const dMatch = line.match(/\bdepth (\d+)/);
        if (dMatch) depth = Number(dMatch[1]);
        const cpMatch = line.match(/\bscore cp (-?\d+)/);
        if (cpMatch) {
          scoreCp = Number(cpMatch[1]);
          mateIn = undefined;
        }
        const mateMatch = line.match(/\bscore mate (-?\d+)/);
        if (mateMatch) {
          mateIn = Number(mateMatch[1]);
          scoreCp = undefined;
        }
        return;
      }
      if (line.startsWith('bestmove')) {
        sf.removeMessageListener(listener);
        const parts = line.split(/\s+/);
        resolve({
          bestMove: parts[1],
          ponder: parts[3],
          scoreCp,
          mateIn,
          depth,
        });
      }
    };
    sf.addMessageListener(listener);

    const goCmd = opts.movetime
      ? `go movetime ${opts.movetime}`
      : `go depth ${opts.depth ?? 10}`;
    sf.postMessage(goCmd);
  });

  return result;
}

// Difficulty presets — depth + skill-level pair so very low skills also
// time out fast (no use thinking deep when you're going to blunder anyway).
export type Difficulty = 'easy' | 'medium' | 'hard' | 'master';

export const DIFFICULTY_PRESETS: Record<Difficulty, SearchOpts> = {
  easy:   { depth: 3,  skillLevel: 1 },
  medium: { depth: 8,  skillLevel: 8 },
  hard:   { depth: 14, skillLevel: 15 },
  master: { depth: 20, skillLevel: 20 },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy:   'ง่าย',
  medium: 'ปานกลาง',
  hard:   'ยาก',
  master: 'ระดับมาสเตอร์',
};
