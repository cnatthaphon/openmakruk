// Touch haptic feedback — wraps navigator.vibrate.
//
// We trigger short pulses on game events that matter on touch devices:
// capturing a piece, delivering check, game ending. The desktop case
// is a no-op (vibrate is undefined or ignored). iOS Safari historically
// blocked vibrate entirely; on those devices the calls just fall through
// without error.
//
// Rule: never block on this. Vibrate is fire-and-forget; failure modes
// are silent by design (no permission needed, no events to handle).

export type HapticEvent =
  | 'move'        // 8ms — a tiny tick on the user's own move
  | 'capture'     // 15ms — capturing an enemy piece
  | 'check'       // [10, 40, 10] — pattern for the urgency signal
  | 'mate'        // [30, 50, 30, 50, 30] — celebratory
  | 'wrong';      // [40, 80] — wrong puzzle move, dampened

const PATTERNS: Record<HapticEvent, number | number[]> = {
  move: 8,
  capture: 15,
  check: [10, 40, 10],
  mate: [30, 50, 30, 50, 30],
  wrong: [40, 80],
};

/** Trigger a haptic event. Safe to call on any platform; falls through
 *  to a no-op when vibrate is unavailable. */
export function haptic(event: HapticEvent): void {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[event]);
  } catch {
    // Defensive — vibrate has thrown on some Android WebViews in the
    // past when called from a non-user-gesture context.
  }
}
