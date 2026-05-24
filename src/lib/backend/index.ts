// Backend adapter registry.
//
// Mirrors the engine registry pattern (src/lib/engines/registry.ts):
// a single-active adapter that all callers reach through `getBackend()`.
// At runtime today this is always `NoOpBackend`; Phase 9 will register
// a real Cloudflare-backed adapter via side-effect import the same way
// `engines/fairyStockfish.ts` registers Fairy-Stockfish.
//
// Why a singleton and not React context: most callers are async/lib
// modules (stats sync, leaderboard fetch) that don't have a React
// tree to thread context through. The Settings UI / About page can
// still subscribe to `setBackend` calls if they need to re-render
// when an adapter is swapped (see `onChange`).

import { NoOpBackend, type BackendAdapter } from './types';

let active: BackendAdapter = NoOpBackend;
const listeners = new Set<(b: BackendAdapter) => void>();

/** Read the active adapter. Always returns a non-null adapter. */
export function getBackend(): BackendAdapter {
  return active;
}

/**
 * Swap the active adapter. Listeners are notified synchronously so
 * the Settings UI can re-render with the new capabilities (e.g. show
 * "Sign out" once a real backend is wired up).
 */
export function setBackend(adapter: BackendAdapter): void {
  active = adapter;
  for (const fn of listeners) fn(adapter);
}

/** Subscribe to adapter swaps. Returns an unsubscribe callback. */
export function onBackendChange(fn: (b: BackendAdapter) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export type { BackendAdapter, StatsSyncResult, LeaderboardEntry, PuzzleDraft } from './types';
export { NoOpBackend };
