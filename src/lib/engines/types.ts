// Engine contract — every Makruk engine (Fairy-Stockfish, future AlphaZero,
// future random/baseline) implements this interface. The UI layer talks to
// engines ONLY through this contract; it must not import any concrete
// engine module directly. Optional methods are advertised via
// `capabilities` so callers can branch on what the active engine supports
// instead of hardcoding `if (engine.id === 'fairy-stockfish')`.

/** UX-facing difficulty levels surfaced in the Play tab dropdown. */
export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'master';

/** Options passed to a single engine search. */
export type SearchOpts = {
  /** Search to a fixed depth. */
  depth?: number;
  /** Or, cap the search by wall-clock milliseconds. */
  movetime?: number;
  /** Engine-internal skill knob 0..N (engine maps to its own scale). */
  skillLevel?: number;
};

/** Result of a single-best-move search. */
export type SearchResult = {
  /** UCI like "e3e4" (or "e7e8m" for promotion to met). */
  bestMove: string;
  /** Expected opponent reply if the engine returned one. */
  ponder?: string;
  /** Centipawn eval from the side-to-move's POV. */
  scoreCp?: number;
  /** Mate distance in plies if known. */
  mateIn?: number;
  /** Depth actually reached. */
  depth?: number;
};

/** One candidate line in a multi-PV analysis. */
export type AnalysisLine = {
  multipv: number;
  depth: number;
  scoreCp?: number;
  mateIn?: number;
  pv: string[];
};

export type ProgressCb = (loaded: number, total: number) => void;

/**
 * UCI-style default difficulty mapping. Used by UCI engines
 * (Fairy-Stockfish and any future variant) for their
 * `capabilities.difficulty`. Engines whose strength knob isn't
 * `skillLevel` (e.g. an AlphaZero engine using MCTS playouts) supply
 * their own mapping. The facade in `src/lib/engine.ts` re-exports this
 * as the legacy `DIFFICULTY_PRESETS` constant so existing callers keep
 * working unchanged.
 */
export const DEFAULT_DIFFICULTY_PRESETS: Record<DifficultyLevel, SearchOpts> = {
  easy:   { depth: 3,  skillLevel: 1 },
  medium: { depth: 8,  skillLevel: 8 },
  hard:   { depth: 14, skillLevel: 15 },
  master: { depth: 20, skillLevel: 20 },
};

/**
 * What an engine can do. Callers query this before rendering optional UI
 * (e.g. only show the NNUE toggle if `capabilities.network !== null`).
 */
export type EngineCapabilities = {
  /** Engine can return >1 candidate line via searchMulti(). */
  multiPV: boolean;
  /**
   * Engine has an optional, loadable network/weights file.
   * `null` = no network concept (e.g. classical alpha-beta or random).
   */
  network: null | {
    /** Friendly size hint shown in the UI before the user opts in. */
    sizeHint?: string;
    /** Default URL used when `loadNetwork()` is called with no URL. */
    defaultUrl?: string;
    /** Attribution surfaced in About / NNUE toggle UI. */
    attribution?: string;
  };
  /** Mapping from UX difficulty level → engine SearchOpts. */
  difficulty: Record<DifficultyLevel, SearchOpts>;
};

/**
 * The contract. Every engine implements this; callers depend on this
 * type, not on any concrete engine class.
 *
 * Lifecycle: `init()` is called once before any search; `destroy()` is
 * called when switching engines so resources (workers, WASM heaps) are
 * released. `init()` must be idempotent — registry may call it again on
 * the same instance.
 */
export type MakrukEngine = {
  readonly id: string;            // stable identifier, e.g. 'fairy-stockfish'
  readonly name: string;          // display label, e.g. 'Fairy-Stockfish'
  readonly capabilities: EngineCapabilities;

  init(): Promise<void>;
  destroy(): Promise<void>;

  search(fen: string, opts?: SearchOpts): Promise<SearchResult>;

  /** Present iff `capabilities.multiPV` is true. */
  searchMulti?(fen: string, opts: SearchOpts, n: number): Promise<AnalysisLine[]>;

  /** Present iff `capabilities.network !== null`. */
  loadNetwork?(url?: string, onProgress?: ProgressCb): Promise<void>;
  isNetworkLoaded?(): boolean;
  clearNetworkCache?(): Promise<void>;
};

/** Factory used by the registry to build engine instances on demand. */
export type EngineDescriptor = {
  id: string;
  name: string;
  factory: () => MakrukEngine;
};
