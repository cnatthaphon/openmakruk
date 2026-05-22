// Engine registry — small singleton that holds the set of available
// engine implementations and which one is currently active. The Play /
// Analyze / Review code paths all funnel through `getActiveEngine()`
// rather than importing a concrete engine module.
//
// Engines self-register by importing their module (the side-effect
// `registerEngine(...)` at the bottom of fairyStockfish.ts is what
// makes it available). To add a new engine, drop a file under
// engines/, register it the same way, and the rest of the app
// reaches it through this same registry — no caller code changes.

import type { EngineDescriptor, MakrukEngine } from './types';
import { log } from '../log';

const descriptors = new Map<string, EngineDescriptor>();
let activeId: string | null = null;
let activeInstance: MakrukEngine | null = null;
let initPromise: Promise<MakrukEngine> | null = null;

/**
 * Register an engine implementation. The first engine registered becomes
 * the default active engine. Idempotent — re-registering the same id
 * replaces the prior descriptor (useful for HMR in dev).
 */
export function registerEngine(d: EngineDescriptor): void {
  descriptors.set(d.id, d);
  if (!activeId) activeId = d.id;
  log('engineRegistry.register', { id: d.id, name: d.name });
}

/** List all registered engines for UI dropdowns. */
export function listEngines(): Array<{ id: string; name: string }> {
  return Array.from(descriptors.values()).map((d) => ({ id: d.id, name: d.name }));
}

/** Id of the currently active engine, or null before any registration. */
export function getActiveEngineId(): string | null {
  return activeId;
}

/**
 * Swap to a different engine. Tears down the previous instance first so
 * memory/workers are released. Subsequent `getActiveEngine()` will
 * lazily init the new one.
 */
export async function setActiveEngine(id: string): Promise<void> {
  if (!descriptors.has(id)) {
    throw new Error(`engineRegistry: unknown engine "${id}"`);
  }
  if (activeId === id && activeInstance) return;

  if (activeInstance) {
    log('engineRegistry.destroy', { id: activeId });
    try {
      await activeInstance.destroy();
    } catch (err) {
      log('engineRegistry.destroy.error', { id: activeId, error: String(err) });
    }
  }
  activeInstance = null;
  initPromise = null;
  activeId = id;
  log('engineRegistry.setActive', { id });
}

/**
 * Returns the active engine, initializing it on first call. Subsequent
 * calls return the same instance until `setActiveEngine()` swaps.
 */
export function getActiveEngine(): Promise<MakrukEngine> {
  if (!activeId) {
    return Promise.reject(new Error('engineRegistry: no engine registered'));
  }
  if (initPromise) return initPromise;

  const d = descriptors.get(activeId);
  if (!d) {
    return Promise.reject(new Error(`engineRegistry: descriptor missing for "${activeId}"`));
  }

  initPromise = (async () => {
    log('engineRegistry.init.start', { id: d.id });
    const instance = d.factory();
    await instance.init();
    activeInstance = instance;
    log('engineRegistry.init.done', { id: d.id });
    return instance;
  })();
  return initPromise;
}

/**
 * Synchronous accessor for the active engine instance. Returns null if
 * the engine hasn't finished `init()` yet. Used by code paths that must
 * stay sync (e.g. React render checking `isNetworkLoaded()`).
 */
export function getActiveEngineSync(): MakrukEngine | null {
  return activeInstance;
}
