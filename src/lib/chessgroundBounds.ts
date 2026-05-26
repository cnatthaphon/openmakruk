// Wrapper around chessground's internal bounds-cache invalidation.
//
// Why this module exists:
// -----------------------
// chessground caches getBoundingClientRect() via a memo (`state.dom.
// bounds`) and only invalidates it when its internal ResizeObserver
// fires — which is on SIZE changes, NOT POSITION changes. A layout
// shift that moves the board on the page without resizing it (banner
// appearing/disappearing, sidebar reflow, page scroll) leaves the
// cache stale, and click hit-tests map to the wrong square. We've
// seen this manifest as "clicked Khon, but Met's legal moves appear"
// — pieces select 1 file/rank off from where the user clicked.
//
// chessground 9.x exposes no public method to force a re-measure.
// The only effective option is to clear the memo directly via
// `state.dom.bounds.clear()` — an internal API.
//
// Isolating that internal access here:
//   1. ONE place to swap if chessground 10.x changes the internal
//      shape OR exposes a public method.
//   2. Defensive try/catch so a future structural change degrades
//      to "bounds stay stale for one frame" rather than a runtime
//      crash on every click.
//   3. Searchable identifier (`invalidateChessgroundBounds`) so anyone
//      auditing internal-API usage finds this in one grep.
//
// Lock chessground to `^9.0.0` in package.json — major version bumps
// require deliberate review of this module.

import type { Api } from 'chessground/api';

type ChessgroundInternalState = {
  state?: {
    dom?: {
      bounds?: {
        clear?: () => void;
      };
    };
  };
};

let warned = false;

/**
 * Force chessground to re-measure the board's DOMRect on its next
 * click hit-test. Safe to call on every pointer interaction — the
 * cost is one `getBoundingClientRect()` call later (~5-50µs).
 *
 * No-op if the api is null or chessground's internal shape has
 * changed (logs a one-time warning so we notice on dev).
 */
export function invalidateChessgroundBounds(api: Api | null): void {
  if (!api) return;
  const internal = api as unknown as ChessgroundInternalState;
  const clear = internal.state?.dom?.bounds?.clear;
  if (typeof clear === 'function') {
    clear();
    return;
  }
  if (!warned) {
    warned = true;
     
    console.warn(
      '[OpenMakruk] chessground state.dom.bounds.clear() not found — ' +
        'internal API may have changed in the installed version. ' +
        'Hit-test may misalign after layout shifts until this wrapper is updated.',
    );
  }
}
