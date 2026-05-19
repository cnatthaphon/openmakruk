import { log, timeStart, timeEnd } from './log';

// Where the Makruk NNUE network lives. Pinned to a tag so users hit
// jsDelivr's edge cache hard — bump the tag in nnue/README.md when you
// replace the file and clients will pick up the new build.
export const NNUE_URL =
  'https://cdn.jsdelivr.net/gh/cnatthaphon/openmakruk@nnue-v1/nnue/makruk.nnue';

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
  // Emscripten virtual filesystem — required to inject the NNUE network.
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
  };
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
  timeStart('engine.boot');
  log('engine.boot.start');

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

  timeEnd('engine.boot');
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
  const searchId = `engine.search#${++searchCounter}`;
  timeStart(searchId);
  log('engine.search.start', { fen, opts });

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

  timeEnd(searchId, {
    bestMove: result.bestMove,
    scoreCp: result.scoreCp,
    mateIn: result.mateIn,
    depth: result.depth,
  });
  return result;
}

let searchCounter = 0;

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

// ---- NNUE loading + caching --------------------------------------------
//
// The NNUE file is ~46 MB raw / ~24 MB on the wire. We:
//   1. Cache the blob in IndexedDB after the first successful download
//      → second visit is instant, no jsDelivr round-trip
//   2. Stream the fetch and report progress so the UI can show a bar
//   3. Inject the buffer into Fairy-Stockfish's emscripten virtual
//      filesystem and finally tell UCI to use it via
//      `setoption name EvalFile value <path>`

const IDB_NAME = 'openmakruk';
const IDB_STORE = 'engine';
const IDB_KEY = 'nnue';

type ProgressCb = (loaded: number, total: number) => void;

let nnueLoaded = false;

export function isNNUELoaded(): boolean {
  return nnueLoaded;
}

export async function loadNNUE(
  url: string = NNUE_URL,
  onProgress?: ProgressCb,
): Promise<void> {
  if (nnueLoaded) {
    log('engine.nnue.alreadyLoaded');
    return;
  }
  const sf = await getEngine();
  timeStart('engine.nnue.total');

  // Try cache first — typically <100ms hit
  let buffer = await readCachedNNUE();
  if (buffer) {
    log('engine.nnue.cacheHit', { size: buffer.byteLength });
  } else {
    log('engine.nnue.download.start', { url });
    timeStart('engine.nnue.download');
    buffer = await fetchWithProgress(url, onProgress);
    timeEnd('engine.nnue.download', { size: buffer.byteLength });
    // Best effort cache; if quota is exceeded, we still proceed.
    void writeCachedNNUE(buffer).catch((err) =>
      log('engine.nnue.cacheWrite.error', { error: String(err) }),
    );
  }

  // Hand the bytes to the engine's virtual filesystem, then point UCI at it.
  const fileName = 'makruk.nnue';
  sf.FS.writeFile(`/${fileName}`, new Uint8Array(buffer));
  sf.postMessage(`setoption name EvalFile value ${fileName}`);
  await sendAndWait(sf, 'isready', (line) => line === 'readyok');

  nnueLoaded = true;
  timeEnd('engine.nnue.total', { size: buffer.byteLength });
  log('engine.nnue.active');
}

async function fetchWithProgress(
  url: string,
  onProgress?: ProgressCb,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NNUE fetch failed: HTTP ${response.status}`);
  }

  // Streamed body: lets us report progress. If unavailable (rare), fall
  // back to a single arrayBuffer() call.
  if (!response.body) return response.arrayBuffer();

  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : 0;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged.buffer;
}

// ---- IndexedDB cache (Promise wrapper) ---------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedNNUE(): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    return await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    log('engine.nnue.cacheRead.error', { error: String(err) });
    return null;
  }
}

async function writeCachedNNUE(buffer: ArrayBuffer): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(buffer, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearCachedNNUE(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    nnueLoaded = false;
  } catch (err) {
    log('engine.nnue.cacheClear.error', { error: String(err) });
  }
}
