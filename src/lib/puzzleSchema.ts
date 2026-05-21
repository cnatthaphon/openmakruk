// Data schema for puzzles served from /content/puzzles/all.json.
//
// One Puzzle = a starting FEN + a forced sequence of correct moves
// (alternating user / opponent in UCI form). The player presents the
// user's first move, validates, plays the canned opponent reply,
// repeats until the user has played every odd-indexed move correctly.
//
// Adding a puzzle = appending a JSON entry. No code change required.

export type PuzzleCategory = 'mate-1' | 'mate-2' | 'tactic' | 'counting';

export type Puzzle = {
  id: string;
  fen: string;                  // starting position
  category: PuzzleCategory;
  rating: number;               // Elo target — used for category ordering
  toMove: 'white' | 'black';    // whose move it is at fen
  solution: string[];           // UCI moves: [user0, opp1, user2, opp3, ...]
  prompt: string;               // "ขาวเดิน — รุกจน 1 ตา"
  hint?: string;                // shown after 2 wrong attempts
  themes: string[];             // ["back-rank", "fork"] etc.
  source?: string;              // attribution if applicable
  /** Explicit user-facing goal in Thai for puzzles where the solution
   * length isn't self-explanatory. e.g. "ชนะตัวภายใน 3 ตา",
   * "ไล่นับให้ทันก่อน count 8". Rendered prominently above the board
   * when set. Falls back to category meta otherwise. */
  goal?: string;
  /** Detailed post-solve explanation — the WHY behind the solution.
   * Shown after the user wins so they walk away with a lesson. */
  explanation?: string;
};

export const PUZZLE_CATEGORY_META: Record<
  PuzzleCategory,
  { title: string; description: string; emoji: string }
> = {
  'mate-1': {
    title: 'รุกจนใน 1 ตา',
    description: 'ฝึกสายตา — หาตาเดียวที่ปิดเกม',
    emoji: '♚',
  },
  'mate-2': {
    title: 'รุกจนใน 2 ตา',
    description: 'รู้จักลำดับ — ขั้นแรกผูก ขั้นสองรุกจน',
    emoji: '♛',
  },
  tactic: {
    title: 'ยุทธวิธี (Tactics)',
    description: 'fork, pin, skewer ที่เกิดบ่อยใน Makruk',
    emoji: '⚔️',
  },
  counting: {
    title: 'ปลายเกมนับศักดิ์',
    description: 'ไล่จนทันก่อน count limit',
    emoji: '⏱️',
  },
};

export const PUZZLE_CATEGORY_ORDER: PuzzleCategory[] = [
  'mate-1',
  'mate-2',
  'tactic',
  'counting',
];
