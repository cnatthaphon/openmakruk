// useClockController — the Play tab's chess-clock orchestration,
// extracted verbatim from App.tsx (issue #5, step 2).
//
// Owns the `clock` state + the five clock effects (init on fresh game,
// start-on-side-to-move, 10 Hz tick, flag-fall, per-move increment).
// The clock ARITHMETIC stays in src/lib/clock.ts — this hook only
// orchestrates when to call it, reading game signals passed in by App.
//
// Behaviour is identical to the inlined version: same guards, same
// dependency arrays, same Date.now() timing. `setClock` is returned so
// App keeps driving the cases the effects don't own — reset, resume
// restore, and the time-control picker.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  TIME_CONTROLS,
  clockFromControl,
  tickClock,
  applyMove as clockApplyMove,
  startClock,
  type ClockState,
} from '../../lib/clock';
import { log } from '../../lib/log';
import type { Tab } from '../../lib/router';

type ClockControllerOpts = {
  /** Selected time-control id; 'unlimited' disables the clock. */
  timeControlId: string;
  /** history.length — drives fresh-game init + per-move increment. */
  historyLength: number;
  /** Current side to move (state?.turn), or undefined when no game. */
  turn: 'white' | 'black' | undefined;
  /** state?.isGameOver. */
  isGameOver: boolean;
  /** forcedResult (resign / accepted draw / flag) — pauses the clock. */
  forcedResult: string | null;
  /** Which tab is active; the clock only runs on 'play'. */
  currentTab: Tab;
  /** Called when a side flags — App turns this into a forced result. */
  onFlagFall: (result: string) => void;
};

export function useClockController(opts: ClockControllerOpts): {
  clock: ClockState | null;
  setClock: Dispatch<SetStateAction<ClockState | null>>;
} {
  const { timeControlId, historyLength, turn, isGameOver, forcedResult, currentTab, onFlagFall } =
    opts;
  const [clock, setClock] = useState<ClockState | null>(null);

  // ── Clock: initialise + tick + flag-fall ─────────────────────────
  // When user picks a non-unlimited time control AND a game starts
  // (first move played), spin up a ClockState. Tick at 10 Hz while
  // running. On flag-fall, force-end the game so the player who lost
  // on time records a loss.
  useEffect(() => {
    if (timeControlId === 'unlimited') {
      if (clock !== null) setClock(null);
      return;
    }
    // Re-init clock at the start of a fresh game (no history yet).
    if (historyLength === 0 && clock === null) {
      const tc = TIME_CONTROLS.find((t) => t.id === timeControlId);
      if (!tc) return;
      const fresh = clockFromControl(tc, Date.now());
      setClock(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeControlId, historyLength]);

  // Start the clock running on the side-to-move once the first move
  // happens (or game already in progress).
  useEffect(() => {
    if (!clock || clock.flagged) return;
    if (isGameOver || forcedResult) return;
    if (currentTab !== 'play') return;
    if (historyLength === 0) return;
    const sideToMove: 'white' | 'black' = turn ?? 'white';
    if (clock.running === sideToMove) return; // already running on right side
    setClock((c) => (c ? startClock(c, sideToMove, Date.now()) : c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLength, turn, isGameOver, forcedResult, currentTab]);

  // 10 Hz tick. Cheap — only runs while a clock is active + game live.
  useEffect(() => {
    if (!clock || clock.flagged) return;
    if (clock.running === null) return;
    if (isGameOver || forcedResult) return;
    const interval = window.setInterval(() => {
      setClock((c) => (c ? tickClock(c, Date.now()) : c));
    }, 100);
    return () => window.clearInterval(interval);
  }, [clock?.running, clock?.flagged, isGameOver, forcedResult]);

  // Flag-fall handler — when a clock hits 0, the side that flagged
  // loses on time. Translate to a forced result so the existing
  // game-over UI + auto-recorder picks it up.
  useEffect(() => {
    if (!clock?.flagged) return;
    if (forcedResult) return;
    // The side that flagged loses. White flagged → black wins (0-1).
    const result = clock.flagged === 'white' ? '0-1' : '1-0';
    onFlagFall(result);
    log('clock.flagFall', { side: clock.flagged });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock?.flagged, forcedResult]);

  // Apply increment + swap clock side after every move (user or CPU).
  // We use history length as the trigger; whichever side just moved
  // gets the increment.
  const prevHistoryLenForClockRef = useRef(0);
  useEffect(() => {
    const prev = prevHistoryLenForClockRef.current;
    const newLen = historyLength;
    prevHistoryLenForClockRef.current = newLen;
    if (!clock || clock.flagged) return;
    if (newLen <= prev) return; // not an advance (history reset / undo)
    // The side that JUST moved is opposite to current state.turn.
    // history.length odd = white just moved (1, 3, 5…); even = black.
    const mover: 'white' | 'black' = newLen % 2 === 1 ? 'white' : 'black';
    setClock((c) => (c ? clockApplyMove(c, mover, Date.now()) : c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLength]);

  return { clock, setClock };
}
