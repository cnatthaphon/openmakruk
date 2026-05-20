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
import { isPuzzleSolved, loadPuzzleProgress, type PuzzleProgress } from '../lib/puzzleProgress';
import {
  PUZZLE_CATEGORY_META,
  PUZZLE_CATEGORY_ORDER,
  type Puzzle,
  type PuzzleCategory,
} from '../lib/puzzleSchema';
import { PuzzleView } from './PuzzleView';

export function PuzzlesPage() {
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PuzzleProgress>(() => loadPuzzleProgress());
  const [activePuzzleId, setActivePuzzleId] = useState<string | null>(null);

  useEffect(() => {
    loadPuzzles()
      .then((data) => setPuzzles(data))
      .catch((err) => setLoadError(String(err)));
  }, []);

  const byCategory = useMemo(() => {
    const grouped: Record<PuzzleCategory, Puzzle[]> = {
      'mate-1': [],
      'mate-2': [],
      tactic: [],
      counting: [],
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
        {loadError && (
          <p className="puzzles-error">⚠ โหลด content ไม่สำเร็จ: {loadError}</p>
        )}
        {!puzzles && !loadError && <p className="label-aside">กำลังโหลด ...</p>}
      </header>

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
