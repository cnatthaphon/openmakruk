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
import { deleteUserPuzzle, loadUserPuzzles } from '../lib/userPuzzles';
import { getBackend } from '../lib/backend';
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
import { toast } from '../components/Toast';
import { SkeletonGrid } from '../components/Skeleton';

type Props = {
  /** Optional puzzle id from the route — when present and matching a
   *  puzzle in the catalog, open it directly. Lets `/#/puzzles/<id>`
   *  serve as a stable share link without restructuring this page. */
  initialPuzzleId?: string | null;
};

export function PuzzlesPage({ initialPuzzleId = null }: Props = {}) {
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PuzzleProgress>(() => loadPuzzleProgress());
  const [rating] = useState<PuzzleRatingState>(() => loadPuzzleRating());
  const reviewQueueSize = useMemo(() => dueNow(loadSchedule()).length, []);
  const [activePuzzleId, setActivePuzzleId] = useState<string | null>(initialPuzzleId);

  useEffect(() => {
    // Catalog sources, in priority order:
    //   1. Server (curated + user-mined) — when cloud sync is on,
    //      this is authoritative and reflects new community content
    //      without redeploying the static JSON.
    //   2. Static /content/puzzles/all.json — offline fallback +
    //      the seed source for what's in the server in the first place.
    //   3. Local user puzzles (always merged; opt-in personal pool).
    //
    // We resolve server + static in parallel, then fall back to the
    // first that succeeds. Deduplication is by id (server wins if both
    // sources have the same id, since server may have updated metadata).
    let cancelled = false;
    const backend = getBackend();
    const wantsServer = backend.isOnline() && backend.fetchPuzzles !== undefined;

    const loadAll = async (): Promise<Puzzle[]> => {
      const local = loadUserPuzzles();
      if (wantsServer && backend.fetchPuzzles) {
        try {
          // Pull both sources in parallel so the user can solve a
          // user-mined puzzle from someone else without enabling any
          // extra filter.
          const [curated, userMined] = await Promise.all([
            backend.fetchPuzzles({ source: 'curated' }),
            backend.fetchPuzzles({ source: 'user-mined' }),
          ]);
          const fromServer = [...curated.puzzles, ...userMined.puzzles] as Puzzle[];
          return dedupeById([...fromServer, ...local]);
        } catch (err) {
          // server reachable but errored — fall through to static
          // catalog. We surface the error in the load-error banner
          // only if the static load ALSO fails.
          console.warn('puzzles: server fetch failed, falling back to static', err);
        }
      }
      const staticPool = await loadPuzzles();
      return dedupeById([...staticPool, ...local]);
    };

    loadAll()
      .then((data) => {
        if (!cancelled) setPuzzles(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
    // reloadKey lets MyPuzzlesSection trigger a re-pull after deletes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

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

  // Escalation gates — category X requires Y prior solves in category Z
  // before it unlocks. Keeps new learners from bouncing off mate-in-2
  // before they've internalised mate-in-1. Honest gate, not restrictive:
  // only 3 mate-1 solves needed.
  const CATEGORY_GATES: Partial<Record<PuzzleCategory, { requires: PuzzleCategory; count: number }>> = {
    'mate-2': { requires: 'mate-1', count: 3 },
  };
  const solvedCountByCategory = (cat: PuzzleCategory): number => {
    return (byCategory[cat] ?? []).filter((p) => isPuzzleSolved(progress, p.id)).length;
  };
  const isCategoryLocked = (cat: PuzzleCategory): boolean => {
    const gate = CATEGORY_GATES[cat];
    if (!gate) return false;
    return solvedCountByCategory(gate.requires) < gate.count;
  };

  const handleCategoryClick = (cat: PuzzleCategory) => {
    if (isCategoryLocked(cat)) {
      const gate = CATEGORY_GATES[cat]!;
      const need = gate.count - solvedCountByCategory(gate.requires);
      toast.info(`🔒 ปลดล็อกหมวดนี้ — แก้ ${gate.requires} อีก ${need} ข้อ`);
      return;
    }
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

        {/* Counting trainer banner — Makruk-specific flagship.
            Surfaces the counting category prominently because the
            rule is unique to Thai chess and most newcomers don't
            even know it exists. */}
        <div className="puzzles-flagship-row">
          <button
            className="puzzles-counting-banner"
            onClick={() => navigate({ tab: 'counting' })}
            aria-label="Counting Trainer — กฎเฉพาะของหมากรุกไทย"
          >
            <span className="puzzles-counting-icon">🔢</span>
            <div className="puzzles-counting-text">
              <strong>Counting Trainer · drill</strong>
              <span className="label-aside">
                · 5 levels · ไล่ขุนเปลือยภายในกรอบเวลา
              </span>
            </div>
            <span className="puzzles-counting-cta">→</span>
          </button>
          <button
            className="puzzles-rush-banner"
            onClick={() => navigate({ tab: 'rush' })}
            aria-label="Puzzle Rush — 3 นาทีแก้ให้ได้มากที่สุด"
          >
            <span className="puzzles-counting-icon">🔥</span>
            <div className="puzzles-counting-text">
              <strong>Puzzle Rush · 3 นาที</strong>
              <span className="label-aside">
                · แก้ให้ได้เยอะที่สุด · ผิด 3 ครั้ง = จบ
              </span>
            </div>
            <span className="puzzles-counting-cta">→</span>
          </button>
          <button
            className="puzzles-rush-banner"
            onClick={() => navigate({ tab: 'survive' })}
            aria-label="Survive the attack — ป้องกัน 10 ตา"
          >
            <span className="puzzles-counting-icon">🛡️</span>
            <div className="puzzles-counting-text">
              <strong>Survive the attack</strong>
              <span className="label-aside">
                · ป้องกัน 10 ตา · ตำแหน่งภายใต้แรงกดดัน
              </span>
            </div>
            <span className="puzzles-counting-cta">→</span>
          </button>
        </div>
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

      <MyPuzzlesSection
        onOpen={(id) => setActivePuzzleId(id)}
        onRefresh={() => setReloadKey((k) => k + 1)}
      />

      <div className="puzzles-categories">
        {PUZZLE_CATEGORY_ORDER.map((cat) => {
          const list = byCategory[cat];
          const meta = PUZZLE_CATEGORY_META[cat];
          const solved = list.filter((p) => isPuzzleSolved(progress, p.id)).length;
          const total = list.length;
          const disabled = total === 0;
          const locked = isCategoryLocked(cat);
          const gate = CATEGORY_GATES[cat];
          const need = gate ? gate.count - solvedCountByCategory(gate.requires) : 0;
          return (
            <button
              key={cat}
              className={`puzzle-category-card ${locked ? 'is-locked' : ''}`}
              disabled={disabled}
              onClick={() => handleCategoryClick(cat)}
              title={
                disabled
                  ? 'ยังไม่มีปริศนาในหมวดนี้ (เติมใน Phase 4)'
                  : locked && gate
                    ? `🔒 ปลดล็อกหลังแก้ ${gate.requires} ${need} ข้อ`
                    : meta.description
              }
            >
              <div className="puzzle-category-emoji">
                {locked ? '🔒' : meta.emoji}
              </div>
              <div className="puzzle-category-title">{meta.title}</div>
              <div className="puzzle-category-desc">
                {locked && gate
                  ? `🔒 แก้ ${gate.requires} อีก ${need} ข้อเพื่อปลดล็อก`
                  : meta.description}
              </div>
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

/** Drop duplicates keeping the FIRST occurrence (server entries come
 *  before local user puzzles, so server metadata wins for collisions). */
function dedupeById(puzzles: Puzzle[]): Puzzle[] {
  const seen = new Set<string>();
  const out: Puzzle[] = [];
  for (const p of puzzles) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/** Lists user-authored puzzles with delete + open-to-solve actions.
 *  Hidden when the user hasn't authored any. */
function MyPuzzlesSection({
  onOpen,
  onRefresh,
}: {
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const [mine, setMine] = useState(() => loadUserPuzzlesLocal());
  function loadUserPuzzlesLocal() {
    return loadUserPuzzles();
  }
  if (mine.length === 0) {
    return (
      <section className="my-puzzles-section my-puzzles-empty">
        <p className="label-aside">
          🧩 ยังไม่มี puzzle ของคุณ · ออกแบบที่{' '}
          <a href="#/custom" className="my-puzzles-link">🎨 ออกแบบ</a>{' '}
          แล้วกด "🧩 บันทึกเป็น puzzle" — engine จะ verify ก่อน
        </p>
      </section>
    );
  }
  const handleDelete = (id: string) => {
    if (!window.confirm('ลบ puzzle นี้?')) return;
    deleteUserPuzzle(id);
    setMine(loadUserPuzzlesLocal());
    onRefresh();
  };
  return (
    <section className="my-puzzles-section">
      <h3>🧩 ของฉัน · {mine.length} puzzle</h3>
      <p className="label-aside">
        Puzzle ที่คุณออกแบบเอง · ออกได้ที่{' '}
        <a href="#/custom" className="my-puzzles-link">🎨 ออกแบบ</a>
      </p>
      <ul className="my-puzzles-list">
        {mine.map((p) => (
          <li key={p.id} className="my-puzzles-row">
            <button
              className="my-puzzles-open"
              onClick={() => onOpen(p.id)}
              title="แก้ปริศนา"
            >
              <strong>{p.prompt ?? p.id}</strong>
              <span className="label-aside">
                {p.category} · rating {p.rating} · {p.solution.length} ตา
              </span>
            </button>
            <button
              className="my-puzzles-delete"
              onClick={() => handleDelete(p.id)}
              aria-label="ลบ"
              title="ลบ puzzle"
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
