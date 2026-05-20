// User-facing preferences. Persisted to localStorage — never leaves
// the browser. Read by the Settings page; consumed by Play page,
// Board, audio module, etc.
//
// Every setting has a sensible default so brand-new users get a
// reasonable experience without touching anything.

const STORAGE_KEY = 'openmakruk_settings';

export type Settings = {
  /** Which set of piece SVGs to render. */
  pieceSet: 'fulmene' | 'yevrowl';
  /** Board colour scheme. */
  boardTheme: 'wood' | 'green' | 'blue';
  /** Play sound effects on moves, captures, checks, game end. */
  soundsEnabled: boolean;
  /** Master volume 0..1. Multiplied into every audio cue. */
  soundsVolume: number;
  /** Show file/rank labels around the board. */
  showCoordinates: boolean;
  /** Highlight the last move with a coloured square. */
  highlightLastMove: boolean;
  /** Show legal-move dots when a piece is selected. */
  showLegalDots: boolean;
  /** Animation duration in ms; 0 disables animations entirely. */
  animationMs: number;
  /** UI language. English UI is a Phase-future feature. */
  language: 'th' | 'en';
  /** Show engine eval bar during games (Casual mode only). */
  showEvalBar: boolean;
  /** Confirm before resigning / offering draw. */
  confirmActions: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  pieceSet: 'fulmene',
  boardTheme: 'wood',
  soundsEnabled: true,
  soundsVolume: 0.5,
  showCoordinates: true,
  highlightLastMove: true,
  showLegalDots: true,
  animationMs: 220,
  language: 'th',
  showEvalBar: false,
  confirmActions: true,
};

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    // Merge with defaults so newly-added keys get sane values when
    // a returning user loads an older settings blob.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota exceeded / disabled — silently ignore
  }
}

export function updateSetting<K extends keyof Settings>(
  current: Settings,
  key: K,
  value: Settings[K],
): Settings {
  const next = { ...current, [key]: value };
  saveSettings(next);
  return next;
}
