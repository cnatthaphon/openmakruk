// User-created puzzle store. Distinct from the curated system pool
// (which ships in /content/puzzles/all.json + manifest). Lives in
// localStorage via the versioned stores module so the schema can
// evolve without migration pain — bump the version + write a migrate
// branch, never wipe user content.
//
// Contracts:
//   - Engine verification happens at save time; `verifiedBy: 'engine'`
//     is the soft-promise marker.
//   - Caller is responsible for assigning a unique id. Convention:
//     `user_<base36(now)>_<short-random>`.
//   - There is a soft cap on entry count (MAX_ENTRIES) so a runaway
//     loop in the authoring UI can't blow the quota. Oldest entries
//     are kept; new entries beyond the cap require manual delete.

import { defineStore } from './stores';
import type { UserPuzzle, UserPuzzleStore } from './puzzleSchema';

const USER_PUZZLES_VERSION = 1;
const MAX_ENTRIES = 100;

const store = defineStore<UserPuzzleStore>({
  key: 'openmakruk_user_puzzles',
  version: USER_PUZZLES_VERSION,
  default: () => ({ puzzles: [] }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<UserPuzzleStore>;
    const list = Array.isArray(obj.puzzles) ? obj.puzzles : [];
    // Defensive: drop entries without required fields rather than
    // crash on load.
    const valid = list.filter(
      (p): p is UserPuzzle =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as UserPuzzle).id === 'string' &&
        typeof (p as UserPuzzle).fen === 'string' &&
        Array.isArray((p as UserPuzzle).solution),
    );
    return { puzzles: valid };
  },
});

export function loadUserPuzzles(): UserPuzzle[] {
  return store.load().puzzles;
}

/**
 * Save a user puzzle to the local store.
 *
 * `opts.publish` (default true) controls the server mirror. The
 * review→puzzle pipeline (issue #19) passes `publish: false` for
 * draft/private candidates so a promoted draft does NOT auto-enter the
 * shared server pool — only an explicitly public puzzle publishes.
 * Hand-authored Custom-tab puzzles keep the historical default (true).
 */
export function saveUserPuzzle(p: UserPuzzle, opts: { publish?: boolean } = {}): void {
  const current = loadUserPuzzles();
  // Update in place if id already exists; otherwise prepend (newest
  // first). Cap to MAX_ENTRIES.
  const idx = current.findIndex((x) => x.id === p.id);
  const next = idx >= 0
    ? current.map((x, i) => (i === idx ? p : x))
    : [p, ...current];
  store.save({ puzzles: next.slice(0, MAX_ENTRIES) });

  // Mirror to server (fire-and-forget) when cloud sync is on AND the
  // caller allows publishing. Local save stays source of truth for the
  // author's own copy regardless.
  if (opts.publish ?? true) {
    void publishToServer(p);
  }
}

async function publishToServer(p: UserPuzzle): Promise<void> {
  // Dynamic import keeps the publish path off the critical bundle —
  // the backend module loads only when this code path actually runs.
  try {
    const { getBackend } = await import('./backend');
    const { loadSession } = await import('./backend/cloudSession');
    const backend = getBackend();
    if (!backend.isOnline() || !backend.postPuzzle) return;
    const session = loadSession();
    if (!session.token) return;
    await backend.postPuzzle(session.token, {
      fen: p.fen,
      category: p.category,
      solution: p.solution,
      toMove: p.toMove,
      rating: p.rating,
      prompt: p.prompt,
      themes: p.themes,
    });
  } catch {
    // Swallowed — sharing failure shouldn't disrupt the author's
    // local save. They can re-publish later by re-saving.
  }
}

export function deleteUserPuzzle(id: string): void {
  const current = loadUserPuzzles();
  store.save({ puzzles: current.filter((p) => p.id !== id) });
}

/** Stable id factory — exported so callers don't reinvent the format. */
export function newUserPuzzleId(): string {
  return `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
