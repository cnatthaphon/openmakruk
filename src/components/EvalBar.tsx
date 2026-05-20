// Vertical evaluation bar — sits to the left of the board on the
// Play / Analysis pages.
//
// Input: an EvalScore (cp or mate) plus the side-orientation flag.
// Output: a thin column split into white-on-top / black-on-bottom
// where the split position reflects who's better. Numeric eval is
// displayed at the matching end so users can read the actual cp
// or mate without interpreting the bar.

import { formatScore, scoreToBarValue, type EvalScore } from '../lib/evalParser';

type Props = {
  /** Engine evaluation. null = no data yet. */
  score: EvalScore | null;
  /** Search depth that produced this eval, for the user's awareness. */
  depth?: number;
  /** If true, board is flipped (user plays black) → reverse the bar. */
  flipped?: boolean;
};

export function EvalBar({ score, depth, flipped }: Props) {
  // Convert [-1, 1] → percentage. 50% = even. >50% = white winning.
  const barValue = score ? scoreToBarValue(score) : 0;
  const whitePct = 50 + barValue * 50;
  const display = score ? formatScore(score) : '—';
  const displayOnTop = score && score.type === 'mate'
    ? score.mate > 0
    : barValue > 0;

  return (
    <div className={`eval-bar ${flipped ? 'flipped' : ''}`}>
      <div
        className="eval-bar-black"
        style={{ height: `${100 - whitePct}%` }}
        aria-hidden="true"
      />
      <div
        className="eval-bar-white"
        style={{ height: `${whitePct}%` }}
        aria-hidden="true"
      />
      <div
        className={`eval-bar-label ${displayOnTop ? 'top' : 'bottom'} ${
          barValue >= 0 ? 'for-white' : 'for-black'
        }`}
      >
        {display}
        {depth !== undefined && depth > 0 && (
          <div className="eval-bar-depth">d{depth}</div>
        )}
      </div>
    </div>
  );
}
