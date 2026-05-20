// Tutorial / Learn tab. Two states:
//   1. List view  → grid of lesson cards, grouped by phase
//   2. Lesson view → opened when a card is clicked, delegates to
//                    LessonView.tsx
//
// Lesson completion is tracked via lib/learnProgress (localStorage)
// and "unlocked" status is computed: a lesson is unlocked once the
// previous lesson in the same group is completed, OR if it's the
// first lesson in the very first group.

import { useEffect, useState } from 'react';
import {
  isLessonCompleted,
  loadLessonProgress,
  markLessonCompleted,
  saveLessonProgress,
  type LessonProgress,
} from '../lib/learnProgress';
import { LessonView } from './LessonView';

export type LessonStatus = 'locked' | 'unlocked' | 'completed';

export type LessonGroup = 'basics' | 'pieces' | 'rules' | 'counting' | 'strategy' | 'endgame';

export type Lesson = {
  id: string;
  title: string;
  description: string;
  group: LessonGroup;
  estimateMinutes: number;
};

const GROUP_LABELS: Record<LessonGroup, string> = {
  basics:   '1. พื้นฐานกระดาน',
  pieces:   '2. รู้จักตัวหมาก',
  rules:    '3. กฎเกม (รุก / รุกจน / อับ)',
  counting: '4. นับศักดิ์ (Counting)',
  strategy: '5. กลยุทธ์การเล่น',
  endgame:  '6. ปลายเกม (Endgame)',
};

const LESSONS: Lesson[] = [
  // 1. Basics
  { id: 'basics-board',     title: 'รู้จักกระดาน 8×8',         description: 'ระบบพิกัด a1-h8, สีช่อง, แนวตรง/แนวเฉียง',                                  group: 'basics',   estimateMinutes: 3 },
  { id: 'basics-init',      title: 'ตำแหน่งเริ่มต้น',          description: 'ขุน-เม็ด-โคน-ม้า-เรือ ตามตำแหน่งเริ่ม · เบี้ยอยู่แถว 3',                       group: 'basics',   estimateMinutes: 3 },
  { id: 'basics-notation',  title: 'การบันทึกตาเดิน',         description: 'รูปแบบ UCI (e3e4) vs SAN (Pe4)',                                              group: 'basics',   estimateMinutes: 3 },
  // 2. Pieces  (Phase 2B interactive bodies live in LessonView)
  { id: 'piece-king',       title: 'ขุน (King) เดินยังไง',    description: 'เดินได้ 1 ช่องทุกทิศทาง (8 ช่อง) · ห้ามเข้าช่องที่ถูกรุก',                       group: 'pieces',   estimateMinutes: 4 },
  { id: 'piece-met',        title: 'เม็ด (Met) เดินยังไง',    description: 'เดิน 1 ช่องเฉียงเท่านั้น (4 ช่อง) · ตัวที่อ่อนสุดในกลุ่ม power piece',           group: 'pieces',   estimateMinutes: 4 },
  { id: 'piece-khon',       title: 'โคน (Khon) เดินยังไง',    description: 'ตรงหน้า 1 + เฉียง 4 ช่อง = 5 ช่อง · มีทิศ "หน้า" ขึ้นกับสี',                     group: 'pieces',   estimateMinutes: 4 },
  { id: 'piece-knight',     title: 'ม้า (Horse) เดินยังไง',   description: 'L-shape เหมือนหมากรุกสากล · กระโดดข้ามตัวอื่นได้',                                group: 'pieces',   estimateMinutes: 5 },
  { id: 'piece-rook',       title: 'เรือ (Rook) เดินยังไง',   description: 'แนวตรง/ขวาง ไกลเท่าไหร่ก็ได้ · ตัวที่แรงที่สุดในระยะไกล',                       group: 'pieces',   estimateMinutes: 4 },
  { id: 'piece-bia',        title: 'เบี้ย (Bia) เดินยังไง',   description: 'ตรง 1 ช่อง · จับเฉียง 1 · ไม่มี en-passant',                                   group: 'pieces',   estimateMinutes: 5 },
  { id: 'piece-promo',      title: 'เบี้ยหงาย (Promotion)',   description: 'ถึงแถว 6 (ขาว) / แถว 3 (ดำ) → กลายเป็นเม็ด',                                    group: 'pieces',   estimateMinutes: 4 },
  // 3. Rules
  { id: 'rule-capture',     title: 'การจับ (Capture)',        description: 'เดินเข้าช่องที่มีตัวฝ่ายตรงข้าม · ห้ามจับตัวฝ่ายเดียวกัน',                       group: 'rules',    estimateMinutes: 3 },
  { id: 'rule-check',       title: 'รุก (Check)',             description: 'ขุนถูกขู่จับ — ต้องตอบสนอง: หนี / บล็อก / จับตัวที่รุก',                          group: 'rules',    estimateMinutes: 5 },
  { id: 'rule-mate',        title: 'รุกจน (Checkmate)',       description: 'รุก + หนีไม่ได้ + บล็อกไม่ได้ + จับไม่ได้ = ชนะ',                              group: 'rules',    estimateMinutes: 6 },
  { id: 'rule-stale',       title: 'อับ (Stalemate)',         description: 'ไม่ถูกรุก แต่ไม่มีตาเดินที่ถูกกฎ = เสมอ (ไม่ใช่แพ้)',                          group: 'rules',    estimateMinutes: 4 },
  { id: 'rule-3fold',       title: '3-fold repetition',       description: 'ตำแหน่งเดียวกันเกิด 3 ครั้ง = ยื่นเสมอได้',                                     group: 'rules',    estimateMinutes: 4 },
  // 4. Counting
  { id: 'count-intro',      title: 'นับศักดิ์คืออะไร',         description: 'กฎเฉพาะของ Makruk · ฝ่ายแข็งกว่าต้องไล่รุกจนภายในเวลาที่กำหนด',                  group: 'counting', estimateMinutes: 6 },
  { id: 'count-bareking',   title: 'นับเสียดาย (Bare king)',  description: 'ฝ่ายอ่อนเหลือขุนเปลือย · นับขึ้นกับตัวฝ่ายแข็ง',                                  group: 'counting', estimateMinutes: 6 },
  { id: 'count-table',      title: 'ตาราง count limit',       description: '2R = 8 · 1R+อื่น = 16 · 2 minor = 32 · 1 minor = 64',                          group: 'counting', estimateMinutes: 5 },
  { id: 'count-strategy',   title: 'กลยุทธ์ไล่นับ',           description: 'ใช้ count limit สั้น = บีบ · count ยาว = ไม่ทันต้องเสมอ',                          group: 'counting', estimateMinutes: 8 },
  // 5. Strategy
  { id: 'strat-open',       title: 'หลักการเปิดเกม',          description: 'พัฒนาตัวออก · ครองศูนย์ · ขุนปลอดภัย',                                            group: 'strategy', estimateMinutes: 8 },
  { id: 'strat-activity',   title: 'Activity vs material',    description: 'ตัวหมากที่ขยับได้คล่อง > ตัวที่ปิด',                                              group: 'strategy', estimateMinutes: 6 },
  { id: 'strat-trade',      title: 'เมื่อไหร่แลกหมาก',          description: 'แลกตอนได้เปรียบ · เลี่ยงตอนตามหลัง',                                              group: 'strategy', estimateMinutes: 6 },
  { id: 'strat-tactic',     title: 'ยุทธวิธีพื้นฐาน',          description: 'Fork · Pin · Skewer · Discovered attack',                                       group: 'strategy', estimateMinutes: 10 },
  // 6. Endgame
  { id: 'end-kr-vs-k',      title: 'K + เรือ vs K',           description: 'ปลายเกมพื้นฐานที่สุด · ไล่ขุนเข้ามุม',                                            group: 'endgame',  estimateMinutes: 8 },
  { id: 'end-km-vs-k',      title: 'K + เม็ด vs K',            description: 'ต้องใช้กลยุทธ์ขุนช่วยเม็ดไล่',                                                   group: 'endgame',  estimateMinutes: 8 },
  { id: 'end-kss-vs-k',     title: 'K + โคน + โคน vs K',      description: 'มักเสมอใน Makruk (ต่างจาก chess)',                                                group: 'endgame',  estimateMinutes: 7 },
  { id: 'end-knn-vs-k',     title: 'K + ม้า + ม้า vs K',      description: 'ไล่ยาก count limit 32 — ฝึก mate pattern',                                       group: 'endgame',  estimateMinutes: 8 },
  { id: 'end-krm-vs-k',     title: 'K + เรือ + เม็ด vs K',    description: 'ปลายเกมที่ชนะแน่นอน · ฝึกเทคนิคเร็ว',                                              group: 'endgame',  estimateMinutes: 8 },
  { id: 'end-counting',     title: 'ใช้นับศักดิ์เสมอ',         description: 'ตามหลังเยอะ → ลากเข้าปลายเกม → ไล่ไม่จน → เสมอ',                                 group: 'endgame',  estimateMinutes: 8 },
];

const HAS_INTERACTIVE = new Set([
  'piece-king', 'piece-met', 'piece-khon', 'piece-knight', 'piece-rook', 'piece-bia',
]);

function statusFor(lesson: Lesson, idx: number, progress: LessonProgress): LessonStatus {
  if (isLessonCompleted(progress, lesson.id)) return 'completed';
  if (idx === 0) return 'unlocked';
  // unlock if the immediately-previous lesson is completed
  const prev = LESSONS[idx - 1];
  if (isLessonCompleted(progress, prev.id)) return 'unlocked';
  return 'locked';
}

export function LearnPage() {
  const [progress, setProgress] = useState<LessonProgress>(() => loadLessonProgress());
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  // Persist whenever progress changes
  useEffect(() => {
    saveLessonProgress(progress);
  }, [progress]);

  const handleSelectLesson = (lessonId: string) => {
    setActiveLessonId(lessonId);
  };

  const handleBackToList = () => {
    setActiveLessonId(null);
  };

  const handleMarkComplete = (lessonId: string) => {
    setProgress((p) => markLessonCompleted(p, lessonId));
  };

  if (activeLessonId) {
    const lesson = LESSONS.find((l) => l.id === activeLessonId);
    if (lesson) {
      return (
        <LessonView
          lesson={lesson}
          isCompleted={isLessonCompleted(progress, lesson.id)}
          onMarkComplete={() => handleMarkComplete(lesson.id)}
          onBack={handleBackToList}
        />
      );
    }
  }

  const groups: LessonGroup[] = ['basics', 'pieces', 'rules', 'counting', 'strategy', 'endgame'];
  const totalCompleted = LESSONS.filter((l) => isLessonCompleted(progress, l.id)).length;
  const totalMinutes = LESSONS.reduce((sum, l) => sum + l.estimateMinutes, 0);

  return (
    <div className="learn-page">
      <header className="learn-header">
        <h2>🎓 ฝึกเดินหมากรุกไทย</h2>
        <p>
          เส้นทางจากเริ่มต้นจนเล่นเป็น · ทำตามลำดับ · ครบหมดแล้วพร้อมเข้าโหมดจัดอันดับ
        </p>
        <div className="learn-overall-progress">
          ความคืบหน้า: <strong>{totalCompleted}</strong> / {LESSONS.length} บทเรียน
          <span className="label-aside"> · ทั้งหมด ~{totalMinutes} นาที</span>
        </div>
        <p className="learn-status-note">
          ✅ Phase 2B: 6 บทเดินตัวหมาก interactive แล้ว ·
          🚧 บทที่เหลือ (กฎ / นับศักดิ์ / กลยุทธ์ / endgame) จะเปิดใน Phase 2C
        </p>
      </header>

      {groups.map((g) => {
        const groupLessons = LESSONS.map((l, i) => ({ l, i })).filter(({ l }) => l.group === g);
        const groupCompleted = groupLessons.filter(({ l }) =>
          isLessonCompleted(progress, l.id),
        ).length;
        return (
          <section key={g} className="learn-group">
            <div className="learn-group-header">
              <h3>{GROUP_LABELS[g]}</h3>
              <span className="label-aside">
                {groupCompleted} / {groupLessons.length} บทเรียน
              </span>
            </div>
            <div className="learn-cards">
              {groupLessons.map(({ l, i }) => {
                const st = statusFor(l, i, progress);
                const interactive = HAS_INTERACTIVE.has(l.id);
                return (
                  <button
                    key={l.id}
                    className={`learn-card learn-card-${st}`}
                    disabled={st === 'locked'}
                    onClick={() => handleSelectLesson(l.id)}
                    title={
                      st === 'locked'
                        ? 'จบบทเรียนก่อนหน้าก่อนปลดล็อก'
                        : l.description
                    }
                  >
                    <div className="learn-card-status">
                      {st === 'completed' ? '✓' : st === 'unlocked' ? '▶' : '🔒'}
                    </div>
                    <div className="learn-card-body">
                      <div className="learn-card-title">
                        {l.title}
                        {interactive && (
                          <span className="learn-interactive-badge" title="มี interactive demo">
                            {' '}🎮
                          </span>
                        )}
                      </div>
                      <div className="learn-card-desc">{l.description}</div>
                      <div className="learn-card-meta">
                        <span className="label-aside">~{l.estimateMinutes} นาที</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
