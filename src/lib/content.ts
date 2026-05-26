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
import type {
  Annotation,
  EndgameStudy,
  MasterGame,
  Opening,
  TacticTheme,
} from './extraContentSchema';

export type ContentManifest = {
  schemaVersion: number;
  generatedAt: string;
  lessons: ManifestEntry;
  puzzles: ManifestEntry;
  openings?: ManifestEntry;
  endgames?: ManifestEntry;
  tacticsThemes?: ManifestEntry;
  annotations?: ManifestEntry;
  masterGames?: ManifestEntry;
};

export type ManifestEntry = {
  version: number;
  url: string;
  count: number;
};

export type ContentKey =
  | 'lessons'
  | 'puzzles'
  | 'openings'
  | 'endgames'
  | 'tacticsThemes'
  | 'annotations'
  | 'masterGames';

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

export function loadOpenings(): Promise<Opening[]> {
  return fetchFromManifest<Opening[]>('openings');
}

export function loadEndgames(): Promise<EndgameStudy[]> {
  return fetchFromManifest<EndgameStudy[]>('endgames');
}

export function loadTacticsThemes(): Promise<TacticTheme[]> {
  return fetchFromManifest<TacticTheme[]>('tacticsThemes');
}

export function loadAnnotations(): Promise<Annotation[]> {
  return fetchFromManifest<Annotation[]>('annotations');
}

export function loadMasterGames(): Promise<MasterGame[]> {
  return fetchFromManifest<MasterGame[]>('masterGames');
}

function fetchFromManifest<T>(key: ContentKey): Promise<T> {
  const cached = memoryCache.get(key);
  if (cached) return cached as Promise<T>;
  const promise = (async (): Promise<T> => {
    const manifest = await loadManifest();
    const entry = manifest[key];
    if (!entry) {
      // Older manifest without this key — return an empty list rather
      // than throwing so the UI can show a "no content yet" state.
      return [] as unknown as T;
    }
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
