// User-facing preferences. Persisted via the versioned stores module
// — read by the Settings page, consumed by Play page / Board / audio.
//
// Every setting has a sensible default so brand-new users get a
// reasonable experience without touching anything. Adding a new
// setting:
//   1. Add the field to `Settings` + `DEFAULT_SETTINGS`
//   2. Bump SETTINGS_VERSION
//   3. Extend `migrate` so older payloads gain the new field

import { defineStore } from './stores';

const SETTINGS_VERSION = 3;

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
  /** UI language. */
  language: 'th' | 'en';
  /** Show engine eval bar during games (Casual mode only). */
  showEvalBar: boolean;
  /** Confirm before resigning / offering draw. */
  confirmActions: boolean;
  /** Active engine id (matches a registered engine in `lib/engines/`).
   *  Defaults to 'fairy-stockfish'. When future engines (AlphaZero-
   *  style nets, random baseline, community variants) are registered,
   *  they show up in the Settings dropdown automatically — no code
   *  change needed here. */
  engineId: string;
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
  engineId: 'fairy-stockfish',
};

// Auto-migrate any saved engineId that points to a now-deleted engine
// (random-bot / greedy-bot). Wraps loadSettings's user below.
const REMOVED_ENGINE_IDS = new Set(['random-bot', 'greedy-bot']);

const store = defineStore<Settings>({
  key: 'openmakruk_settings',
  version: SETTINGS_VERSION,
  default: () => ({ ...DEFAULT_SETTINGS }),
  migrate: (raw) => {
    // All historical versions are a flat object of partial settings;
    // missing fields fall back to defaults. Future shape changes will
    // branch on `fromVersion` here.
    const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...partial };
  },
});

export function loadSettings(): Settings {
  const raw = store.load();
  // If the user previously selected one of the now-removed baseline
  // bots, silently bump them to Fairy-Stockfish so they don't sit on
  // an engine id that no longer exists in the registry.
  if (REMOVED_ENGINE_IDS.has(raw.engineId)) {
    const fixed: Settings = { ...raw, engineId: 'fairy-stockfish' };
    store.save(fixed);
    return fixed;
  }
  return raw;
}

export function saveSettings(settings: Settings): void {
  store.save(settings);
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
