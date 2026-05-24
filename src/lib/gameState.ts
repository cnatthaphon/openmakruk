// Save & resume of the currently-playing game. Lives in localStorage
// via the versioned stores module; re-read on Play tab mount. Once
// the game ends (mate / draw / resign) the saved game is cleared so
// a future reload starts fresh.
//
// We store the minimum needed to reconstruct: side-to-play, starting
// FEN (in case Custom Position was used), full UCI move history, and
// the mode/difficulty that was in effect. The Play page already
// derives the current FEN from this list by replaying through ffish.

import type { Difficulty } from './engine';
import { defineStore } from './stores';

const SAVED_GAME_VERSION = 2;

export type SavedGame = {
  /** Deprecated: kept on the in-memory shape for back-compat with any
   *  caller that read it. The stores module is the source of truth. */
  version: 1 | 2;
  /** When this game was started (ms epoch). */
  startedAt: number;
  /** Last move timestamp — for showing "in progress" age. */
  lastMoveAt: number;
  /** Starting FEN (Makruk start, or a Custom Position). */
  startFen: string;
  /** UCI moves in order (alternating white/black). */
  moves: string[];
  /** 'rated' | 'casual' — needs to be preserved on resume so rating
   * doesn't double-count. */
  mode: 'rated' | 'casual';
  /** Engine difficulty preset name. */
  difficulty: Difficulty;
  /** Whether NNUE was on for this game. */
  nnue: boolean;
  /** Time control id (from clock.ts TIME_CONTROLS); null for unlimited. */
  timeControlId: string | null;
  /** Clock state at last save (null if unlimited / disabled). */
  clockMs: { white: number; black: number } | null;
  /** Which side the human plays. */
  userSide: 'white' | 'black';
};

const store = defineStore<SavedGame | null>({
  key: 'openmakruk_current_game',
  version: SAVED_GAME_VERSION,
  default: () => null,
  migrate: (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Partial<SavedGame>;
    // Required fields — anything missing means we can't reconstruct.
    if (
      typeof obj.startFen !== 'string' ||
      !Array.isArray(obj.moves) ||
      typeof obj.userSide !== 'string'
    ) {
      return null;
    }
    return {
      version: SAVED_GAME_VERSION,
      startedAt: typeof obj.startedAt === 'number' ? obj.startedAt : Date.now(),
      lastMoveAt: typeof obj.lastMoveAt === 'number' ? obj.lastMoveAt : Date.now(),
      startFen: obj.startFen,
      moves: obj.moves.filter((m): m is string => typeof m === 'string'),
      mode: obj.mode === 'casual' ? 'casual' : 'rated',
      difficulty: (obj.difficulty as Difficulty) ?? 'medium',
      nnue: !!obj.nnue,
      timeControlId: typeof obj.timeControlId === 'string' ? obj.timeControlId : null,
      clockMs:
        obj.clockMs &&
        typeof obj.clockMs === 'object' &&
        typeof (obj.clockMs as { white?: unknown }).white === 'number' &&
        typeof (obj.clockMs as { black?: unknown }).black === 'number'
          ? { white: (obj.clockMs as { white: number }).white, black: (obj.clockMs as { black: number }).black }
          : null,
      userSide: obj.userSide === 'black' ? 'black' : 'white',
    };
  },
});

export function loadSavedGame(): SavedGame | null {
  return store.load();
}

export function saveCurrentGame(game: SavedGame): void {
  store.save(game);
}

export function clearSavedGame(): void {
  store.clear();
}

/** Does the saved game look like it's actually in progress? */
export function hasResumableGame(): boolean {
  const saved = loadSavedGame();
  return saved !== null && saved.moves.length > 0;
}
