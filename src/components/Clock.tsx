// Two-sided clock display — top = opponent, bottom = user.
// The side whose clock is currently RUNNING gets a highlighted
// background; the other side dims. Flag-fall is rendered in red.
//
// Display switches to tenths (X:XX.X) when under 10s so the user can
// react to low time. The host component is responsible for tickClock
// + applyMove on actual moves — this component just renders.

import { formatClockTime, type ClockState } from '../lib/clock';

type Props = {
  clock: ClockState;
  /** Which side the user plays — used to label rows as "คุณ" vs CPU */
  userSide: 'white' | 'black';
};

export function ClockDisplay({ clock, userSide }: Props) {
  const topSide: 'white' | 'black' = userSide === 'white' ? 'black' : 'white';
  const bottomSide: 'white' | 'black' = userSide;
  const isUnlimited =
    clock.white === 0 && clock.black === 0 && clock.incrementMs === 0;
  if (isUnlimited) return null;

  return (
    <div className="clock-display">
      <ClockRow
        side={topSide}
        ms={clock[topSide]}
        active={clock.running === topSide}
        flagged={clock.flagged === topSide}
        label="CPU"
      />
      <ClockRow
        side={bottomSide}
        ms={clock[bottomSide]}
        active={clock.running === bottomSide}
        flagged={clock.flagged === bottomSide}
        label="คุณ"
      />
    </div>
  );
}

function ClockRow({
  side,
  ms,
  active,
  flagged,
  label,
}: {
  side: 'white' | 'black';
  ms: number;
  active: boolean;
  flagged: boolean;
  label: string;
}) {
  const low = ms < 10_000 && ms > 0;
  return (
    <div
      className={`clock-row ${active ? 'active' : ''} ${flagged ? 'flagged' : ''} ${low ? 'low' : ''}`}
    >
      <div className="clock-row-label">
        {label}{' '}
        <span className="clock-row-side">({side === 'white' ? 'ขาว' : 'ดำ'})</span>
      </div>
      <div className="clock-row-time">
        {flagged ? '⏱ หมดเวลา' : formatClockTime(ms)}
      </div>
    </div>
  );
}
