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
// Loop guard: we set a sessionStorage flag before reloading. If the
// reload happens and the *new* bundle ALSO fails to load (genuine
// network issue, hard server problem), we don't loop — the second
// failure bubbles to the ErrorBoundary and the user sees the normal
// error UI.

const RELOAD_FLAG = 'openmakruk_chunk_reload';

function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk')
  );
}

/** Wrap a dynamic import factory so a stale-chunk error triggers a
 *  one-shot page reload instead of crashing the ErrorBoundary. */
export function lazyRetry<T>(factory: () => Promise<T>): () => Promise<T> {
  return () =>
    factory().catch((err) => {
      if (!isStaleChunkError(err)) throw err;
      if (typeof window === 'undefined') throw err;
      const alreadyReloaded =
        sessionStorage.getItem(RELOAD_FLAG) === '1';
      if (alreadyReloaded) {
        // We already reloaded once this session — the bundle is
        // genuinely broken, not stale. Surface the error.
        throw err;
      }
      sessionStorage.setItem(RELOAD_FLAG, '1');
      // Reload preserves the hash route so the user lands back where
      // they were trying to go. Promise never resolves — navigation
      // takes over.
      window.location.reload();
      return new Promise<T>(() => undefined);
    });
}

/** Clear the reload flag once the app has successfully booted. Called
 *  from App.tsx after the first successful render so the next stale-
 *  chunk encounter (potentially weeks later) gets a fresh retry. */
export function clearChunkReloadFlag(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(RELOAD_FLAG);
}
