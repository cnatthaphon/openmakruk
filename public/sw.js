// OpenMakruk service worker.
//
// Strategy (revised after a stale-HTML production incident, 2026-05-27):
//
//   1. HTML navigation routes ('/', '/index.html', any hash-route URL)
//      → NETWORK-FIRST. The HTML embeds Vite's hashed chunk filenames
//      (e.g. <script src="/assets/index-XXX.js">) — when a new build
//      deploys, every chunk hash changes. If we cache-first the HTML,
//      a returning user sees old HTML that points at chunks that 404'd
//      out of existence in the latest deploy → MIME-blocked module
//      fetch → broken Profile tab. Network-first means a new deploy
//      shows up on the user's next navigation without a hard reload.
//
//   2. /assets/<hashed-filename> + /pieces/ + /piece-sets/ + WASM
//      → CACHE-FIRST. These are content-hashed and immutable. Once
//      cached, they're correct forever. A different hash = a different
//      URL = a different cache entry, so this can never serve stale.
//
//   3. /content/*.json (lessons, puzzles, manifest)
//      → NETWORK-FIRST with cache fallback. Lets us push new puzzles
//      without a code deploy and have them show up immediately online,
//      while still working offline.
//
//   4. Cross-origin (jsDelivr NNUE blob) — skip. The engine has its
//      own IndexedDB cache for the network weights file.
//
// Bumping CACHE_VERSION below evicts the old caches on next activate.
// Bump whenever the caching strategy changes (NOT every deploy — chunk
// hashes already partition the cache namespace).

const CACHE_VERSION = 'openmakruk-v2';

// App-shell entries we pre-cache on install. Keep this list short —
// it's prefetched on first SW install and slows the first paint. The
// hashed chunks are NOT pre-cached; they're cached on first runtime
// fetch instead, so a new build doesn't bloat the install step.
const APP_SHELL = ['/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // Some assets may 404 in dev — non-fatal, runtime cache catches them.
    }),
  );
  // skipWaiting + clients.claim below means a new SW activates without
  // waiting for tabs to close. Combined with network-first HTML this
  // means a deploy reaches users in one navigation, not two.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('openmakruk-') && k !== CACHE_VERSION)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Skip cross-origin (jsDelivr for NNUE) — let the page handle it.
  if (url.origin !== self.location.origin) return;

  // HTML navigation → network-first. `mode === 'navigate'` is the
  // outer document fetch (address bar, link click, refresh) — exactly
  // what serves index.html in our SPA. This is the critical case: if
  // we cache-first this, a stale index references chunk hashes that
  // 404'd out in the latest deploy and Profile/etc fail to load.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  // Also catch explicit text/html requests just in case (rare; some
  // crawlers / share-preview bots request '/' directly without
  // mode === 'navigate').
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Content JSON — network-first so puzzle/lesson updates land
  // immediately online and still work offline via cache fallback.
  if (url.pathname.startsWith('/content/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Hashed assets + WASM + piece SVGs — cache-first. Safe because
  // every change to the underlying content changes the URL (Vite's
  // content-hashing). Anything cached is by definition correct.
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline + not cached. Last-resort fallback to / for navigation.
    if (request.mode === 'navigate') {
      const shell = await caches.match('/');
      if (shell) return shell;
    }
    throw err;
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}
