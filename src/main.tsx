import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { hydrateDurableStores } from './lib/stores';
import './App.css';

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
