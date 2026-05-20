// Game clock — track remaining time per side, support increment,
// detect flag-fall (timeout).
//
// Stored in milliseconds (not seconds) so we don't accumulate FP
// drift when accruing increments. The clock is driven by the host
// component calling tick(now) on each animation frame OR by
// rAF-less polling at ~10Hz; the math is the same.
//
// Preset time controls are listed at the bottom — a UI picker will
// surface them to the user as radio buttons.

export type Side = 'white' | 'black';

export type ClockState = {
  /** Milliseconds remaining for each side. */
  white: number;
  black: number;
  /** Bonus seconds added to the mover's clock after their move. */
  incrementMs: number;
  /** Which side's clock is currently counting down. null = paused. */
  running: Side | null;
  /** Timestamp (ms since epoch) of the last tick application. */
  lastTickMs: number;
  /** Side that flagged (timed out), if any. */
  flagged: Side | null;
};

export type TimeControl = {
  id: string;
  label: string;
  initialSeconds: number;
  incrementSeconds: number;
};

export const TIME_CONTROLS: TimeControl[] = [
  { id: 'unlimited',   label: 'ไม่จำกัดเวลา', initialSeconds: 0,    incrementSeconds: 0 },
  { id: 'blitz-5',     label: 'Blitz 5 นาที',  initialSeconds: 300,  incrementSeconds: 0 },
  { id: 'blitz-5-3',   label: 'Blitz 5 + 3"',  initialSeconds: 300,  incrementSeconds: 3 },
  { id: 'rapid-10',    label: 'Rapid 10 นาที', initialSeconds: 600,  incrementSeconds: 0 },
  { id: 'rapid-15-10', label: 'Rapid 15 + 10"', initialSeconds: 900, incrementSeconds: 10 },
  { id: 'classical-30', label: 'Classical 30 นาที', initialSeconds: 1800, incrementSeconds: 0 },
];

export function clockFromControl(tc: TimeControl, now: number): ClockState {
  const ms = tc.initialSeconds * 1000;
  return {
    white: ms,
    black: ms,
    incrementMs: tc.incrementSeconds * 1000,
    running: null,
    lastTickMs: now,
    flagged: null,
  };
}

/** Apply elapsed time since lastTickMs to the running side. */
export function tickClock(state: ClockState, now: number): ClockState {
  if (state.running === null || state.flagged) {
    return { ...state, lastTickMs: now };
  }
  // Unlimited time control: no countdown.
  if (state.white === 0 && state.black === 0 && state.incrementMs === 0) {
    return { ...state, lastTickMs: now };
  }
  const elapsed = now - state.lastTickMs;
  const next = { ...state, lastTickMs: now };
  const side = state.running;
  next[side] = Math.max(0, state[side] - elapsed);
  if (next[side] === 0) {
    next.flagged = side;
    next.running = null;
  }
  return next;
}

/** Called when a side completes a move. Adds increment + swaps running. */
export function applyMove(state: ClockState, mover: Side, now: number): ClockState {
  if (state.flagged) return state;
  // Tick to settle any pending elapsed time on the mover's clock first.
  const ticked = tickClock(state, now);
  // Unlimited: nothing to do.
  if (ticked.white === 0 && ticked.black === 0 && ticked.incrementMs === 0) {
    return { ...ticked, running: mover === 'white' ? 'black' : 'white', lastTickMs: now };
  }
  return {
    ...ticked,
    [mover]: ticked[mover] + state.incrementMs,
    running: mover === 'white' ? 'black' : 'white',
    lastTickMs: now,
  };
}

export function startClock(state: ClockState, side: Side, now: number): ClockState {
  if (state.flagged) return state;
  return { ...state, running: side, lastTickMs: now };
}

export function pauseClock(state: ClockState, now: number): ClockState {
  const ticked = tickClock(state, now);
  return { ...ticked, running: null };
}

/** "5:00" / "0:42" / "0:09.3" — switches to tenths when under 10s. */
export function formatClockTime(ms: number): string {
  const totalSec = Math.max(0, ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec - minutes * 60;
  if (totalSec < 10) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
  }
  return `${minutes}:${Math.floor(seconds).toString().padStart(2, '0')}`;
}
