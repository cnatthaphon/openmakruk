// Saved Positions — the user's personal collection.
//
// Positions can be created from anywhere (Custom editor, Play tab
// after a game, Analysis panel) and replayed/studied later. Stored
// in localStorage via the versioned stores module; capped at
// MAX_ENTRIES so quota stays healthy.
//
// IDs are stable random strings so multiple positions can be edited
// or shared via URL.

import { defineStore } from './stores';

const LIBRARY_VERSION = 1;
const MAX_ENTRIES = 200;

export type SavedPosition = {
  id: string;
  fen: string;
  title: string;
  note: string;
  tags: string[];
  createdAt: number;
  source: 'custom' | 'play' | 'puzzle' | 'analysis';
};

const store = defineStore<SavedPosition[]>({
  key: 'openmakruk_library',
  version: LIBRARY_VERSION,
  default: () => [],
  migrate: (raw) => {
    if (!Array.isArray(raw)) return [];
    // Defensive: drop entries missing required fields rather than
    // crash the Library page.
    return (raw as unknown[]).filter(
      (e): e is SavedPosition =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as SavedPosition).id === 'string' &&
        typeof (e as SavedPosition).fen === 'string',
    ).map((e) => ({
      id: e.id,
      fen: e.fen,
      title: typeof e.title === 'string' ? e.title : '',
      note: typeof e.note === 'string' ? e.note : '',
      tags: Array.isArray(e.tags) ? e.tags.filter((t) => typeof t === 'string') : [],
      createdAt: typeof e.createdAt === 'number' ? e.createdAt : Date.now(),
      source: ['custom', 'play', 'puzzle', 'analysis'].includes(e.source)
        ? e.source
        : 'custom',
    }));
  },
});

export function loadLibrary(): SavedPosition[] {
  return store.load();
}

function persist(library: SavedPosition[]): void {
  store.save(library);
}

export function savePosition(
  draft: Omit<SavedPosition, 'id' | 'createdAt'>,
): SavedPosition {
  const lib = loadLibrary();
  const entry: SavedPosition = {
    ...draft,
    id: `pos_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  // Newest first; cap to MAX_ENTRIES to prevent unbounded growth.
  const next = [entry, ...lib].slice(0, MAX_ENTRIES);
  persist(next);
  return entry;
}

export function removePosition(id: string): void {
  const lib = loadLibrary();
  persist(lib.filter((p) => p.id !== id));
}

export function findPosition(id: string): SavedPosition | null {
  return loadLibrary().find((p) => p.id === id) ?? null;
}

export function updatePosition(
  id: string,
  patch: Partial<Pick<SavedPosition, 'title' | 'note' | 'tags'>>,
): SavedPosition | null {
  const lib = loadLibrary();
  const idx = lib.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated = { ...lib[idx], ...patch };
  lib[idx] = updated;
  persist(lib);
  return updated;
}

/** All unique tags across the library — for filter dropdowns etc. */
export function allTags(): string[] {
  const set = new Set<string>();
  for (const p of loadLibrary()) {
    for (const t of p.tags) set.add(t);
  }
  return Array.from(set).sort();
}
