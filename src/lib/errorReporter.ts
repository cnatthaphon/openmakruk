// Client crash reporter.
//
// Bridges three crash sources to the API worker's POST /api/errors sink:
//   1. React render crashes (ErrorBoundary.componentDidCatch)
//   2. Uncaught exceptions (window 'error')
//   3. Unhandled promise rejections (window 'unhandledrejection')
//
// Design constraints, in priority order:
//   - PRIVACY: no PII. We send the message, a truncated stack, the
//     build SHA, the UI locale, and a PAGE-LEVEL route ("/challenge",
//     not "/challenge/ABC123") — never query/hash params, never IP or
//     user-agent (the worker can't see those either; see migration
//     0010). Reports are anonymous (no token).
//   - DON'T MAKE THINGS WORSE: a failing report must never throw or
//     loop. The backend call is best-effort + swallowed; we also cap
//     reports per session and dedupe repeats so a render loop can't
//     spam the sink (or the network).
//   - OPT-OUT: honors the `errorReportingEnabled` flag (default on,
//     disclosed in About → Privacy).

import { getBackend } from './backend';
import { errorReportingEnabled } from './flags';
import { BUILD_SHA } from './release';
import { log } from './log';

const MAX_STACK_LINES = 12;
const MAX_COMPONENT_STACK_LINES = 8;
// Hard ceiling per page-load: a render loop firing the boundary over and
// over should produce a handful of reports, not hundreds.
const MAX_REPORTS_PER_SESSION = 10;
// Suppress an identical crash seen again within this window.
const DEDUPE_WINDOW_MS = 60_000;

let sent = 0;
const seen = new Map<string, number>();
let handlersInstalled = false;

type ReportInput = {
  scope?: string;
  message: string;
  stack?: string;
  componentStack?: string;
};

/** Page-level route only — e.g. "#/challenge/ABC123" → "/challenge".
 *  Drops the id segment + any query/hash params so we learn WHICH page
 *  crashed without persisting anything identifying. */
function currentRoute(): string {
  try {
    const hash = window.location.hash || '';
    const seg = hash.replace(/^#\/?/, '').split(/[/?#]/);
    return '/' + (seg[0] || '');
  } catch {
    return '/';
  }
}

function localeOf(): string {
  try {
    return navigator.language || 'unknown';
  } catch {
    return 'unknown';
  }
}

function truncate(text: string | undefined, maxLines: number): string | undefined {
  if (!text) return undefined;
  return text.split('\n').slice(0, maxLines).join('\n');
}

function fingerprint(scope: string, message: string, stack?: string): string {
  // scope + message + first stack frame is enough to collapse a loop
  // while still distinguishing genuinely different crashes.
  const frame = stack?.split('\n').find((l) => l.includes('at ')) ?? '';
  return `${scope}::${message}::${frame.trim()}`;
}

/**
 * Report a crash. Fire-and-forget: synchronous, never throws, returns
 * whether a report was actually queued (false = deduped / capped /
 * disabled — useful in tests).
 */
export function reportError(input: ReportInput): boolean {
  try {
    if (!errorReportingEnabled.read()) return false;
    if (sent >= MAX_REPORTS_PER_SESSION) return false;

    const scope = input.scope ?? 'unknown';
    const message = (input.message || 'unknown error').slice(0, 1000);
    const stack = truncate(input.stack, MAX_STACK_LINES);

    const fp = fingerprint(scope, message, stack);
    const now = Date.now();
    const last = seen.get(fp);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
    seen.set(fp, now);

    sent += 1;
    const backend = getBackend();
    // NoOpBackend (tests / offline-disabled) omits reportError → no-op.
    void backend.reportError?.({
      scope,
      message,
      stack,
      componentStack: truncate(input.componentStack, MAX_COMPONENT_STACK_LINES),
      buildSha: BUILD_SHA,
      locale: localeOf(),
      urlPath: currentRoute(),
    });
    return true;
  } catch {
    // The reporter itself must never throw.
    return false;
  }
}

/** Install window-level handlers for uncaught errors + rejections. Safe
 *  to call once at boot; repeated calls are ignored. */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled || typeof window === 'undefined') return;
  handlersInstalled = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    // Resource-load errors (img/script 404s) fire 'error' with no
    // `.error` and bubble here; they aren't crashes, so skip them.
    if (!event.error && !event.message) return;
    log('error.window_uncaught', { message: event.message });
    reportError({
      scope: 'window',
      message: event.error?.message ?? event.message ?? 'uncaught error',
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? 'unhandled rejection');
    log('error.unhandled_rejection', { message });
    reportError({
      scope: 'promise',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

/** Test-only: reset the session counters so each test starts clean. */
export function __resetErrorReporterForTests(): void {
  sent = 0;
  seen.clear();
}
