// 🧩 ปริศนา tab.
//
// List view: fetch /content/puzzles/all.json via the content manifest,
// group by category, render one card per category showing solved/total
// + a "เล่นต่อ" button that picks the next-unsolved puzzle in that
// category.
//
// Detail view: PuzzleView (single-puzzle player). Coming back from a
// puzzle keeps the user in the same category context.

import { useEffect, useMemo, useState } from 'react';
import { loadPuzzles } from '../lib/content';
import { loadUserPuzzles } from '../lib/userPuzzles';
import { isPuzzleSolved, loadPuzzleProgress, type PuzzleProgress } from '../lib/puzzleProgress';
import { formatRating, loadPuzzleRating, type PuzzleRatingState } from '../lib/puzzleRating';
import { loadSchedule, dueNow } from '../lib/spacedRepetition';
import { DailyPuzzleCard } from '../components/DailyPuzzleCard';
import {
  PUZZLE_CATEGORY_META,
  PUZZLE_CATEGORY_ORDER,
  type Puzzle,
  type PuzzleCategory,
} from '../lib/puzzleSchema';
import { PuzzleView } from './PuzzleView';
import { navigate } from '../lib/router';
import { SkeletonGrid } from '../components/Skeleton';

type Props = {
  /** Optional puzzle id from the route — when present and matching a
   *  puzzle in the catalog, open it directly. Lets `/#/puzzles/<id>`
   *  serve as a stable share link without restructuring this page. */
  initialPuzzleId?: string | null;
};

export function PuzzlesPage({ initialPuzzleId = null }: Props = {}) {
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PuzzleProgress>(() => loadPuzzleProgress());
  const [rating] = useState<PuzzleRatingState>(() => loadPuzzleRating());
  const reviewQueueSize = useMemo(() => dueNow(loadSchedule()).length, []);
  const [activePuzzleId, setActivePuzzleId] = useState<string | null>(initialPuzzleId);

  useEffect(() => {
    loadPuzzles()
      // Merge curated + user-created so both appear in the same
      // category counts. User puzzles aren't filtered out — they're
      // a first-class part of the catalog once verified.
      .then((data) => setPuzzles([...data, ...loadUserPuzzles()]))
      .catch((err) => setLoadError(String(err)));
  }, []);

  // React to route changes while the page is mounted (e.g. user pastes
  // a deep link or clicks a daily-puzzle card). When the requested id
  // doesn't exist in the catalog we fall through to the index view —
  // toasts here would be too noisy for a shareable-link scenario.
  useEffect(() => {
    if (initialPuzzleId && puzzles?.some((p) => p.id === initialPuzzleId)) {
      setActivePuzzleId(initialPuzzleId);
    }
  }, [initialPuzzleId, puzzles]);

  // Mirror the active selection into the URL so deep-links + browser
  // back/forward behave intuitively. Index view = `/#/puzzles`, open
  // puzzle = `/#/puzzles/<id>`.
  useEffect(() => {
    navigate({ tab: 'puzzles', id: activePuzzleId });
  }, [activePuzzleId]);

  const byCategory = useMemo(() => {
    const grouped: Record<PuzzleCategory, Puzzle[]> = {
      'mate-1': [],
      'mate-2': [],
      tactic: [],
      counting: [],
      defense: [],
    };
    if (puzzles) {
      for (const p of puzzles) grouped[p.category].push(p);
      for (const cat of PUZZLE_CATEGORY_ORDER) {
        grouped[cat].sort((a, b) => a.rating - b.rating);
      }
    }
    return grouped;
  }, [puzzles]);

  const activePuzzle = puzzles?.find((p) => p.id === activePuzzleId) ?? null;

  const handleCategoryClick = (cat: PuzzleCategory) => {
    const list = byCategory[cat];
    // Pick first unsolved, else first
    const next = list.find((p) => !isPuzzleSolved(progress, p.id)) ?? list[0];
    if (next) setActivePuzzleId(next.id);
  };

  const handleNext = () => {
    if (!activePuzzle || !puzzles) return;
    const cat = activePuzzle.category;
    const list = byCategory[cat];
    const refreshed = loadPuzzleProgress();
    setProgress(refreshed);
    const next =
      list.find((p) => !isPuzzleSolved(refreshed, p.id) && p.id !== activePuzzle.id) ??
      list[(list.findIndex((p) => p.id === activePuzzle.id) + 1) % list.length];
    if (next && next.id !== activePuzzle.id) {
      setActivePuzzleId(next.id);
    } else {
      setActivePuzzleId(null);
    }
  };

  const handleClose = () => {
    setProgress(loadPuzzleProgress());
    setActivePuzzleId(null);
  };

  if (activePuzzle) {
    const sameCat = byCategory[activePuzzle.category];
    const hasMoreInCategory = sameCat.length > 1;
    return (
      <PuzzleView
        puzzle={activePuzzle}
        onClose={handleClose}
        onNext={hasMoreInCategory ? handleNext : null}
      />
    );
  }

  return (
    <div className="puzzles-page">
      <header className="puzzles-header">
        <h2>🧩 ปริศนา</h2>
        <p>
          ฝึกสายตาด้วยตำแหน่งจริงที่คัดมา · ตรวจคำตอบกับ Fairy-Stockfish
        </p>
        <div className="puzzles-stats-bar">
          <div className="puzzles-stat">
            <span className="puzzles-stat-label">Puzzle Rating</span>
            <span className="puzzles-stat-value">{formatRating(rating.rating)}</span>
          </div>
          <div className="puzzles-stat">
            <span className="puzzles-stat-label">ทำสำเร็จ</span>
            <span className="puzzles-stat-value">{rating.solved}</span>
          </div>
          <div className="puzzles-stat">
            <span className="puzzles-stat-label">ทดลอง</span>
            <span className="puzzles-stat-value">{rating.attempts}</span>
          </div>
          <div className="puzzles-stat">
            <span className="puzzles-stat-label">รอทบทวน</span>
            <span className="puzzles-stat-value">{reviewQueueSize}</span>
          </div>
        </div>
        {loadError && (
          <p className="puzzles-error">⚠ โหลด content ไม่สำเร็จ: {loadError}</p>
        )}
      </header>

      {!puzzles && !loadError && (
        <SkeletonGrid count={4} withThumb={false} />
      )}

      {puzzles && (
        <DailyPuzzleCard
          puzzles={puzzles}
          onOpen={(p) => setActivePuzzleId(p.id)}
        />
      )}

      {puzzles && reviewQueueSize > 0 && (() => {
        // Surface the first due-now puzzle as a callable card. Once the
        // user solves it, the schedule library re-dates it forward and
        // it falls off this queue automatically.
        const due = dueNow(loadSchedule());
        const next = puzzles.find((p) => due.includes(p.id));
        if (!next) return null;
        return (
          <section className="review-card">
            <div className="review-card-tag">🔁 ทบทวน · {reviewQueueSize} ปริศนา</div>
            <h3 className="review-card-title">ปริศนาที่ถึงเวลาทบทวน</h3>
            <p className="review-card-meta">
              Spaced repetition · ตำราใน SM-2 · ทำซ้ำเพื่อจดจำ pattern ระยะยาว
            </p>
            <button
              className="review-card-button"
              onClick={() => setActivePuzzleId(next.id)}
            >
              ▶ เริ่มทบทวน
            </button>
          </section>
        );
      })()}

      <div className="puzzles-categories">
        {PUZZLE_CATEGORY_ORDER.map((cat) => {
          const list = byCategory[cat];
          const meta = PUZZLE_CATEGORY_META[cat];
          const solved = list.filter((p) => isPuzzleSolved(progress, p.id)).length;
          const total = list.length;
          const disabled = total === 0;
          return (
            <button
              key={cat}
              className="puzzle-category-card"
              disabled={disabled}
              onClick={() => handleCategoryClick(cat)}
              title={
                disabled ? 'ยังไม่มีปริศนาในหมวดนี้ (เติมใน Phase 4)' : meta.description
              }
            >
              <div className="puzzle-category-emoji">{meta.emoji}</div>
              <div className="puzzle-category-title">{meta.title}</div>
              <div className="puzzle-category-desc">{meta.description}</div>
              <div className="puzzle-category-meta">
                <span>
                  {solved} / {total} ข้อ
                </span>
                <div className="puzzle-progress">
                  <div
                    className="puzzle-progress-fill"
                    style={{
                      width: total === 0 ? '0%' : `${(solved / total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <footer className="puzzles-footer">
        <p className="label-aside">
          จำนวนปริศนาทั้งหมด: {puzzles?.length ?? 0} · เติมเพิ่มได้โดยแก้ไข{' '}
          <code>content/puzzles/all.json</code> และเพิ่มเลข version ใน manifest —
          ไม่ต้อง rebuild app
        </p>
      </footer>
    </div>
  );
}
