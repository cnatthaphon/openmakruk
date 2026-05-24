// Persistent on/off flags. These aren't full schemas — just one-bit
// preferences or transient hand-offs between pages. Wrapped here so
// callers never touch localStorage directly, which keeps the
// "no localStorage outside src/lib/*" invariant clean.

import { defineFlag } from './stores';

/** User wants NNUE auto-loaded on next Play tab mount. */
export const nnueAutoLoad = defineFlag('openmakruk_nnue');

/**
 * Set by Custom / Library pages to request that the Play tab kick
 * off an analyze run immediately on mount. Cleared by the Play tab
 * after firing so the next normal visit doesn't auto-analyze.
 */
export const autoAnalyze = defineFlag('openmakruk_auto_analyze');

/**
 * `false` here = the log module is silenced. Defaults to enabled
 * (helpful for triaging user bug reports); they can toggle off via
 * the dev menu / console.
 */
export const loggingEnabled = {
  read(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem('openmakruk_log') !== 'off';
    } catch {
      return true;
    }
  },
  set(on: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      if (on) window.localStorage.removeItem('openmakruk_log');
      else window.localStorage.setItem('openmakruk_log', 'off');
    } catch {
      // ignore
    }
  },
};
