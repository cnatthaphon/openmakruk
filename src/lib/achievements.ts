// Achievement badges — single-fire rewards that unlock when the user
// hits a milestone (X puzzles solved, X games won, etc.). Stored in
// localStorage; once unlocked, stays unlocked across sessions.
//
// The achievement DEFINITIONS are static (this file). The UNLOCK
// STATE is per-user in localStorage. New achievements added here
// auto-appear in the Profile UI; users who already met the criteria
// retroactively unlock on their next session because the predicates
// re-evaluate against current stats.
//
// Add an achievement:
//   1. Append an entry to ACHIEVEMENTS below
//   2. (Optional) Bump ACHIEVEMENTS_VERSION if predicate semantics
//      changed and existing users should re-evaluate.

import { defineStore } from './stores';
import type { UserStats } from './stats';
import type { PuzzleProgress } from './puzzleProgress';
import type { LessonProgress } from './learnProgress';
import type { Puzzle } from './puzzleSchema';
import { loadGauntlet } from './gauntlet';

const ACHIEVEMENTS_VERSION = 1;

export type AchievementDef = {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Decides if this user qualifies given their current state. */
  predicate: (ctx: AchievementContext) => boolean;
};

export type AchievementContext = {
  stats: UserStats;
  puzzleProgress: PuzzleProgress;
  lessonProgress: LessonProgress;
  puzzles: Puzzle[];
  streakCurrent: number;
  streakLongest: number;
};

export type UnlockedAchievements = {
  /** id → ms timestamp of first unlock. */
  unlocked: Record<string, number>;
};

const blank = (): UnlockedAchievements => ({ unlocked: {} });

const store = defineStore<UnlockedAchievements>({
  key: 'openmakruk_achievements',
  version: ACHIEVEMENTS_VERSION,
  default: blank,
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<UnlockedAchievements>;
    return {
      unlocked: obj.unlocked && typeof obj.unlocked === 'object' ? obj.unlocked : {},
    };
  },
});

export function loadUnlocks(): UnlockedAchievements {
  return store.load();
}

export function saveUnlocks(u: UnlockedAchievements): void {
  store.save(u);
}

// ----------------------------------------------------------------------
// Achievement catalog
// ----------------------------------------------------------------------

const countSolvedByCategory = (
  progress: PuzzleProgress,
  puzzles: Puzzle[],
  category: string,
): number => {
  const byId = new Map(puzzles.map((p) => [p.id, p]));
  let count = 0;
  for (const id of Object.keys(progress.solved)) {
    const p = byId.get(id);
    if (p && p.category === category) count++;
  }
  return count;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  // ─── Beginner milestones ─────────────────────────────────────
  {
    id: 'first-game',
    name: 'เริ่มต้น',
    description: 'เล่นเกมแรกของคุณ',
    icon: '🌱',
    predicate: ({ stats }) => stats.totalGames >= 1,
  },
  {
    id: 'first-puzzle',
    name: 'นักแก้ปริศนา',
    description: 'แก้ปริศนาแรก',
    icon: '🧩',
    predicate: ({ puzzleProgress }) => Object.keys(puzzleProgress.solved).length >= 1,
  },
  {
    id: 'first-lesson',
    name: 'นักเรียน',
    description: 'จบบทเรียนแรก',
    icon: '📚',
    predicate: ({ lessonProgress }) => lessonProgress.completed.size >= 1,
  },

  // ─── Puzzle milestones ────────────────────────────────────────
  {
    id: 'puzzles-10',
    name: 'ขยันแก้',
    description: 'แก้ปริศนา 10 ข้อ',
    icon: '⭐',
    predicate: ({ puzzleProgress }) => Object.keys(puzzleProgress.solved).length >= 10,
  },
  {
    id: 'puzzles-25',
    name: 'นักล่า tactic',
    description: 'แก้ปริศนา 25 ข้อ',
    icon: '🌟',
    predicate: ({ puzzleProgress }) => Object.keys(puzzleProgress.solved).length >= 25,
  },
  {
    id: 'mate-1-all',
    name: 'มือสังหาร mate-1',
    description: 'แก้ปริศนาประเภท "รุกจน 1 ตา" ทุกข้อ',
    icon: '♚',
    predicate: ({ puzzleProgress, puzzles }) => {
      const total = puzzles.filter((p) => p.category === 'mate-1').length;
      return total > 0 && countSolvedByCategory(puzzleProgress, puzzles, 'mate-1') >= total;
    },
  },
  {
    id: 'counting-all',
    name: 'นักนับศักดิ์',
    description: 'แก้ปริศนาประเภท "นับศักดิ์" ทุกข้อ',
    icon: '⏱️',
    predicate: ({ puzzleProgress, puzzles }) => {
      const total = puzzles.filter((p) => p.category === 'counting').length;
      return total > 0 && countSolvedByCategory(puzzleProgress, puzzles, 'counting') >= total;
    },
  },

  // ─── Game milestones ──────────────────────────────────────────
  {
    id: 'win-easy',
    name: 'ชนะคนง่าย',
    description: 'ชนะ CPU ระดับ "ง่าย" อย่างน้อย 1 ครั้ง',
    icon: '🏆',
    predicate: ({ stats }) => stats.byLevel.easy.wins >= 1,
  },
  {
    id: 'win-medium',
    name: 'ชนะคนเก่ง',
    description: 'ชนะ CPU ระดับ "ปานกลาง" อย่างน้อย 1 ครั้ง',
    icon: '🏅',
    predicate: ({ stats }) => stats.byLevel.medium.wins >= 1,
  },
  {
    id: 'win-hard',
    name: 'ชนะคนแข็ง',
    description: 'ชนะ CPU ระดับ "ยาก" อย่างน้อย 1 ครั้ง',
    icon: '🎖️',
    predicate: ({ stats }) => stats.byLevel.hard.wins >= 1,
  },
  {
    id: 'win-master',
    name: 'มาสเตอร์สังหารมาสเตอร์',
    description: 'ชนะ CPU ระดับ "มาสเตอร์" อย่างน้อย 1 ครั้ง',
    icon: '👑',
    predicate: ({ stats }) => stats.byLevel.master.wins >= 1,
  },
  {
    id: 'games-10',
    name: 'แข่งขัน 10 รอบ',
    description: 'เล่นเกมจบ 10 เกม',
    icon: '🎮',
    predicate: ({ stats }) => stats.totalGames >= 10,
  },
  {
    id: 'rating-1200',
    name: 'rating 1200+',
    description: 'rating ของคุณถึง 1200',
    icon: '📈',
    predicate: ({ stats }) => stats.rating >= 1200,
  },
  {
    id: 'rating-1500',
    name: 'rating 1500+',
    description: 'rating ของคุณถึง 1500',
    icon: '📈',
    predicate: ({ stats }) => stats.rating >= 1500,
  },

  // ─── Lesson milestones ────────────────────────────────────────
  {
    id: 'lessons-10',
    name: 'นักเรียนขยัน',
    description: 'จบบทเรียน 10 บท',
    icon: '📖',
    predicate: ({ lessonProgress }) => lessonProgress.completed.size >= 10,
  },

  // ─── Streak milestones ────────────────────────────────────────
  {
    id: 'streak-3',
    name: 'streak 3 วัน',
    description: 'เข้ามาเล่นติดต่อกัน 3 วัน',
    icon: '🔥',
    predicate: ({ streakCurrent }) => streakCurrent >= 3,
  },
  {
    id: 'streak-7',
    name: 'streak 1 สัปดาห์',
    description: 'เข้ามาเล่นติดต่อกัน 7 วัน',
    icon: '🔥',
    predicate: ({ streakCurrent }) => streakCurrent >= 7,
  },
  {
    id: 'streak-30',
    name: 'streak 1 เดือน',
    description: 'เข้ามาเล่นติดต่อกัน 30 วัน',
    icon: '🔥',
    predicate: ({ streakCurrent }) => streakCurrent >= 30,
  },

  // ─── Gauntlet ─────────────────────────────────────────────────
  {
    id: 'gauntlet-master',
    name: 'Gauntlet Master',
    description: 'ชนะ CPU ทั้ง 4 ระดับติดต่อกันใน Gauntlet',
    icon: '🏰',
    predicate: () => {
      const g = loadGauntlet();
      return g.history.some((h) => h.outcome === 'completed');
    },
  },
];

/**
 * Run all predicates against the current state, returning the set of
 * achievement ids that are NEWLY unlocked (not in `unlocked` already).
 * Caller persists the new unlocks + may surface them in UI.
 */
export function evaluateAchievements(
  ctx: AchievementContext,
  unlocks: UnlockedAchievements,
): { newlyUnlocked: AchievementDef[]; updated: UnlockedAchievements } {
  const newlyUnlocked: AchievementDef[] = [];
  const updated = { ...unlocks, unlocked: { ...unlocks.unlocked } };
  const now = Date.now();
  for (const a of ACHIEVEMENTS) {
    if (a.id in updated.unlocked) continue;
    try {
      if (a.predicate(ctx)) {
        updated.unlocked[a.id] = now;
        newlyUnlocked.push(a);
      }
    } catch {
      // bad predicate — skip
    }
  }
  return { newlyUnlocked, updated };
}
