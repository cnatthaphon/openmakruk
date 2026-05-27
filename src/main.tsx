import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { hydrateDurableStores } from './lib/stores';
import { setBackend } from './lib/backend';
import { cloudflareBackend } from './lib/backend/cloudflareBackend';
import './App.css';

// Note: the stale-chunk reload guard in lazyRetry.ts is now timestamp-
// based and self-expiring (15s window), so it no longer needs a boot-
// time clear. Clearing on boot was actively harmful — boot happens ~1s
// after a reload, so it wiped the guard and could loop / skip straight
// to the ErrorBoundary on the next chunk failure.

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
