// Per-lesson completion bookkeeping. Lives in localStorage so it
// survives page reloads but never leaves the browser — same privacy
// posture as the rest of the user state.

const STORAGE_KEY = 'openmakruk_lesson_progress';

export type LessonProgress = {
  completed: Set<string>;
  /** Most recently OPENED lesson id (not necessarily completed). */
  lastViewedId: string | null;
};

type Persisted = {
  completed: string[]; // arrays don't survive JSON.stringify(Set)
  lastViewedId?: string | null;
};

export function loadLessonProgress(): LessonProgress {
  if (typeof window === 'undefined')
    return { completed: new Set(), lastViewedId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: new Set(), lastViewedId: null };
    const parsed = JSON.parse(raw) as Persisted;
    return {
      completed: new Set(parsed.completed ?? []),
      lastViewedId: parsed.lastViewedId ?? null,
    };
  } catch {
    return { completed: new Set(), lastViewedId: null };
  }
}

export function saveLessonProgress(progress: LessonProgress): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: Persisted = {
      completed: Array.from(progress.completed),
      lastViewedId: progress.lastViewedId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full / disabled — silently ignore
  }
}

export function markLessonCompleted(
  progress: LessonProgress,
  lessonId: string,
): LessonProgress {
  if (progress.completed.has(lessonId)) return progress;
  const completed = new Set(progress.completed);
  completed.add(lessonId);
  return { ...progress, completed };
}

export function recordLessonViewed(
  progress: LessonProgress,
  lessonId: string,
): LessonProgress {
  if (progress.lastViewedId === lessonId) return progress;
  return { ...progress, lastViewedId: lessonId };
}

export function isLessonCompleted(
  progress: LessonProgress,
  lessonId: string,
): boolean {
  return progress.completed.has(lessonId);
}
