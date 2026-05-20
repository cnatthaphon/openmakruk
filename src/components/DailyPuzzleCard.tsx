// "Daily puzzle" card shown at the top of the Puzzles tab.
//
// Reads the deterministic daily pick from lib/dailyPuzzle, displays
// rating + category, and offers a button to start solving it. Once
// the user has solved today's puzzle (tracked in localStorage) the
// card changes state to show "✓ ทำแล้ว · กลับมาดูพรุ่งนี้".

import {
  dailyDateKey,
  isDailySolvedToday,
  pickDailyPuzzle,
} from '../lib/dailyPuzzle';
import { PUZZLE_CATEGORY_META, type Puzzle } from '../lib/puzzleSchema';

type Props = {
  puzzles: Puzzle[];
  onOpen: (puzzle: Puzzle) => void;
};

export function DailyPuzzleCard({ puzzles, onOpen }: Props) {
  if (puzzles.length === 0) return null;
  const daily = pickDailyPuzzle(puzzles);
  if (!daily) return null;
  const solved = isDailySolvedToday();
  const meta = PUZZLE_CATEGORY_META[daily.category];

  return (
    <section className={`daily-card ${solved ? 'solved' : ''}`}>
      <div className="daily-card-tag">⭐ ปริศนาประจำวัน · {dailyDateKey()}</div>
      <h3 className="daily-card-title">
        {meta.emoji} {meta.title}
      </h3>
      <p className="daily-card-meta">
        Rating: <strong>{daily.rating}</strong> · ธีม:{' '}
        {daily.themes.join(' · ') || '-'}
      </p>
      <p className="daily-card-prompt">{daily.prompt}</p>
      <button
        className="daily-card-button"
        onClick={() => onOpen(daily)}
        disabled={solved}
      >
        {solved ? '✓ ทำเสร็จแล้ววันนี้ · พรุ่งนี้ดูใหม่' : '▶ เริ่มเล่นปริศนาวันนี้'}
      </button>
    </section>
  );
}
