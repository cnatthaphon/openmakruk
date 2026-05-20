// 🎓 Tutorial tab.
//
// Loads lessons from /content/lessons/all.json (via lib/content) and
// groups them by group. Clicking a card opens LessonView, which
// dispatches on the lesson's `demo` field to render the right
// interactive body.
//
// Progress (per-lesson completion) lives in localStorage. A lesson is
// "unlocked" iff it's the first one OR the previous one in the same
// flat order is completed.

import { useEffect, useMemo, useState } from 'react';
import { loadLessons } from '../lib/content';
import {
  isLessonCompleted,
  loadLessonProgress,
  markLessonCompleted,
  saveLessonProgress,
  type LessonProgress,
} from '../lib/learnProgress';
import {
  LESSON_GROUP_LABELS,
  LESSON_GROUP_ORDER,
  type LessonContent,
  type LessonGroup,
} from '../lib/lessonSchema';
import { LessonView } from './LessonView';

type LessonStatus = 'locked' | 'unlocked' | 'completed';

function statusFor(
  lesson: LessonContent,
  idx: number,
  lessons: LessonContent[],
  progress: LessonProgress,
): LessonStatus {
  if (isLessonCompleted(progress, lesson.id)) return 'completed';
  if (idx === 0) return 'unlocked';
  if (isLessonCompleted(progress, lessons[idx - 1].id)) return 'unlocked';
  return 'locked';
}

export function LearnPage() {
  const [lessons, setLessons] = useState<LessonContent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LessonProgress>(() => loadLessonProgress());
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  useEffect(() => {
    loadLessons()
      .then((data) => setLessons(data))
      .catch((err) => setLoadError(String(err)));
  }, []);

  useEffect(() => {
    saveLessonProgress(progress);
  }, [progress]);

  const handleMarkComplete = (lessonId: string) => {
    setProgress((p) => markLessonCompleted(p, lessonId));
  };

  const handleBackToList = () => setActiveLessonId(null);

  const groupedLessons = useMemo(() => {
    if (!lessons) return null;
    const map = new Map<LessonGroup, { lesson: LessonContent; idx: number }[]>();
    lessons.forEach((lesson, idx) => {
      const list = map.get(lesson.group) ?? [];
      list.push({ lesson, idx });
      map.set(lesson.group, list);
    });
    return map;
  }, [lessons]);

  if (activeLessonId && lessons) {
    const lesson = lessons.find((l) => l.id === activeLessonId);
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

  if (loadError) {
    return (
      <div className="learn-page">
        <p className="puzzles-error">⚠ โหลด content ไม่สำเร็จ: {loadError}</p>
      </div>
    );
  }

  if (!lessons || !groupedLessons) {
    return (
      <div className="learn-page">
        <p className="label-aside">กำลังโหลดบทเรียน ...</p>
      </div>
    );
  }

  const totalCompleted = lessons.filter((l) => isLessonCompleted(progress, l.id)).length;
  const totalMinutes = lessons.reduce((sum, l) => sum + l.estimateMinutes, 0);
  const interactiveCount = lessons.filter((l) => l.demo).length;

  return (
    <div className="learn-page">
      <header className="learn-header">
        <h2>🎓 ฝึกเดินหมากรุกไทย</h2>
        <p>เส้นทางจากเริ่มต้นจนเล่นเป็น · ทำตามลำดับ · ครบหมดแล้วพร้อมเข้าโหมดจัดอันดับ</p>
        <div className="learn-overall-progress">
          ความคืบหน้า: <strong>{totalCompleted}</strong> / {lessons.length} บทเรียน
          <span className="label-aside"> · ทั้งหมด ~{totalMinutes} นาที</span>
        </div>
        <p className="learn-status-note">
          🎮 บทที่มี interactive demo: <strong>{interactiveCount}</strong> / {lessons.length} ·
          content เก็บใน <code>content/lessons/all.json</code> · เติมเพิ่มได้โดยไม่ต้อง rebuild
        </p>
      </header>

      {LESSON_GROUP_ORDER.map((g) => {
        const groupLessons = groupedLessons.get(g) ?? [];
        if (groupLessons.length === 0) return null;
        const groupCompleted = groupLessons.filter(({ lesson }) =>
          isLessonCompleted(progress, lesson.id),
        ).length;
        return (
          <section key={g} className="learn-group">
            <div className="learn-group-header">
              <h3>{LESSON_GROUP_LABELS[g]}</h3>
              <span className="label-aside">
                {groupCompleted} / {groupLessons.length} บทเรียน
              </span>
            </div>
            <div className="learn-cards">
              {groupLessons.map(({ lesson, idx }) => {
                const st = statusFor(lesson, idx, lessons, progress);
                const interactive = !!lesson.demo;
                return (
                  <button
                    key={lesson.id}
                    className={`learn-card learn-card-${st}`}
                    disabled={st === 'locked'}
                    onClick={() => setActiveLessonId(lesson.id)}
                    title={st === 'locked' ? 'จบบทเรียนก่อนหน้าก่อนปลดล็อก' : lesson.description}
                  >
                    <div className="learn-card-status">
                      {st === 'completed' ? '✓' : st === 'unlocked' ? '▶' : '🔒'}
                    </div>
                    <div className="learn-card-body">
                      <div className="learn-card-title">
                        {lesson.title}
                        {interactive && (
                          <span className="learn-interactive-badge" title="มี interactive demo">
                            {' '}🎮
                          </span>
                        )}
                      </div>
                      <div className="learn-card-desc">{lesson.description}</div>
                      <div className="learn-card-meta">
                        <span className="label-aside">~{lesson.estimateMinutes} นาที</span>
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
