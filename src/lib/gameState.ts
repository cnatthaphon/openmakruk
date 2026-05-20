// Save & resume of the currently-playing game. Lives in localStorage,
// re-read on Play tab mount. Once the game ends (mate / draw / resign)
// the saved game is cleared so a future reload starts fresh.
//
// We store the minimum needed to reconstruct: side-to-play, starting
// FEN (in case Custom Position was used), full UCI move history, and
// the mode/difficulty that was in effect. The Play page already
// derives the current FEN from this list by replaying through ffish.

const STORAGE_KEY = 'openmakruk_current_game';

export type SavedGame = {
  /** Schema version — bump if we ever change the shape. */
  version: 1;
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
  /** Engine difficulty (level 0-3 or so). */
  difficulty: number;
  /** Whether NNUE was on for this game. */
  nnue: boolean;
  /** Time control id (from clock.ts TIME_CONTROLS); null for unlimited. */
  timeControlId: string | null;
  /** Clock state at last save (null if unlimited / disabled). */
  clockMs: { white: number; black: number } | null;
  /** Which side the human plays. */
  userSide: 'white' | 'black';
};

export function loadSavedGame(): SavedGame | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCurrentGame(game: SavedGame): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {
    // ignore quota / disabled
  }
}

export function clearSavedGame(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Does the saved game look like it's actually in progress? */
export function hasResumableGame(): boolean {
  const saved = loadSavedGame();
  return saved !== null && saved.moves.length > 0;
}
