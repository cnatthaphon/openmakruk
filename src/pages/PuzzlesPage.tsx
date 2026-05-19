// Puzzles tab — curated tactical positions.
//
// v0.1 (this commit): skeleton + intended categories. Phase 4 fills
// the actual JSON of positions, the solver UI, and SM-2 spaced
// repetition scheduling.

export type PuzzleCategory = {
  id: string;
  title: string;
  description: string;
  targetCount: number; // planned in Phase 4
  currentCount: number; // committed in repo so far
};

const CATEGORIES: PuzzleCategory[] = [
  {
    id: 'mate-in-1',
    title: 'รุกจนใน 1 ตา',
    description: 'ฝึกสายตา — หาตาเดียวที่ปิดเกม',
    targetCount: 20,
    currentCount: 0,
  },
  {
    id: 'mate-in-2',
    title: 'รุกจนใน 2 ตา',
    description: 'รู้จักลำดับ — ขั้นแรกผูก ขั้นสองกินรุกจน',
    targetCount: 20,
    currentCount: 0,
  },
  {
    id: 'tactic',
    title: 'ยุทธวิธี (Tactics)',
    description: 'สอง-สำหรับ-หนึ่ง, fork, pin, skewer ที่เกิดบ่อยใน Makruk',
    targetCount: 30,
    currentCount: 0,
  },
  {
    id: 'counting',
    title: 'ปลายเกมนับศักดิ์',
    description: 'ไล่จนทันก่อน count limit — กลยุทธ์เฉพาะ Makruk',
    targetCount: 20,
    currentCount: 0,
  },
];

export function PuzzlesPage() {
  return (
    <div className="puzzles-page">
      <header className="puzzles-header">
        <h2>🧩 ปริศนา</h2>
        <p>
          ฝึกสายตาด้วยตำแหน่งจริงที่คัดมา · แต่ละข้อมี best move เดียว
          ตรวจด้วย Fairy-Stockfish
        </p>
        <p className="learn-status-note">
          🚧 v0.1: โครงสร้างพร้อม — content (50+ ปริศนา) ใส่ใน Phase 4
        </p>
      </header>

      <div className="puzzles-categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className="puzzle-category-card"
            disabled={cat.currentCount === 0}
            title={
              cat.currentCount === 0
                ? 'ยังไม่มีปริศนาในหมวดนี้ (Phase 4)'
                : cat.description
            }
          >
            <div className="puzzle-category-title">{cat.title}</div>
            <div className="puzzle-category-desc">{cat.description}</div>
            <div className="puzzle-category-meta">
              <span>
                {cat.currentCount} / {cat.targetCount} ข้อ
              </span>
              <div className="puzzle-progress">
                <div
                  className="puzzle-progress-fill"
                  style={{ width: `${(cat.currentCount / cat.targetCount) * 100}%` }}
                />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
