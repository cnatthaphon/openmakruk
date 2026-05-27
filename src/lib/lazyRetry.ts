// React.lazy + retry-on-stale-chunk wrapper.
//
// The problem: every Pages deploy produces fresh chunk hashes (e.g.
// ProfilePage-DPz89tMz.js → ProfilePage-CXmnUwxm.js). When a user has
// the *old* index.html cached in a long-lived tab and the new deploy
// invalidates the old chunk, clicking on a still-lazy-loaded page
// (e.g. Profile) calls `import('./pages/ProfilePage')` which resolves
// to the OLD URL → 404 → Cloudflare Pages SPA fallback returns HTML →
// browser refuses to execute (MIME=text/html, expected JS).
//
// Vanilla `lazy(() => import(...))` surfaces this as a hard crash
// inside ErrorBoundary. The fix: on first failure, force a full page
// reload — that fetches fresh index.html with the new chunk hashes,
// and the user lands on the same hash route they were on so the only
// observable cost is a sub-second flash.
//
// Two-layer resilience:
//   1. Import-level retry with backoff. A deploy-transition window can
//      briefly 404 a chunk that still exists (edge node mid-swap). A
//      couple of retries over ~1s ride that out WITHOUT a jarring reload.
//   2. One-shot reload as last resort. When the chunk is genuinely
//      replaced (old hash gone after deploy), retrying the same URL can
//      never succeed — only reloading fetches a fresh index.html with
//      new chunk URLs. After reload, layer-1 retries run again on the
//      fresh bundle.
//
// Loop guard is TIMESTAMP-based, not boolean: we store the reload time.
// A fresh failure within RELOAD_WINDOW_MS of a reload means "we already
// reloaded and STILL can't load it" → genuine breakage → surface to
// ErrorBoundary. Outside the window (e.g. a new deploy days later) the
// guard has naturally expired and a fresh reload is allowed. This fixes
// the previous bug where clearing the flag on every boot (which happens
// ~1s after the reload) defeated the guard entirely.

const RELOAD_FLAG = 'openmakruk_chunk_reload_at';
const RELOAD_WINDOW_MS = 15_000;
const IMPORT_RETRIES = 2;

function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk')
  );
}

/** Wrap a dynamic import factory so a stale-chunk error first retries the
 *  import a few times (transient edge blip), then falls back to a one-
 *  shot reload (genuinely replaced chunk), and only surfaces to the
 *  ErrorBoundary if even a post-reload retry fails. */
export function lazyRetry<T>(factory: () => Promise<T>): () => Promise<T> {
  return async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= IMPORT_RETRIES; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastErr = err;
        if (!isStaleChunkError(err)) throw err;
        if (attempt < IMPORT_RETRIES) {
          // Backoff: 350ms, 700ms — ~1s total covers most edge-swap blips.
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        }
      }
    }

    if (typeof window === 'undefined') throw lastErr;

    const reloadedAt = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
    const recentlyReloaded = reloadedAt > 0 && Date.now() - reloadedAt < RELOAD_WINDOW_MS;
    if (recentlyReloaded) {
      // Already reloaded moments ago and retries STILL fail → genuine
      // breakage (server/network), not a stale chunk. Surface it.
      throw lastErr;
    }

    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    // Recovery sequence — go from cleanest to most aggressive:
    //   1. Unregister every service-worker registration so a stale
    //      cache-first SW can't intercept the reload.
    //   2. Delete all CacheStorage entries owned by this origin so
    //      even runtime-cached HTML can't serve.
    //   3. Reload — at this point the browser has no SW + no cache,
    //      so it MUST hit the network and get fresh index.html with
    //      fresh chunk hashes. The hash route is preserved across
    //      reload so the user lands back where they were going.
    //
    // This belt-and-braces sequence exists because the previous code
    // path (reload only) didn't help users stuck on an older SW
    // version that was still cache-first for HTML — the reload re-
    // served the same stale HTML and the chunk error came right back.
    //
    // Promise never resolves; the navigation in step 3 takes over.
    await purgeServiceWorkerAndCaches();
    window.location.reload();
    return new Promise<T>(() => undefined);
  };
}

/** Best-effort: unregister all SWs and wipe all caches. Errors are
 *  swallowed because we're already in the reload path — surfacing a
 *  cleanup error would block the recovery we want to succeed. */
async function purgeServiceWorkerAndCaches(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* ignore — cleanup is best-effort */
  }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* ignore */
  }
}
