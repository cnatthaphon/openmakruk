// Central versioned-storage contract.
//
// Every persistent piece of user state goes through `defineStore` —
// callers do not touch localStorage directly. Adding a new field to
// any stored shape becomes a one-line `version` bump + a `migrate`
// case; users with the previous shape on disk are upgraded on next
// read, so we never have to ship a destructive "wipe local data"
// release after deploy.
//
// On-disk shape: `{ "v": N, "d": <data> }`. Legacy entries written
// before this module existed are raw JSON (no wrapper); the loader
// treats them as version 0 and runs the migrate function once. From
// the next save onward they are stored in the wrapped form.

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
  /** localStorage key. Convention: `openmakruk_<thing>`. */
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

  function load(): T {
    const raw = safeRead(def.key);
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
    safeWrite(def.key, JSON.stringify(wrapped));
  }

  function clear(): void {
    safeRemove(def.key);
  }

  function storedVersion(): number | null {
    const raw = safeRead(def.key);
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
