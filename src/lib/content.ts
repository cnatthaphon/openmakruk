// Content loader for lessons + puzzles.
//
// All content lives as static JSON in /public/content/ — bundled with
// the site for v0, but the loader goes through a manifest indirection
// so we can flip to a CDN-pinned content URL (jsDelivr, R2, etc.)
// later without touching any page code.
//
// Pattern:
//   1. App calls loadLessons() / loadPuzzles()
//   2. Loader fetches /content/manifest.json (once, cached in memory)
//   3. Manifest tells us where the actual content lives + version
//   4. Loader fetches that URL, parses JSON, caches the promise
//   5. Subsequent calls reuse the cached promise — no network re-hit
//
// Future Phase 9: extend with IndexedDB persistence + version-diff
// check on app start so users get fresh content without a full reload.

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
const contentCache = new Map<string, Promise<unknown>>();

export function loadManifest(): Promise<ContentManifest> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(MANIFEST_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`);
      return r.json() as Promise<ContentManifest>;
    })
    .catch((err) => {
      // Clear the cached failure so a retry has a chance
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
  const cached = contentCache.get(key);
  if (cached) return cached as Promise<T>;
  const promise = loadManifest()
    .then((manifest) => fetch(manifest[key].url))
    .then((r) => {
      if (!r.ok) throw new Error(`${key} fetch failed: ${r.status}`);
      return r.json() as Promise<T>;
    })
    .catch((err) => {
      contentCache.delete(key);
      throw err;
    });
  contentCache.set(key, promise);
  return promise;
}

/** For dev: clears in-memory caches so the next load hits the network. */
export function resetContentCache(): void {
  manifestPromise = null;
  contentCache.clear();
}
