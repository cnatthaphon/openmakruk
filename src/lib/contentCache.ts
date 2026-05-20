// IndexedDB cache for static content (lessons, puzzles, openings).
//
// Why IndexedDB and not just HTTP cache?
//   1. We control invalidation precisely (per-key version field in the
//      manifest), so users get fresh content the moment a new version
//      ships — no need to wait for browser HTTP cache to expire.
//   2. Survives reloads when offline (future PWA scope).
//   3. Larger storage budget than localStorage.
//
// API: getCached<T>(key) returns { version, data } or null.
// putCached(key, version, data) stores it. Both fail silently if IDB
// is disabled (e.g. private browsing) — callers always have the
// network fallback path.

const DB_NAME = 'openmakruk-content';
const DB_VERSION = 1;
const STORE = 'content';

type CachedRecord<T> = {
  version: number;
  data: T;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
  return dbPromise;
}

export async function getCached<T>(key: string): Promise<CachedRecord<T> | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<CachedRecord<T> | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putCached<T>(
  key: string,
  version: number,
  data: T,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ version, data }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Drop every record — used by dev tools / reset flows. */
export async function clearContentCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
