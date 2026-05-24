// Per-lesson completion bookkeeping. Lives in localStorage via the
// versioned stores module so it survives page reloads but never leaves
// the browser — same privacy posture as the rest of the user state.

import { defineStore } from './stores';

const LESSON_PROGRESS_VERSION = 1;

export type LessonProgress = {
  completed: Set<string>;
  /** Most recently OPENED lesson id (not necessarily completed). */
  lastViewedId: string | null;
};

/** On-disk shape — Sets don't survive JSON.stringify. */
type Persisted = {
  completed: string[];
  lastViewedId: string | null;
};

const store = defineStore<Persisted>({
  key: 'openmakruk_lesson_progress',
  version: LESSON_PROGRESS_VERSION,
  default: () => ({ completed: [], lastViewedId: null }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<Persisted>;
    return {
      completed: Array.isArray(obj.completed)
        ? obj.completed.filter((id): id is string => typeof id === 'string')
        : [],
      lastViewedId: typeof obj.lastViewedId === 'string' ? obj.lastViewedId : null,
    };
  },
});

export function loadLessonProgress(): LessonProgress {
  const persisted = store.load();
  return {
    completed: new Set(persisted.completed),
    lastViewedId: persisted.lastViewedId,
  };
}

export function saveLessonProgress(progress: LessonProgress): void {
  store.save({
    completed: Array.from(progress.completed),
    lastViewedId: progress.lastViewedId,
  });
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
