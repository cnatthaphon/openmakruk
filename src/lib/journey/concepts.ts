// Content → Concept mapping (issue #7).
//
// Lessons, puzzles, and drills don't carry explicit Concept tags in
// their content JSON. Rather than force every content file to grow a
// `concepts` array, we map their EXISTING taxonomy (lesson group,
// puzzle category, drill family) onto the journey Concept enum here —
// one data-driven table, tunable without touching content or the
// reducer.
//
// Pure module: only `import type` from the contract, so it runs under
// `node --test --experimental-strip-types`.

import type { Concept } from './contract';

/** Lesson `group` (from lessonSchema.ts LessonGroup) → concepts it
 *  introduces. A completed lesson bumps each listed concept. */
const LESSON_GROUP_CONCEPTS: Readonly<Record<string, Concept[]>> = {
  basics: ['piece-movement'],
  pieces: ['piece-movement'],
  rules: ['piece-movement', 'capture-trade'],
  counting: ['endgame-counting', 'endgame-bare-king'],
  strategy: ['opening-development', 'opening-center-control'],
  endgame: ['endgame-promotion', 'endgame-bare-king'],
};

/** Puzzle `category` → concepts it exercises. */
const PUZZLE_CATEGORY_CONCEPTS: Readonly<Record<string, Concept[]>> = {
  'mate-1': ['mate-recognition'],
  'mate-2': ['mate-recognition', 'mate-threat-awareness'],
  tactic: ['capture-trade', 'tactical-hanging-piece'],
  counting: ['endgame-counting'],
  defense: ['check-detection', 'mate-threat-awareness'],
};

/** All counting drills teach the same family. */
const DRILL_CONCEPTS: readonly Concept[] = ['endgame-counting', 'endgame-bare-king'];

export function conceptsForLessonGroup(group: string): Concept[] {
  return LESSON_GROUP_CONCEPTS[group] ?? [];
}

export function conceptsForPuzzleCategory(category: string): Concept[] {
  return PUZZLE_CATEGORY_CONCEPTS[category] ?? [];
}

export function conceptsForDrill(_drillId: string): Concept[] {
  // All current drills are counting drills; the arg is kept so a
  // future per-drill mapping doesn't change the call sites.
  return [...DRILL_CONCEPTS];
}
