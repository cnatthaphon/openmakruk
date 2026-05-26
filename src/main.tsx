import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { hydrateDurableStores } from './lib/stores';
import { setBackend } from './lib/backend';
import { cloudflareBackend } from './lib/backend/cloudflareBackend';
import { clearChunkReloadFlag } from './lib/lazyRetry';
import './App.css';

// Clear the stale-chunk reload-once flag now that the app is loading
// successfully — the next time a deploy invalidates chunks (weeks
// from now), we get a fresh single retry instead of skipping straight
// to "give up". Safe to call repeatedly.
clearChunkReloadFlag();

// Register the Cloudflare adapter as the active backend at boot —
// BEFORE any UI mounts. Public-read endpoints (Bot Hall of Fame,
// Tournaments, Activity Signals, leaderboards) work without a bearer
// token, so anonymous visitors see them too. The token is attached
// separately by enableCloud() when the user opts in to sync.
//
// NoOpBackend stays as the test default and as the fallback when the
// adapter is explicitly disabled.
setBackend(cloudflareBackend);

// Hydrate durable (IndexedDB-backed) stores BEFORE React mounts so
// every component's first render sees real data, not the default()
// fallback. This is intentionally a sequential await — the IDB read
// is fast (low tens of ms typical) and the alternative ("render
// empty, hydrate, re-render") leaks defaults through to UI logic
// like recommendedLevel which would mis-classify a returning user
// as a beginner.
async function boot(): Promise<void> {
  try {
    await hydrateDurableStores();
  } catch (err) {
    // Hydration failure is non-fatal — durable callers will see
    // default() values, which is the same situation as a fresh user.
    console.warn('store.hydration.failed', err);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary scope="root">
        <ToastProvider>
          <App />
        </ToastProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void boot();
