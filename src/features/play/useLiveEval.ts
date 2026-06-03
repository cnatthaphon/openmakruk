// useLiveEval — the Play tab's background eval-bar search, extracted
// verbatim from App.tsx (issue #5).
//
// When Settings.showEvalBar is on, runs a low-depth background search
// on every position change so the EvalBar reflects the current eval
// without the user pressing Analyze. Cancel-safe via a token ref so
// out-of-order completions don't overwrite a newer eval.
//
// Owns the `liveEval` state + the effect; returns setLiveEval so App
// keeps clearing it on the position-change reset it already does.
// Behaviour identical to the inlined version — same guards, same dep
// array, same depth-10 search.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { searchBestMove } from '../../lib/engine';
import type { EvalScore } from '../../lib/evalParser';
import type { Tab } from '../../lib/router';

type LiveEvalOpts = {
  /** Current position FEN (state?.fen). */
  fen: string | undefined;
  /** Engine + board ready (board && state in App). */
  ready: boolean;
  showEvalBar: boolean;
  currentTab: Tab;
  /** User's main Analyze run is active — skip the light search. */
  analyzing: boolean;
  /** Review mode drives the bar from the analysis archive — skip. */
  reviewActive: boolean;
  /** Inspecting a past ply (viewer state, not real game) — skip. */
  inspectPly: number | null;
  isGameOver: boolean;
  forcedResult: string | null;
};

export function useLiveEval(opts: LiveEvalOpts): {
  liveEval: EvalScore | null;
  setLiveEval: Dispatch<SetStateAction<EvalScore | null>>;
} {
  const {
    fen,
    ready,
    showEvalBar,
    currentTab,
    analyzing,
    reviewActive,
    inspectPly,
    isGameOver,
    forcedResult,
  } = opts;
  const [liveEval, setLiveEval] = useState<EvalScore | null>(null);
  const liveEvalTokenRef = useRef(0);

  useEffect(() => {
    if (!showEvalBar) return;
    if (!ready || !fen) return;
    if (currentTab !== 'play') return;
    if (isGameOver || forcedResult) return;
    // Skip during the user's main Analyze run — that one uses higher
    // depth + multi-PV; we'd just thrash the engine.
    if (analyzing) return;
    // Skip in review mode (eval bar is driven by the analysis archive).
    if (reviewActive) return;
    // Skip in inspect mode (viewer state, not real game state).
    if (inspectPly !== null) return;

    const token = ++liveEvalTokenRef.current;
    let cancelled = false;
    searchBestMove(fen, { depth: 10 })
      .then((result) => {
        if (cancelled) return;
        if (token !== liveEvalTokenRef.current) return; // newer search already started
        if (typeof result.mateIn === 'number') {
          setLiveEval({ type: 'mate', mate: result.mateIn });
        } else if (typeof result.scoreCp === 'number') {
          setLiveEval({ type: 'cp', cp: result.scoreCp });
        }
      })
      .catch(() => {
        // Engine error — leave liveEval as last known good
      });
    return () => {
      cancelled = true;
    };
    // `ready` is intentionally omitted (matches the original effect):
    // a fen change after the engine is ready re-runs us anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, showEvalBar, currentTab, analyzing, reviewActive, inspectPly, isGameOver, forcedResult]);

  return { liveEval, setLiveEval };
}
