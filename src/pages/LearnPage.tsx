// Tutorial / Learn tab — the full pathway from "what is a Makruk
// board" to "how to win a King-and-Rook endgame".
//
// This commit ships the COMPLETE LESSON OUTLINE — every step of the
// pathway is present with its title, description, time estimate, and
// status. The interactive demo bodies for each lesson land in Phase 2
// (next commit); this page already shows users where they're going.

export type LessonStatus = 'locked' | 'unlocked' | 'completed';

export type Lesson = {
  id: string;
  title: string;
  description: string;
  group: LessonGroup;
  estimateMinutes: number;
  status: LessonStatus;
};

export type LessonGroup = 'basics' | 'pieces' | 'rules' | 'counting' | 'strategy' | 'endgame';

const GROUP_LABELS: Record<LessonGroup, string> = {
  basics:   '1. พื้นฐานกระดาน',
  pieces:   '2. รู้จักตัวหมาก',
  rules:    '3. กฎเกม (รุก / รุกจน / อับ)',
  counting: '4. นับศักดิ์ (Counting)',
  strategy: '5. กลยุทธ์การเล่น',
  endgame:  '6. ปลายเกม (Endgame)',
};

const PLANNED_LESSONS: Lesson[] = [
  // 1. Basics
  { id: 'basics-board',     title: 'รู้จักกระดาน 8×8',         description: 'ระบบพิกัด a1-h8, สีช่อง, แนวตรง/แนวเฉียง',                                  group: 'basics',   estimateMinutes: 3, status: 'unlocked' },
  { id: 'basics-init',      title: 'ตำแหน่งเริ่มต้น',          description: 'ขุน-เม็ด-โคน-ม้า-เรือ ตามตำแหน่งเริ่ม · เบี้ยอยู่แถว 3',                       group: 'basics',   estimateMinutes: 3, status: 'locked' },
  { id: 'basics-notation',  title: 'การบันทึกตาเดิน',         description: 'รูปแบบ UCI (e3e4) vs SAN (Pe4)',                                              group: 'basics',   estimateMinutes: 3, status: 'locked' },

  // 2. Pieces
  { id: 'piece-king',       title: 'ขุน (King) เดินยังไง',    description: 'เดินได้ 1 ช่องทุกทิศทาง (8 ช่อง) · ห้ามเข้าช่องที่ถูกรุก',                       group: 'pieces',   estimateMinutes: 4, status: 'locked' },
  { id: 'piece-met',        title: 'เม็ด (Met) เดินยังไง',    description: 'เดิน 1 ช่องเฉียงเท่านั้น (4 ช่อง) · ตัวที่อ่อนสุดในกลุ่ม power piece',           group: 'pieces',   estimateMinutes: 4, status: 'locked' },
  { id: 'piece-khon',       title: 'โคน (Khon) เดินยังไง',    description: 'ตรงหน้า 1 + เฉียง 4 ช่อง = 5 ช่อง · มีทิศ "หน้า" ขึ้นกับสี',                     group: 'pieces',   estimateMinutes: 4, status: 'locked' },
  { id: 'piece-knight',     title: 'ม้า (Horse) เดินยังไง',   description: 'L-shape เหมือนหมากรุกสากล · กระโดดข้ามตัวอื่นได้',                                group: 'pieces',   estimateMinutes: 5, status: 'locked' },
  { id: 'piece-rook',       title: 'เรือ (Rook) เดินยังไง',   description: 'แนวตรง/ขวาง ไกลเท่าไหร่ก็ได้ · ตัวที่แรงที่สุดในระยะไกล',                       group: 'pieces',   estimateMinutes: 4, status: 'locked' },
  { id: 'piece-bia',        title: 'เบี้ย (Bia) เดินยังไง',   description: 'ตรง 1 ช่อง · จับเฉียง 1 · ไม่มี en-passant',                                   group: 'pieces',   estimateMinutes: 5, status: 'locked' },
  { id: 'piece-promo',      title: 'เบี้ยหงาย (Promotion)',   description: 'ถึงแถว 6 (ขาว) / แถว 3 (ดำ) → กลายเป็นเม็ด',                                    group: 'pieces',   estimateMinutes: 4, status: 'locked' },

  // 3. Rules
  { id: 'rule-capture',     title: 'การจับ (Capture)',        description: 'เดินเข้าช่องที่มีตัวฝ่ายตรงข้าม · ห้ามจับตัวฝ่ายเดียวกัน',                       group: 'rules',    estimateMinutes: 3, status: 'locked' },
  { id: 'rule-check',       title: 'รุก (Check)',             description: 'ขุนถูกขู่จับ — ต้องตอบสนอง: หนี / บล็อก / จับตัวที่รุก',                          group: 'rules',    estimateMinutes: 5, status: 'locked' },
  { id: 'rule-mate',        title: 'รุกจน (Checkmate)',       description: 'รุก + หนีไม่ได้ + บล็อกไม่ได้ + จับไม่ได้ = ชนะ',                              group: 'rules',    estimateMinutes: 6, status: 'locked' },
  { id: 'rule-stale',       title: 'อับ (Stalemate)',         description: 'ไม่ถูกรุก แต่ไม่มีตาเดินที่ถูกกฎ = เสมอ (ไม่ใช่แพ้)',                          group: 'rules',    estimateMinutes: 4, status: 'locked' },
  { id: 'rule-3fold',       title: '3-fold repetition',       description: 'ตำแหน่งเดียวกันเกิด 3 ครั้ง = ยื่นเสมอได้',                                     group: 'rules',    estimateMinutes: 4, status: 'locked' },

  // 4. Counting (Makruk-specific!)
  { id: 'count-intro',      title: 'นับศักดิ์คืออะไร',         description: 'กฎเฉพาะของ Makruk · ฝ่ายแข็งกว่าต้องไล่รุกจนภายในเวลาที่กำหนด',                  group: 'counting', estimateMinutes: 6, status: 'locked' },
  { id: 'count-bareking',   title: 'นับเสียดาย (Bare king)',  description: 'ฝ่ายอ่อนเหลือขุนเปลือย · นับขึ้นกับตัวฝ่ายแข็ง',                                  group: 'counting', estimateMinutes: 6, status: 'locked' },
  { id: 'count-table',      title: 'ตาราง count limit',       description: '2R = 8 · 1R+อื่น = 16 · 2 minor = 32 · 1 minor = 64',                          group: 'counting', estimateMinutes: 5, status: 'locked' },
  { id: 'count-strategy',   title: 'กลยุทธ์ไล่นับ',           description: 'ใช้ count limit สั้น = บีบ · count ยาว = ไม่ทันต้องเสมอ',                          group: 'counting', estimateMinutes: 8, status: 'locked' },

  // 5. Strategy
  { id: 'strat-open',       title: 'หลักการเปิดเกม',          description: 'พัฒนาตัวออก · ครองศูนย์ · ขุนปลอดภัย',                                            group: 'strategy', estimateMinutes: 8, status: 'locked' },
  { id: 'strat-activity',   title: 'Activity vs material',    description: 'ตัวหมากที่ขยับได้คล่อง > ตัวที่ปิด',                                              group: 'strategy', estimateMinutes: 6, status: 'locked' },
  { id: 'strat-trade',      title: 'เมื่อไหร่แลกหมาก',          description: 'แลกตอนได้เปรียบ · เลี่ยงตอนตามหลัง',                                              group: 'strategy', estimateMinutes: 6, status: 'locked' },
  { id: 'strat-tactic',     title: 'ยุทธวิธีพื้นฐาน',          description: 'Fork · Pin · Skewer · Discovered attack',                                       group: 'strategy', estimateMinutes: 10, status: 'locked' },

  // 6. Endgame
  { id: 'end-kr-vs-k',      title: 'K + เรือ vs K',           description: 'ปลายเกมพื้นฐานที่สุด · ไล่ขุนเข้ามุม',                                            group: 'endgame',  estimateMinutes: 8, status: 'locked' },
  { id: 'end-km-vs-k',      title: 'K + เม็ด vs K',            description: 'ต้องใช้กลยุทธ์ขุนช่วยเม็ดไล่',                                                   group: 'endgame',  estimateMinutes: 8, status: 'locked' },
  { id: 'end-kss-vs-k',     title: 'K + โคน + โคน vs K',      description: 'มักเสมอใน Makruk (ต่างจาก chess)',                                                group: 'endgame',  estimateMinutes: 7, status: 'locked' },
  { id: 'end-knn-vs-k',     title: 'K + ม้า + ม้า vs K',      description: 'ไล่ยาก count limit 32 — ฝึก mate pattern',                                       group: 'endgame',  estimateMinutes: 8, status: 'locked' },
  { id: 'end-krm-vs-k',     title: 'K + เรือ + เม็ด vs K',    description: 'ปลายเกมที่ชนะแน่นอน · ฝึกเทคนิคเร็ว',                                              group: 'endgame',  estimateMinutes: 8, status: 'locked' },
  { id: 'end-counting',     title: 'ใช้นับศักดิ์เสมอ',         description: 'ตามหลังเยอะ → ลากเข้าปลายเกม → ไล่ไม่จน → เสมอ',                                 group: 'endgame',  estimateMinutes: 8, status: 'locked' },
];

export function LearnPage() {
  const groups: LessonGroup[] = ['basics', 'pieces', 'rules', 'counting', 'strategy', 'endgame'];

  return (
    <div className="learn-page">
      <header className="learn-header">
        <h2>🎓 ฝึกเดินหมากรุกไทย</h2>
        <p>
          เส้นทางจากเริ่มต้นจนเล่นเป็น · ทำตามลำดับ · ครบหมดแล้วพร้อมเข้าโหมดจัดอันดับ
        </p>
        <p className="learn-status-note">
          🚧 v0.1: โครงหลักครบทุกบท ({PLANNED_LESSONS.length} บทเรียน) — interactive demos
          ใส่ใน Phase 2 (กดปุ่มยังไม่เปิด)
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
                    {lesson.status === 'completed'
                      ? '✓'
                      : lesson.status === 'unlocked'
                        ? '▶'
                        : '🔒'}
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

      <footer className="learn-footer">
        <p className="label-aside">
          รวม {PLANNED_LESSONS.length} บทเรียน · ประมาณ{' '}
          {PLANNED_LESSONS.reduce((sum, l) => sum + l.estimateMinutes, 0)} นาที
        </p>
      </footer>
    </div>
  );
}
