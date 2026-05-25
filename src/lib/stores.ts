// Central versioned-storage contract.
//
// Every persistent piece of user state goes through `defineStore` —
// callers do not touch localStorage / IndexedDB directly. Adding a new
// field to any stored shape becomes a one-line `version` bump + a
// `migrate` case; users with the previous shape on disk are upgraded
// on next read, so we never have to ship a destructive "wipe local
// data" release after deploy.
//
// On-disk shape: `{ "v": N, "d": <data> }` — same envelope regardless
// of backend (localStorage or IndexedDB). Legacy entries written
// before this module existed are raw JSON (no wrapper); the loader
// treats them as version 0 and runs the migrate function once. From
// the next save onward they are stored in the wrapped form.
//
// Two backends:
//   - 'local'   — localStorage (default). Sync read/write. 5MB quota
//                 hard limit. Suitable for small predictable shapes:
//                 settings, flags, session tokens.
//   - 'durable' — IndexedDB. Sync API preserved via boot-time
//                 hydration into an in-memory cache; writes flush to
//                 IDB asynchronously. Suitable for unbounded
//                 user-generated data: game history, position library,
//                 analyses. NO 5MB ceiling.
//
// Callers writing `storage: 'durable'` MUST also ensure the store is
// hydrated before any synchronous load(). The hydrateDurableStores()
// helper handles this — call it once during app boot. If a durable
// store's load() runs before hydration, it falls back to default()
// (silently, no error) — that's how we keep the API sync-friendly.

const WRAPPER_KEY_VERSION = 'v';
const WRAPPER_KEY_DATA = 'd';

type Wrapped<T> = { [WRAPPER_KEY_VERSION]: number; [WRAPPER_KEY_DATA]: T };

function isWrapped(x: unknown): x is Wrapped<unknown> {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as Record<string, unknown>)[WRAPPER_KEY_VERSION] === 'number' &&
    WRAPPER_KEY_DATA in (x as Record<string, unknown>)
  );
}

export type StoreDef<T> = {
  /** Storage key. Convention: `openmakruk_<thing>`. */
  key: string;
  /**
   * Current schema version (>= 1). Bump every time the on-disk shape
   * for `T` changes (added/removed/renamed field, type change, etc.).
   */
  version: number;
  /** Factory for a brand-new, empty value. Called when no record exists
   *  or when a corrupt one cannot be salvaged. */
  default: () => T;
  /**
   * Upgrade `raw` (whatever JSON.parse produced) from `fromVersion` to
   * the current `version`. Receives the *unwrapped* data; the wrapper
   * envelope is stripped before this is called. `fromVersion === 0`
   * means "legacy unwrapped data written before stores.ts existed".
   *
   * Implementations should be defensive: merge with default() so newly
   * added fields get sane values, drop fields no longer in the shape,
   * and return a fully-formed `T`.
   */
  migrate: (raw: unknown, fromVersion: number) => T;
  /**
   * Backend selector.
   *   'local'   — localStorage (default). 5MB quota. Sync.
   *   'durable' — IndexedDB. Unbounded. Boot-time hydration required.
   * If switching an existing 'local' store to 'durable', the first
   * boot will copy the existing localStorage entry into IDB and then
   * leave localStorage alone (read-only fallback for downgrades).
   */
  storage?: 'local' | 'durable';
};

export type StoreHandle<T> = {
  /** Load + auto-migrate. Always returns a valid `T`. */
  load: () => T;
  /** Persist as `{ v, d }`. */
  save: (data: T) => void;
  /** Wipe the entry entirely. */
  clear: () => void;
  /** Read the stored version (or null if absent). Useful for diagnostics. */
  storedVersion: () => number | null;
  /** Schema key, exposed for tests / diagnostics. */
  readonly key: string;
  /** Current version, exposed for tests / diagnostics. */
  readonly version: number;
};

// ───────────────────────────────────────────────────────────────────
// IndexedDB backend — durable storage with sync facade.
// ───────────────────────────────────────────────────────────────────
//
// We model IDB as a single object store `kv` keyed by the store key.
// Boot-time hydration loads everything into memory; subsequent reads
// hit memory; writes go to memory + fire-and-forget IDB transaction.
// Lost-write window on tab close ≈ 1 IDB transaction (~10ms) — tiny
// compared to the localStorage equivalent (no window at all, but a
// hard 5MB quota that fails silently on overflow).
//
// We deliberately do NOT expose async load/save on the public API.
// Mixing sync + async store reads everywhere would force every caller
// to become async, which is a much bigger refactor than the benefit
// of fresh data. Stale-by-one-tab-second is acceptable.

const IDB_NAME = 'openmakruk-stores';
const IDB_VERSION = 1;
const IDB_OBJECT_STORE = 'kv';

const durableCache = new Map<string, string>();
const durableHydrated = new Set<string>();

let idbOpenPromise: Promise<IDBDatabase | null> | null = null;

function openIDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (idbOpenPromise) return idbOpenPromise;
  idbOpenPromise = new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(IDB_NAME, IDB_VERSION);
    } catch {
      // private mode / disabled storage — falls back to memory-only
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_OBJECT_STORE)) {
        db.createObjectStore(IDB_OBJECT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return idbOpenPromise;
}

/** Pull a single key from IDB into the durable cache. */
async function hydrateKey(key: string): Promise<void> {
  if (durableHydrated.has(key)) return;
  const db = await openIDB();
  if (!db) {
    // No IDB available — leave cache empty; loads will return default.
    // We DO mark hydrated so we don't keep retrying.
    durableHydrated.add(key);
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_OBJECT_STORE, 'readonly');
    const store = tx.objectStore(IDB_OBJECT_STORE);
    const req = store.get(key);
    req.onsuccess = () => {
      const value = req.result;
      if (typeof value === 'string') durableCache.set(key, value);
      durableHydrated.add(key);
      resolve();
    };
    req.onerror = () => {
      durableHydrated.add(key);
      resolve();
    };
  });
  // Migration path: if IDB is empty for this key but localStorage has
  // a value (because the store used to be 'local' before being
  // upgraded to 'durable'), copy it across. The localStorage entry
  // stays as a downgrade-safe shadow.
  if (!durableCache.has(key)) {
    const fromLocal = safeRead(key);
    if (fromLocal !== null) {
      durableCache.set(key, fromLocal);
      // Persist to IDB immediately so next boot is consistent.
      void durableWriteAsync(key, fromLocal);
    }
  }
}

/** Write a key to IDB. Fire-and-forget; errors logged but not thrown
 *  (write failures shouldn't break the calling code path). */
async function durableWriteAsync(key: string, value: string): Promise<void> {
  const db = await openIDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_OBJECT_STORE, 'readwrite');
      tx.objectStore(IDB_OBJECT_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn('durable.write.failed', { key });
        resolve();
      };
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function durableRemoveAsync(key: string): Promise<void> {
  const db = await openIDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_OBJECT_STORE, 'readwrite');
      tx.objectStore(IDB_OBJECT_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Hydrate every durable store registered so far. Call ONCE from app
 *  boot (before first render of any component that reads stores).
 *  Idempotent — subsequent calls are no-ops once the cache is filled. */
const pendingDurableKeys = new Set<string>();
export async function hydrateDurableStores(): Promise<void> {
  const keys = Array.from(pendingDurableKeys);
  await Promise.all(keys.map(hydrateKey));
}

function safeRead(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // quota / private mode — silently ignore. Callers tolerate the
    // memory-only fallback (next reload starts from default()).
  }
}

function safeRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function defineStore<T>(def: StoreDef<T>): StoreHandle<T> {
  if (def.version < 1) {
    throw new Error(
      `defineStore(${def.key}): version must be >= 1, got ${def.version}`,
    );
  }
  const backend = def.storage ?? 'local';
  if (backend === 'durable') {
    pendingDurableKeys.add(def.key);
    // Late-registered durable stores (e.g. one defined in a lazy
    // route chunk that loads AFTER main.tsx's hydrateDurableStores()
    // already ran) need to hydrate themselves. Fire-and-forget; the
    // store falls back to default() until the read completes, then
    // becomes consistent on next render. Acceptable because lazy
    // routes are user-initiated (tab navigation), not on cold path.
    void hydrateKey(def.key);
  }

  /** Read raw string from the active backend. For durable stores this
   *  hits the in-memory cache populated by hydrateDurableStores(); if
   *  hydration hasn't run yet, returns null (caller falls back to
   *  default), which is preferable to crashing the page. */
  function readRaw(): string | null {
    if (backend === 'durable') {
      if (durableCache.has(def.key)) return durableCache.get(def.key) ?? null;
      // Pre-hydration call — fall through to localStorage shadow so
      // a "local → durable" upgrade still sees prior data on first
      // render before hydration completes.
      return safeRead(def.key);
    }
    return safeRead(def.key);
  }

  function writeRaw(value: string): void {
    if (backend === 'durable') {
      durableCache.set(def.key, value);
      // Mirror to localStorage too, capped at quota — gives us a
      // downgrade-safe shadow without changing semantics. If the
      // shadow write fails (over quota), the durable copy is still
      // canonical.
      safeWrite(def.key, value);
      void durableWriteAsync(def.key, value);
      return;
    }
    safeWrite(def.key, value);
  }

  function removeRaw(): void {
    if (backend === 'durable') {
      durableCache.delete(def.key);
      safeRemove(def.key);
      void durableRemoveAsync(def.key);
      return;
    }
    safeRemove(def.key);
  }

  function load(): T {
    const raw = readRaw();
    if (raw === null) return def.default();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return def.default();
    }
    let fromVersion: number;
    let payload: unknown;
    if (isWrapped(parsed)) {
      fromVersion = parsed[WRAPPER_KEY_VERSION];
      payload = parsed[WRAPPER_KEY_DATA];
    } else {
      // Legacy unwrapped data: treat the whole blob as v0 payload.
      fromVersion = 0;
      payload = parsed;
    }
    if (fromVersion === def.version) {
      // Already current. Still let migrate normalize in case fields
      // were added with sane defaults — it's idempotent by contract.
      try {
        return def.migrate(payload, fromVersion);
      } catch {
        return def.default();
      }
    }
    try {
      return def.migrate(payload, fromVersion);
    } catch {
      // Bad data; fall back to default rather than crash.
      return def.default();
    }
  }

  function save(data: T): void {
    const wrapped: Wrapped<T> = {
      [WRAPPER_KEY_VERSION]: def.version,
      [WRAPPER_KEY_DATA]: data,
    } as Wrapped<T>;
    writeRaw(JSON.stringify(wrapped));
  }

  function clear(): void {
    removeRaw();
  }

  function storedVersion(): number | null {
    const raw = readRaw();
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      if (isWrapped(parsed)) return parsed[WRAPPER_KEY_VERSION];
      return 0; // legacy
    } catch {
      return null;
    }
  }

  return {
    load,
    save,
    clear,
    storedVersion,
    get key() { return def.key; },
    get version() { return def.version; },
  };
}

// ----------------------------------------------------------------------
// Small flag helpers
// ----------------------------------------------------------------------
//
// Some bits of state are transient single-purpose flags ('1' / absent),
// not full schemas — e.g. "auto-analyze on next Play mount". They don't
// need wrapper/migration; expose tiny helpers so callers still don't
// touch localStorage directly.

export type FlagHandle = {
  read: () => boolean;
  set: (on: boolean) => void;
  clear: () => void;
  readonly key: string;
};

export function defineFlag(key: string): FlagHandle {
  return {
    key,
    read() { return safeRead(key) === '1'; },
    set(on: boolean) {
      if (on) safeWrite(key, '1');
      else safeRemove(key);
    },
    clear() { safeRemove(key); },
  };
}
