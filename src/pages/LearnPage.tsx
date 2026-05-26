// 🎓 Tutorial tab.
//
// Loads lessons from /content/lessons/all.json (via lib/content) and
// renders the list grouped by group. Clicking a card opens LessonView,
// which is driven by the lesson's `steps` field (or v1 `body`/`demo`).
//
// Resume flow: progress.lastViewedId is bumped every time the user
// opens a card. The header shows a "เรียนต่อ" shortcut to that lesson
// so reload-then-resume is one click.
//
// Next-lesson flow: when finishing a lesson, the next still-unlocked
// lesson (linear order) is offered directly inside LessonView so the
// user can blow through the tutorial without bouncing back to the
// list every time.

import { useEffect, useMemo, useState } from 'react';
import { loadLessons } from '../lib/content';
import {
  isLessonCompleted,
  loadLessonProgress,
  markLessonCompleted,
  recordLessonViewed,
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
import { navigate } from '../lib/router';
import { SkeletonGrid } from '../components/Skeleton';

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

function findNextLesson(
  current: LessonContent,
  lessons: LessonContent[],
  progress: LessonProgress,
): LessonContent | null {
  const currentIdx = lessons.findIndex((l) => l.id === current.id);
  if (currentIdx === -1) return null;
  // Look forward for the next not-yet-completed lesson
  for (let i = currentIdx + 1; i < lessons.length; i++) {
    if (!isLessonCompleted(progress, lessons[i].id)) {
      return lessons[i];
    }
  }
  // All ahead are completed — just return the next one if any
  return lessons[currentIdx + 1] ?? null;
}

type Props = {
  /** Optional lesson id from the route. When present and matching a
   *  lesson in the catalog, the page opens it directly — powers
   *  `/#/learn/<id>` deep links + share/return-to-this-lesson flows. */
  initialLessonId?: string | null;
};

export function LearnPage({ initialLessonId = null }: Props = {}) {
  const [lessons, setLessons] = useState<LessonContent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LessonProgress>(() => loadLessonProgress());
  const [activeLessonId, setActiveLessonId] = useState<string | null>(initialLessonId);

  useEffect(() => {
    loadLessons()
      .then((data) => setLessons(data))
      .catch((err) => setLoadError(String(err)));
  }, []);

  useEffect(() => {
    saveLessonProgress(progress);
  }, [progress]);

  // Open lesson straight from the route once the catalog is loaded.
  useEffect(() => {
    if (initialLessonId && lessons?.some((l) => l.id === initialLessonId)) {
      setActiveLessonId(initialLessonId);
    }
  }, [initialLessonId, lessons]);

  // Mirror active selection back to the URL so deep-links + browser
  // back behave intuitively (matches PuzzlesPage pattern).
  useEffect(() => {
    navigate({ tab: 'learn', id: activeLessonId });
  }, [activeLessonId]);

  const handleOpenLesson = (lessonId: string) => {
    setProgress((p) => recordLessonViewed(p, lessonId));
    setActiveLessonId(lessonId);
  };

  const handleMarkComplete = (lessonId: string) => {
    setProgress((p) => markLessonCompleted(p, lessonId));
  };

  const handleBackToList = () => setActiveLessonId(null);

  const handleNextLessonFromView = () => {
    if (!lessons || !activeLessonId) return;
    const current = lessons.find((l) => l.id === activeLessonId);
    if (!current) return;
    // Use the LATEST progress (may have just been mutated by complete)
    const latest = loadLessonProgress();
    const next = findNextLesson(current, lessons, latest);
    if (next) {
      setProgress((p) => recordLessonViewed(p, next.id));
      setActiveLessonId(next.id);
    } else {
      setActiveLessonId(null);
    }
  };

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

  // ---- detail view ----
  if (activeLessonId && lessons) {
    const lesson = lessons.find((l) => l.id === activeLessonId);
    if (lesson) {
      const nextLesson = findNextLesson(lesson, lessons, progress);
      return (
        <LessonView
          lesson={lesson}
          isCompleted={isLessonCompleted(progress, lesson.id)}
          onMarkComplete={() => handleMarkComplete(lesson.id)}
          onBack={handleBackToList}
          onNextLesson={nextLesson ? handleNextLessonFromView : undefined}
        />
      );
    }
  }

  // ---- list view ----
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
        <SkeletonGrid count={6} withThumb={false} />
      </div>
    );
  }

  const totalCompleted = lessons.filter((l) => isLessonCompleted(progress, l.id)).length;
  const totalMinutes = lessons.reduce((sum, l) => sum + l.estimateMinutes, 0);
  const interactiveCount = lessons.filter((l) => l.demo || l.steps).length;

  const lastViewed = progress.lastViewedId
    ? lessons.find((l) => l.id === progress.lastViewedId)
    : null;
  const lastViewedUnlocked = lastViewed
    ? statusFor(
        lastViewed,
        lessons.findIndex((l) => l.id === lastViewed.id),
        lessons,
        progress,
      ) !== 'locked'
    : false;

  return (
    <div className="learn-page">
      <header className="learn-header">
        <h2>🎓 บทเรียนหมากรุกไทย</h2>
        <p>เส้นทางจากเริ่มต้นจนเล่นเป็น · ทำตามลำดับ · ครบหมดแล้วพร้อมเข้าโหมดจัดอันดับ</p>
        <div className="learn-overall-progress">
          ความคืบหน้า: <strong>{totalCompleted}</strong> / {lessons.length} บทเรียน
          <span className="label-aside"> · ทั้งหมด ~{totalMinutes} นาที</span>
        </div>
        {lastViewed && lastViewedUnlocked && (
          <button
            className="learn-resume-button"
            onClick={() => handleOpenLesson(lastViewed.id)}
            title={lastViewed.description}
          >
            ▶ เรียนต่อจาก: {lastViewed.title}
          </button>
        )}
        {/* Dev-mode-only status. The path / rebuild note is useful for
            content authors editing locally; useless (and confusing)
            for end users. Hidden in production via Vite's static
            replace of import.meta.env.DEV. */}
        {import.meta.env.DEV && (
          <p className="learn-status-note">
            🎮 บทที่มี demo/steps: <strong>{interactiveCount}</strong> / {lessons.length} ·
            content เก็บใน <code>content/lessons/all.json</code> · เติมได้โดยไม่ต้อง rebuild
          </p>
        )}
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
                const interactive = !!(lesson.demo || lesson.steps);
                const stepCount = lesson.steps?.length ?? (lesson.body ? 1 : 0) + (lesson.demo ? 1 : 0);
                return (
                  <button
                    key={lesson.id}
                    className={`learn-card learn-card-${st}`}
                    disabled={st === 'locked'}
                    onClick={() => handleOpenLesson(lesson.id)}
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
                        <span className="label-aside">
                          ~{lesson.estimateMinutes} นาที{stepCount > 1 ? ` · ${stepCount} ขั้น` : ''}
                        </span>
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
