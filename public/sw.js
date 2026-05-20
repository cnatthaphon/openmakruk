// OpenMakruk service worker.
//
// Strategy:
//   1. App shell (HTML/JS/CSS/icons/piece SVGs/Stockfish WASM/ffish WASM)
//      → cache-first. Stable assets, OK to serve from cache on first hit.
//   2. /content/*.json (lessons, puzzles, manifest)
//      → network-first with cache fallback. So content updates show up
//      as soon as the user is online, but offline users still see the
//      last-known content.
//   3. Engine searches go through the page's normal JS — the SW doesn't
//      try to intercept WebAssembly heap traffic.
//
// Bumping CACHE_VERSION below evicts the old caches on next activate.

const CACHE_VERSION = 'openmakruk-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // Some assets may 404 in dev — non-fatal, runtime cache catches them.
    }),
  );
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
  // Skip cross-origin (jsDelivr for NNUE) — let the page handle it. The
  // engine already has its own IndexedDB cache for the network blob.
  if (url.origin !== self.location.origin) return;

  // Content JSON — network-first
  if (url.pathname.startsWith('/content/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // App shell + everything else — cache-first
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
