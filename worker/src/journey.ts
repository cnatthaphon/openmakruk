// Journey path — explicit curriculum that translates "how do I climb
// the leaderboard?" into a concrete checklist per level.
//
// Levels mirror the rating ladder badges but each gate is reached by
// completing CHECKPOINTS, not just hitting a rating. Lets a 1050-rated
// user with 100 puzzles solved still feel like they've progressed.
//
// Design: data-only (no classes). Each level lists checkpoints whose
// truthiness is computed from cheap server aggregates. Adding a new
// checkpoint = drop a row in the catalog + add one query branch in
// computeJourney().

export type LevelId =
  | 'beginner'
  | 'apprentice'
  | 'player'
  | 'veteran'
  | 'champion'
  | 'master';

export type CheckpointKind =
  | 'rating-gte'         // user.rating >= value
  | 'wins-vs-cpu-gte'    // games WHERE opponent = `cpuLevel` AND outcome='win' >= value
  | 'puzzles-solved-gte' // distinct puzzle_solves with outcome='solved' >= value
  | 'bot-tier-beaten'    // ≥1 verified win against a bot of given tier
  | 'streak-days-gte'    // consecutive-day streak >= value
  | 'province-rank-lte'  // user's province rank <= value (1 = champion)
  | 'beat-boss';         // win vs bot:fairy-stockfish-boss

export type Checkpoint = {
  id: string;
  kind: CheckpointKind;
  /** Threshold value semantically tied to `kind`. Encoded as a string
   *  so kinds with categorical thresholds (cpu level, bot tier) can
   *  share the schema with numeric ones. */
  value: string;
  /** Thai label shown in the UI. */
  labelTh: string;
};

export type LevelDef = {
  id: LevelId;
  nameTh: string;
  /** Rating threshold that unlocks this level (also gating). */
  ratingFloor: number;
  /** Cosmetic — icon for the badge chip + journey UI. */
  icon: string;
  /** Checkpoints to complete TO REACH the next level. The final level
   *  (master) has no next-level checkpoints. */
  checkpoints: Checkpoint[];
};

export const LEVELS: LevelDef[] = [
  {
    id: 'beginner',
    nameTh: 'มือใหม่',
    ratingFloor: 0,
    icon: '🥷',
    checkpoints: [
      { id: 'win-easy-3', kind: 'wins-vs-cpu-gte', value: 'easy:3',
        labelTh: 'ชนะ CPU ระดับ easy 3 ครั้ง' },
      { id: 'puzzles-5', kind: 'puzzles-solved-gte', value: '5',
        labelTh: 'แก้ puzzle 5 ตัว' },
      { id: 'beat-rookie', kind: 'bot-tier-beaten', value: 'rookie',
        labelTh: 'ชนะ bot Rookie ตัวแรก' },
    ],
  },
  {
    id: 'apprentice',
    nameTh: 'ลูกศิษย์ (Apprentice)',
    ratingFloor: 1100,
    icon: '🥉',
    checkpoints: [
      { id: 'rating-1100', kind: 'rating-gte', value: '1100',
        labelTh: 'rating ถึง 1100' },
      { id: 'win-medium-3', kind: 'wins-vs-cpu-gte', value: 'medium:3',
        labelTh: 'ชนะ CPU ระดับ medium 3 ครั้ง' },
      { id: 'puzzles-25', kind: 'puzzles-solved-gte', value: '25',
        labelTh: 'แก้ puzzle 25 ตัว' },
      { id: 'beat-veteran', kind: 'bot-tier-beaten', value: 'veteran',
        labelTh: 'ชนะ bot Veteran ตัวแรก' },
    ],
  },
  {
    id: 'player',
    nameTh: 'นักหมาก (Player)',
    ratingFloor: 1400,
    icon: '🥈',
    checkpoints: [
      { id: 'rating-1400', kind: 'rating-gte', value: '1400',
        labelTh: 'rating ถึง 1400' },
      { id: 'win-hard-3', kind: 'wins-vs-cpu-gte', value: 'hard:3',
        labelTh: 'ชนะ CPU ระดับ hard 3 ครั้ง' },
      { id: 'puzzles-50', kind: 'puzzles-solved-gte', value: '50',
        labelTh: 'แก้ puzzle 50 ตัว' },
      { id: 'streak-7', kind: 'streak-days-gte', value: '7',
        labelTh: 'streak 7 วันติด' },
    ],
  },
  {
    id: 'veteran',
    nameTh: 'รุ่นเก๋า (Veteran)',
    ratingFloor: 1700,
    icon: '🥇',
    checkpoints: [
      { id: 'rating-1700', kind: 'rating-gte', value: '1700',
        labelTh: 'rating ถึง 1700' },
      { id: 'win-master-1', kind: 'wins-vs-cpu-gte', value: 'master:1',
        labelTh: 'ชนะ CPU ระดับ master 1 ครั้ง' },
      { id: 'puzzles-100', kind: 'puzzles-solved-gte', value: '100',
        labelTh: 'แก้ puzzle 100 ตัว' },
      { id: 'beat-bot-master', kind: 'bot-tier-beaten', value: 'master',
        labelTh: 'ชนะ bot Master ตัวแรก' },
      { id: 'province-top-3', kind: 'province-rank-lte', value: '3',
        labelTh: 'ติดอันดับ 3 ของจังหวัด' },
    ],
  },
  {
    id: 'champion',
    nameTh: 'แชมป์ (Champion)',
    ratingFloor: 2000,
    icon: '💎',
    checkpoints: [
      { id: 'rating-2000', kind: 'rating-gte', value: '2000',
        labelTh: 'rating ถึง 2000' },
      { id: 'beat-boss', kind: 'beat-boss', value: '1',
        labelTh: 'ชนะ Fairy-Stockfish Boss · legendary' },
      { id: 'province-top-1', kind: 'province-rank-lte', value: '1',
        labelTh: 'อันดับ 1 ของจังหวัด' },
    ],
  },
  {
    id: 'master',
    nameTh: 'จอมยุทธ์ (Master)',
    ratingFloor: 2200,
    icon: '👑',
    checkpoints: [], // top of the ladder
  },
];

export function findLevel(id: LevelId): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** Highest level the user's rating qualifies for. */
export function levelForRating(rating: number): LevelId {
  let result: LevelId = 'beginner';
  for (const l of LEVELS) {
    if (rating >= l.ratingFloor) result = l.id;
  }
  return result;
}
