// Tiny structured logger for OpenMakruk.
//
// Two goals:
//   1. Debug visibility — every meaningful state transition shows up in
//      the browser console with a uniform "[OpenMakruk] step: data" line
//      and timing info, so when something gets stuck we can see exactly
//      where.
//   2. Data collection foundation — each call also pushes an event onto
//      an in-memory ring buffer. Later (v0.2 game-donation flow) we'll
//      flush relevant subsets to localStorage / KV for puzzle mining.
//
// To silence in production builds, set `localStorage.openmakruk_log = 'off'`.
// To inspect captured events: `window.__openmakrukLog.events`.

const MAX_EVENTS = 1000;

export type LogEvent = {
  t: number;            // unix ms timestamp
  step: string;         // short event name
  data?: unknown;       // structured payload
  durationMs?: number;  // optional duration since matching "start"
};

const events: LogEvent[] = [];
const timers = new Map<string, number>();

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('openmakruk_log') !== 'off';
  } catch {
    return true;
  }
}

function push(ev: LogEvent) {
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();
}

export function log(step: string, data?: unknown): void {
  const ev: LogEvent = { t: Date.now(), step, data };
  push(ev);
  if (isEnabled()) {
    // eslint-disable-next-line no-console
    console.log(`%c[OpenMakruk] ${step}`, 'color:#d4a23c', data ?? '');
  }
}

/** Start a named timer; pair with `timeEnd(name, ...)` to log duration. */
export function timeStart(name: string): void {
  timers.set(name, performance.now());
}

/** End a named timer and log duration alongside any extra payload. */
export function timeEnd(name: string, data?: unknown): number {
  const startedAt = timers.get(name);
  timers.delete(name);
  const durationMs = startedAt ? performance.now() - startedAt : 0;
  const ev: LogEvent = { t: Date.now(), step: name, data, durationMs };
  push(ev);
  if (isEnabled()) {
    // eslint-disable-next-line no-console
    console.log(
      `%c[OpenMakruk] ${name} %c(${durationMs.toFixed(0)}ms)`,
      'color:#d4a23c',
      'color:#888',
      data ?? '',
    );
  }
  return durationMs;
}

if (typeof window !== 'undefined') {
  // Expose for ad-hoc inspection in DevTools console.
  (window as unknown as { __openmakrukLog: { events: LogEvent[] } }).__openmakrukLog = {
    events,
  };
}
