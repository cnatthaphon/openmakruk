// Saved Positions — the user's personal collection.
//
// Positions can be created from anywhere (Custom editor, Play tab
// after a game, Analysis panel) and replayed/studied later. Stored
// in localStorage; capped at 200 entries to keep the quota healthy.
//
// IDs are stable random strings so multiple positions can be edited
// or shared via URL.

const STORAGE_KEY = 'openmakruk_library';
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

export function loadLibrary(): SavedPosition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPosition[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(library: SavedPosition[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch {
    // quota / disabled — silently ignore
  }
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
