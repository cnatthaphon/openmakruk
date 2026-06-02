// Journey checkpoint ladder (issue #7) — DATA, not logic.
//
// A beginner→intermediate path expressed purely as content ids +
// category counts + concept thresholds + activity counters. The
// reducer evaluates these against JourneyState; adding or retuning a
// checkpoint is a data edit here, never a code change (that's the
// "schema-driven, no page-specific logic" acceptance criterion).
//
// Ids are stable — never rename a shipped checkpoint id (cleared ids
// persist in the player's JourneyState). Content ids referenced below
// are verified against the shipped content:
//   lessons   public/content/lessons/all.json  (basics-board, …)
//   drills    src/lib/countingDrill.ts          (l1-k-rr-vs-k, …)
//   puzzle categories: mate-1 / mate-2 / tactic / counting / defense

import type { Checkpoint } from './contract';

export const JOURNEY_CHECKPOINTS: readonly Checkpoint[] = [
  {
    id: 'cp-first-steps',
    title: 'ก้าวแรก',
    subtitle: 'รู้จักกระดานและการตั้งหมาก',
    requirements: [
      { kind: 'lesson-completed', lessonId: 'basics-board' },
      { kind: 'lesson-completed', lessonId: 'basics-init' },
    ],
    tags: ['piece-movement'],
    unlocks: ['cp-know-the-pieces'],
  },
  {
    id: 'cp-know-the-pieces',
    title: 'รู้จักหมากทุกตัว',
    subtitle: 'เดินหมากเป็นทุกชนิด',
    requirements: [{ kind: 'concept-mastered', concept: 'piece-movement', minScore: 0.5 }],
    tags: ['piece-movement'],
    unlocks: ['cp-first-mate'],
  },
  {
    id: 'cp-first-mate',
    title: 'รุกจนครั้งแรก',
    subtitle: 'แก้ปริศนารุกจน 1 ตา ให้ได้ 3 ข้อ',
    requirements: [
      { kind: 'puzzle-category-solved', category: 'mate-1', count: 3 },
      { kind: 'concept-mastered', concept: 'mate-recognition', minScore: 0.25 },
    ],
    tags: ['mate-recognition'],
    unlocks: ['cp-tactics-starter'],
  },
  {
    id: 'cp-tactics-starter',
    title: 'นักยุทธวิธีมือใหม่',
    subtitle: 'แก้ปริศนายุทธวิธี 5 ข้อ',
    requirements: [{ kind: 'puzzle-category-solved', category: 'tactic', count: 5 }],
    tags: ['tactical-fork', 'tactical-hanging-piece'],
    unlocks: ['cp-counting-basics'],
  },
  {
    id: 'cp-counting-basics',
    title: 'นับศักดิ์เป็น',
    subtitle: 'ผ่าน drill นับหมากระดับแรก',
    requirements: [
      { kind: 'drill-passed', drillId: 'l1-k-rr-vs-k', minStars: 1 },
      { kind: 'concept-mastered', concept: 'endgame-counting', minScore: 0.25 },
    ],
    tags: ['endgame-counting', 'endgame-bare-king'],
    unlocks: ['cp-first-games'],
  },
  {
    id: 'cp-first-games',
    title: 'ลงสนามจริง',
    subtitle: 'เล่นจบเกมกับบอท 3 เกม',
    requirements: [{ kind: 'games-played', minCount: 3 }],
    tags: ['opening-development'],
    unlocks: ['cp-rated-climber'],
  },
  {
    id: 'cp-rated-climber',
    title: 'ไต่อันดับ',
    subtitle: 'เล่น rated 5 เกม และไปถึง rating 1100',
    requirements: [
      { kind: 'games-played', minCount: 5, rated: true },
      { kind: 'rating-reached', minRating: 1100 },
    ],
    tags: ['opening-center-control'],
    unlocks: ['cp-mate-in-two'],
  },
  {
    id: 'cp-mate-in-two',
    title: 'มองเกมสองตา',
    subtitle: 'แก้ปริศนารุกจน 2 ตา 5 ข้อ + เข้าใจการขู่รุกจน',
    requirements: [
      { kind: 'puzzle-category-solved', category: 'mate-2', count: 5 },
      { kind: 'concept-mastered', concept: 'mate-threat-awareness', minScore: 0.4 },
    ],
    tags: ['mate-recognition', 'mate-threat-awareness'],
    unlocks: ['cp-defender'],
  },
  {
    id: 'cp-defender',
    title: 'ตั้งรับเป็น',
    subtitle: 'แก้ปริศนาการป้องกัน 3 ข้อ',
    requirements: [{ kind: 'puzzle-category-solved', category: 'defense', count: 3 }],
    tags: ['check-detection', 'mate-threat-awareness'],
    unlocks: ['cp-challenger'],
  },
  {
    id: 'cp-challenger',
    title: 'นักท้าดวล',
    subtitle: 'จบ async challenge อย่างน้อย 1 ครั้ง',
    requirements: [{ kind: 'challenge-completed' }],
    tags: ['opening-development'],
  },
];
