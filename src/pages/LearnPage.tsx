// Tutorial / Learn tab — pathway for new players.
//
// v0.1 (this commit): skeleton only. The structure below mirrors what
// gets filled in across Phase 2 (piece-movement lessons) and Phase 3
// (game-form lessons: check / mate / counting / stalemate).

export type LessonStatus = 'locked' | 'unlocked' | 'completed';

export type Lesson = {
  id: string;
  title: string;
  description: string;
  group: 'pieces' | 'rules' | 'strategy';
  estimateMinutes: number;
  status: LessonStatus;
};

const PLANNED_LESSONS: Lesson[] = [
  // Group 1: how each piece moves (Phase 2)
  { id: 'piece-king',   title: 'ขุน (King) เดินยังไง',     description: 'เดินได้ 1 ช่องทุกทิศทาง (8 ช่อง)', group: 'pieces', estimateMinutes: 3, status: 'unlocked' },
  { id: 'piece-met',    title: 'เม็ด (Met) เดินยังไง',     description: 'เดินได้ 1 ช่อง เฉพาะทแยง (4 ช่อง)', group: 'pieces', estimateMinutes: 3, status: 'locked' },
  { id: 'piece-khon',   title: 'โคน (Khon) เดินยังไง',     description: 'เดินได้ 5 ช่อง: ตรงหน้า + ทแยง 4', group: 'pieces', estimateMinutes: 3, status: 'locked' },
  { id: 'piece-knight', title: 'ม้า (Horse) เดินยังไง',    description: 'L-shape เหมือนหมากรุกสากล', group: 'pieces', estimateMinutes: 4, status: 'locked' },
  { id: 'piece-rook',   title: 'เรือ (Rook) เดินยังไง',    description: 'แนวตรงและแนวขวาง ไกลเท่าไหร่ก็ได้', group: 'pieces', estimateMinutes: 3, status: 'locked' },
  { id: 'piece-bia',    title: 'เบี้ย (Bia) + เบี้ยหงาย',  description: 'เดินตรง 1 ช่อง จับทแยง · โปรโมตเป็น เม็ด', group: 'pieces', estimateMinutes: 5, status: 'locked' },
  // Group 2: game rules (Phase 3)
  { id: 'rule-check',   title: 'การรุก (Check)',           description: 'เมื่อขุนถูกขู่จับ ต้องตอบสนอง', group: 'rules', estimateMinutes: 4, status: 'locked' },
  { id: 'rule-mate',    title: 'รุกจน (Checkmate)',        description: 'เมื่อหนีไม่ได้ = จบเกม', group: 'rules', estimateMinutes: 5, status: 'locked' },
  { id: 'rule-stale',   title: 'อับ (Stalemate)',          description: 'ไม่มีตาเดิน แต่ไม่ถูกรุก = เสมอ', group: 'rules', estimateMinutes: 4, status: 'locked' },
  { id: 'rule-count',   title: 'นับศักดิ์ (Counting)',     description: 'เมื่อฝ่ายอ่อนเหลือขุนเปลือย — กฎเฉพาะ Makruk', group: 'rules', estimateMinutes: 6, status: 'locked' },
  // Group 3: strategy (Phase 3 continued)
  { id: 'strat-open',   title: 'หลักการเปิดเกม',           description: 'พัฒนาตัวหมาก ครองศูนย์', group: 'strategy', estimateMinutes: 8, status: 'locked' },
  { id: 'strat-end',    title: 'ปลายเกม: K + R vs K',     description: 'รุกจนด้วยเรือเดียวบวกขุน', group: 'strategy', estimateMinutes: 8, status: 'locked' },
];

const GROUP_LABELS: Record<Lesson['group'], string> = {
  pieces:   '1. รู้จักตัวหมาก',
  rules:    '2. กฎพื้นฐาน',
  strategy: '3. กลยุทธ์',
};

export function LearnPage() {
  const groups: Lesson['group'][] = ['pieces', 'rules', 'strategy'];
  return (
    <div className="learn-page">
      <header className="learn-header">
        <h2>🎓 ฝึกเดินหมากรุกไทย</h2>
        <p>
          ไล่จากซ้ายไปขวา ทำได้ทีละบท · ครบหมดแล้วพร้อมเข้าโหมดจัดอันดับ
        </p>
        <p className="learn-status-note">
          🚧 v0.1: โครงสร้างพร้อม — เนื้อหา interactive lessons จะใส่ใน Phase 2 (commit ถัดไป)
        </p>
      </header>

      {groups.map((g) => {
        const lessons = PLANNED_LESSONS.filter((l) => l.group === g);
        const total = lessons.length;
        const completed = lessons.filter((l) => l.status === 'completed').length;
        return (
          <section key={g} className="learn-group">
            <div className="learn-group-header">
              <h3>{GROUP_LABELS[g]}</h3>
              <span className="label-aside">
                {completed} / {total} บทเรียน
              </span>
            </div>
            <div className="learn-cards">
              {lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  className={`learn-card learn-card-${lesson.status}`}
                  disabled={lesson.status === 'locked'}
                  title={
                    lesson.status === 'locked'
                      ? 'จบบทเรียนก่อนหน้าก่อนปลดล็อก'
                      : lesson.description
                  }
                >
                  <div className="learn-card-status">
                    {lesson.status === 'completed' ? '✓' : lesson.status === 'unlocked' ? '▶' : '🔒'}
                  </div>
                  <div className="learn-card-body">
                    <div className="learn-card-title">{lesson.title}</div>
                    <div className="learn-card-desc">{lesson.description}</div>
                    <div className="learn-card-meta">
                      <span className="label-aside">~{lesson.estimateMinutes} นาที</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
