// Top-N candidate moves from the engine, shown as a ranked list.
// Mirrors lichess analysis board's "engine suggests" panel.
//
// Each row: rank · eval · first 2-4 moves of the PV. Clicking a row
// dispatches an onSelect callback so the host can animate that line
// onto the board (the actual animation lives in the host — this
// component is presentation only).

import { formatScore, type EvalInfo } from '../lib/evalParser';

type Props = {
  /** Sorted by multipv ascending (1 = strongest). */
  lines: EvalInfo[];
  onSelect?: (line: EvalInfo) => void;
};

export function MultiPV({ lines, onSelect }: Props) {
  if (lines.length === 0) {
    return (
      <div className="multipv-panel multipv-empty">
        <p className="label-aside">
          กดปุ่ม 🔍 ใต้กระดานเพื่อให้ engine แสดงตาเดินที่ดีที่สุด 3 ตา
        </p>
      </div>
    );
  }

  return (
    <div className="multipv-panel">
      <div className="multipv-header">
        <span className="label-aside">Top {lines.length} ตา · depth {lines[0]?.depth ?? '-'}</span>
      </div>
      {lines.map((line) => (
        <button
          key={line.multipv}
          className="multipv-row"
          onClick={() => onSelect?.(line)}
        >
          <span className="multipv-rank">#{line.multipv}</span>
          <span
            className={`multipv-score ${
              line.score.type === 'cp' && line.score.cp >= 0
                ? 'positive'
                : 'negative'
            }`}
          >
            {formatScore(line.score)}
          </span>
          <span className="multipv-pv">
            {line.pv.slice(0, 4).join(' ')}
            {line.pv.length > 4 && ' …'}
          </span>
        </button>
      ))}
    </div>
  );
}
