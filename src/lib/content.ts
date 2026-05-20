// Content loader for lessons + puzzles.
//
// Three-tier fetch:
//   1. In-memory promise cache (per session) — instant on subsequent
//      calls within the same page load
//   2. IndexedDB persistent cache — instant on full-page reloads as
//      long as the manifest version still matches
//   3. Network fetch via the manifest URL — first time, or after a
//      content version bump
//
// On a version mismatch we evict the old IDB record and fetch fresh.
// All caches share the same key, so freshness propagates cleanly.

import { getCached, putCached } from './contentCache';
import type { LessonContent } from './lessonSchema';
import type { Puzzle } from './puzzleSchema';

export type ContentManifest = {
  schemaVersion: number;
  generatedAt: string;
  lessons: ManifestEntry;
  puzzles: ManifestEntry;
};

export type ManifestEntry = {
  version: number;
  url: string;
  count: number;
};

const MANIFEST_URL = '/content/manifest.json';

let manifestPromise: Promise<ContentManifest> | null = null;
const memoryCache = new Map<string, Promise<unknown>>();

export function loadManifest(): Promise<ContentManifest> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(MANIFEST_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`);
      return r.json() as Promise<ContentManifest>;
    })
    .catch((err) => {
      manifestPromise = null;
      throw err;
    });
  return manifestPromise;
}

export function loadLessons(): Promise<LessonContent[]> {
  return fetchFromManifest<LessonContent[]>('lessons');
}

export function loadPuzzles(): Promise<Puzzle[]> {
  return fetchFromManifest<Puzzle[]>('puzzles');
}

function fetchFromManifest<T>(key: 'lessons' | 'puzzles'): Promise<T> {
  const cached = memoryCache.get(key);
  if (cached) return cached as Promise<T>;
  const promise = (async (): Promise<T> => {
    const manifest = await loadManifest();
    const entry = manifest[key];
    // Tier 2: IDB cache by version
    const persisted = await getCached<T>(key);
    if (persisted && persisted.version === entry.version) {
      return persisted.data;
    }
    // Tier 3: network
    const r = await fetch(entry.url);
    if (!r.ok) throw new Error(`${key} fetch failed: ${r.status}`);
    const data = (await r.json()) as T;
    // Persist for next reload (non-blocking, failure is non-fatal)
    putCached(key, entry.version, data).catch(() => {});
    return data;
  })().catch((err) => {
    memoryCache.delete(key);
    throw err;
  });
  memoryCache.set(key, promise);
  return promise;
}

/** For dev tools — clear the in-memory cache so the next load re-hits IDB/network. */
export function resetContentCache(): void {
  manifestPromise = null;
  memoryCache.clear();
}
