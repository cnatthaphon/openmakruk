// Fairy-Stockfish implementation of the MakrukEngine contract.
//
// Wraps `fairy-stockfish-nnue.wasm` and exposes its UCI surface
// (bestmove, multipv, NNUE network loading) through the generic
// MakrukEngine interface. The previous standalone `src/lib/engine.ts`
// lived here in module-global form; this class encapsulates the same
// state per instance so the registry can tear it down on engine swap.
//
// UCI cheat sheet (commands actually sent):
//   uci                                → identifies, ends "uciok"
//   isready                            → ack "readyok"
//   setoption name UCI_Variant value makruk
//   setoption name Skill Level value 0..20
//   setoption name MultiPV value N
//   setoption name EvalFile value <name>  (after NNUE injection)
//   position fen <fen>
//   go depth N  |  go movetime MS
//   bestmove <uci> ponder <uci>

import { log, timeStart, timeEnd } from '../log';
import {
  DEFAULT_DIFFICULTY_PRESETS,
  type AnalysisLine,
  type EngineCapabilities,
  type MakrukEngine,
  type ProgressCb,
  type SearchOpts,
  type SearchResult,
} from './types';
import { registerEngine } from './registry';

// Pinned tag so users hit jsDelivr's edge cache hard — bump the tag
// in nnue/README.md when you replace the file and clients pick up the
// new build via the cache key.
const NNUE_URL =
  'https://cdn.jsdelivr.net/gh/cnatthaphon/openmakruk@nnue-v1/nnue/makruk.nnue';

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

const IDB_NAME = 'openmakruk';
const IDB_STORE = 'engine';
const IDB_KEY = 'nnue';

const CAPABILITIES: EngineCapabilities = {
  multiPV: true,
  network: {
    sizeHint: '~46MB',
    defaultUrl: NNUE_URL,
    attribution: "belzedar_'s makruk NNUE (CC BY-SA 4.0)",
  },
  difficulty: DEFAULT_DIFFICULTY_PRESETS,
  // Match-leaderboard contract: FSF games are bucketed by difficulty
  // (a win at 'hard' is a different leaderboard cell than at 'medium').
  // Other engines record under their own id. Callers branch via this
  // flag instead of comparing engine ids directly.
  ratedAsDifficulty: true,
  // Post-game review + bot-vs-bot mining default to depth 12 — same
  // strength as the previous hardcoded constant in review.ts, now
  // declared by the engine itself so non-depth engines (MCTS) can
  // override.
  analysisDefaults: { depth: 12 },
};

export class FairyStockfishEngine implements MakrukEngine {
  readonly id = 'fairy-stockfish';
  readonly name = 'Fairy-Stockfish';
  readonly capabilities = CAPABILITIES;

  private sf: EngineInstance | null = null;
  private bootPromise: Promise<EngineInstance> | null = null;
  private nnueLoaded = false;
  private searchCounter = 0;

  async init(): Promise<void> {
    await this.boot();
  }

  async destroy(): Promise<void> {
    // The WASM module's terminate kills its pthreads. We deliberately
    // do NOT wipe the IndexedDB NNUE cache — re-creating the engine
    // should still benefit from the cached weight blob.
    try {
      this.sf?.terminate();
    } catch (err) {
      log('fairyStockfish.terminate.error', { error: String(err) });
    }
    this.sf = null;
    this.bootPromise = null;
    this.nnueLoaded = false;
  }

  async search(fen: string, opts: SearchOpts = {}): Promise<SearchResult> {
    const sf = await this.boot();
    const searchId = `engine.search#${++this.searchCounter}`;
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

  async searchMulti(
    fen: string,
    opts: SearchOpts = {},
    multipv: number = 3,
  ): Promise<AnalysisLine[]> {
    const sf = await this.boot();
    const searchId = `engine.analyze#${++this.searchCounter}`;
    timeStart(searchId);
    log('engine.analyze.start', { fen, opts, multipv });

    if (typeof opts.skillLevel === 'number') {
      sf.postMessage(`setoption name Skill Level value ${opts.skillLevel}`);
    }
    sf.postMessage(`setoption name MultiPV value ${multipv}`);
    sf.postMessage(`position fen ${fen}`);

    // Per-multipv-index latest info line. Engine emits info lines at
    // increasing depths; we keep the last one for each multipv slot,
    // which gives us the final analysis at the deepest depth.
    const lines = new Map<number, AnalysisLine>();

    const result = await new Promise<AnalysisLine[]>((resolve) => {
      const listener = (line: string) => {
        if (line.startsWith('info') && !line.includes('string')) {
          const mpvMatch = line.match(/\bmultipv (\d+)/);
          if (!mpvMatch) return;
          const idx = Number(mpvMatch[1]);
          const dMatch = line.match(/\bdepth (\d+)/);
          const depth = dMatch ? Number(dMatch[1]) : 0;
          const cpMatch = line.match(/\bscore cp (-?\d+)/);
          const mateMatch = line.match(/\bscore mate (-?\d+)/);
          const pvMatch = line.match(/\bpv ([a-h1-8 ]+)$/);
          const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];
          if (depth > 0 && pv.length > 0) {
            lines.set(idx, {
              multipv: idx,
              depth,
              scoreCp: cpMatch ? Number(cpMatch[1]) : undefined,
              mateIn: mateMatch ? Number(mateMatch[1]) : undefined,
              pv,
            });
          }
          return;
        }
        if (line.startsWith('bestmove')) {
          sf.removeMessageListener(listener);
          // Restore MultiPV=1 for subsequent search() calls so they
          // aren't slowed by ranking extra lines.
          sf.postMessage('setoption name MultiPV value 1');
          const sorted = Array.from(lines.values()).sort(
            (a, b) => a.multipv - b.multipv,
          );
          resolve(sorted);
        }
      };
      sf.addMessageListener(listener);

      const goCmd = opts.movetime
        ? `go movetime ${opts.movetime}`
        : `go depth ${opts.depth ?? 12}`;
      sf.postMessage(goCmd);
    });

    timeEnd(searchId, { lines: result.length });
    return result;
  }

  isNetworkLoaded(): boolean {
    return this.nnueLoaded;
  }

  async loadNetwork(
    url: string = NNUE_URL,
    onProgress?: ProgressCb,
  ): Promise<void> {
    if (this.nnueLoaded) {
      log('engine.nnue.alreadyLoaded');
      return;
    }
    const sf = await this.boot();
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

    this.nnueLoaded = true;
    timeEnd('engine.nnue.total', { size: buffer.byteLength });
    log('engine.nnue.active');
  }

  async clearNetworkCache(): Promise<void> {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      this.nnueLoaded = false;
    } catch (err) {
      log('engine.nnue.cacheClear.error', { error: String(err) });
    }
  }

  // ---- internals ------------------------------------------------------

  private boot(): Promise<EngineInstance> {
    if (this.sf) return Promise.resolve(this.sf);
    if (this.bootPromise) return this.bootPromise;

    this.bootPromise = (async () => {
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
      this.sf = sf;
      return sf;
    })();

    return this.bootPromise;
  }
}

// ---- module-level helpers (shared across instances) --------------------

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

// ---- Self-registration -------------------------------------------------
// Importing this module registers Fairy-Stockfish as an available engine.
// The first registration also becomes the default active engine.

registerEngine({
  id: 'fairy-stockfish',
  name: 'Fairy-Stockfish',
  factory: () => new FairyStockfishEngine(),
});
