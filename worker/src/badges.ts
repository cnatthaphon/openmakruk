// Badge catalog — data, not classes. Adding a new badge = append one
// entry below. Adding a new CATEGORY = expand the union types and add
// a check function in evaluateBadges(). The shape is intentionally
// closed: every badge has a tier and an unlock condition derived
// from cheap server-side aggregates (user.rating, game counts, etc.).
//
// Why server-side evaluation (vs client-side):
//   * Cheat-proof: a user who edits localStorage to claim "I have
//     gold rating badge" doesn't get a database row, so the public
//     cert URL won't render anything.
//   * Cross-device: badges follow the user account, not the browser.
//   * Single source of truth for marketing/share assets.

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export type BadgeCategory =
  | 'welcome'       // zero-friction unlock on first auth — "you're in"
  | 'rating'        // climbing the rating ladder
  | 'puzzles'       // puzzle solver count + accuracy
  | 'streak'        // daily activity
  | 'bot-conqueror' // beating bot characters of each personality
  | 'region';       // top N in your home province

export type BadgeDef = {
  id: string;
  category: BadgeCategory;
  tier: BadgeTier;
  /** Emoji shown in the badge chip + cert page. */
  icon: string;
  /** Thai label. */
  nameTh: string;
  /** Thai one-liner about what this badge means. */
  descTh: string;
  /** Numeric threshold the check function compares against. Stored
   *  here (rather than inlined in the check) so the UI can show
   *  "X / threshold" progress bars without duplicating the value. */
  threshold: number;
};

export const BADGES: BadgeDef[] = [
  // ─── Welcome (zero-friction first-visit unlock) ─────────────────
  // Triggers as soon as the user has any record in the users table —
  // i.e. they enabled cloud sync. Visual audit feedback (Phase 9K):
  // a fresh Profile with 18 locked badges feels "I have nothing".
  // This badge flips the framing to "you have 1, here are 17 more".
  { id: 'welcome', category: 'welcome', tier: 'bronze',
    icon: '👋', nameTh: 'ผู้มาใหม่', threshold: 1,
    descTh: 'ยินดีต้อนรับสู่ OpenMakruk · ปลดล็อกอัตโนมัติเมื่อเปิด cloud sync' },

  // ─── Rating ladder ──────────────────────────────────────────────
  { id: 'rating-1100', category: 'rating', tier: 'bronze',
    icon: '🥉', nameTh: 'Apprentice', threshold: 1100,
    descTh: 'rating ถึง 1100 · เริ่มแกะ tactic ออก' },
  { id: 'rating-1400', category: 'rating', tier: 'silver',
    icon: '🥈', nameTh: 'Player', threshold: 1400,
    descTh: 'rating ถึง 1400 · ระดับ club casual' },
  { id: 'rating-1700', category: 'rating', tier: 'gold',
    icon: '🥇', nameTh: 'Veteran', threshold: 1700,
    descTh: 'rating ถึง 1700 · ระดับนักเล่นกองหลัก' },
  { id: 'rating-2000', category: 'rating', tier: 'diamond',
    icon: '💎', nameTh: 'Champion', threshold: 2000,
    descTh: 'rating ถึง 2000 · จอมยุทธ์' },

  // ─── Puzzle solver ──────────────────────────────────────────────
  { id: 'puzzles-10',  category: 'puzzles', tier: 'bronze',
    icon: '🧩', nameTh: 'Solver', threshold: 10,
    descTh: 'แก้ puzzle 10 ตัว' },
  { id: 'puzzles-50',  category: 'puzzles', tier: 'silver',
    icon: '🧩', nameTh: 'Tactician', threshold: 50,
    descTh: 'แก้ puzzle 50 ตัว' },
  { id: 'puzzles-100', category: 'puzzles', tier: 'gold',
    icon: '🧩', nameTh: 'Master Solver', threshold: 100,
    descTh: 'แก้ puzzle 100 ตัว · ระดับน้อยคนทำได้' },

  // ─── Bot conqueror — beat a bot character of each tier ──────────
  // These compute from `games` table where opponent like 'bot:%' AND outcome='win'.
  { id: 'bot-rookie',  category: 'bot-conqueror', tier: 'bronze',
    icon: '⚔️', nameTh: 'Rookie Slayer', threshold: 1,
    descTh: 'ชนะ bot Rookie ตัวแรก' },
  { id: 'bot-veteran', category: 'bot-conqueror', tier: 'silver',
    icon: '⚔️', nameTh: 'Veteran Slayer', threshold: 1,
    descTh: 'ชนะ bot Veteran ตัวแรก' },
  { id: 'bot-master',  category: 'bot-conqueror', tier: 'gold',
    icon: '⚔️', nameTh: 'Master Slayer', threshold: 1,
    descTh: 'ชนะ bot Master ตัวแรก' },
  { id: 'bot-all-personalities', category: 'bot-conqueror', tier: 'diamond',
    icon: '🏆', nameTh: 'Personality Master', threshold: 7,
    descTh: 'ชนะ bot ทั้ง 7 personalities (ระดับใดก็ได้)' },
  { id: 'bot-boss',    category: 'bot-conqueror', tier: 'diamond',
    icon: '👑', nameTh: 'Boss Slayer', threshold: 1,
    descTh: 'ชนะ Fairy-Stockfish Boss — ระดับ legendary' },

  // ─── Streak (daily activity) ────────────────────────────────────
  // Threshold value is days; server reads from games.created_at and
  // counts unique-day buckets including current day.
  { id: 'streak-3',  category: 'streak', tier: 'bronze',
    icon: '🔥', nameTh: 'Warming Up', threshold: 3,
    descTh: 'เข้ามาเล่น 3 วันติด' },
  { id: 'streak-7',  category: 'streak', tier: 'silver',
    icon: '🔥', nameTh: 'Weekly Habit', threshold: 7,
    descTh: 'เข้ามาเล่น 7 วันติด' },
  { id: 'streak-30', category: 'streak', tier: 'gold',
    icon: '🔥', nameTh: 'Month Locked-In', threshold: 30,
    descTh: 'เข้ามาเล่น 30 วันติด' },

  // ─── Region top-3 ───────────────────────────────────────────────
  // Threshold = the rank slot to qualify (1=gold, 2=silver, 3=bronze).
  // Recomputed every game; falls off if someone overtakes.
  { id: 'region-top-3', category: 'region', tier: 'bronze',
    icon: '📍', nameTh: 'Province Top 3', threshold: 3,
    descTh: 'ติดอันดับ 3 ของจังหวัด · match score' },
  { id: 'region-top-1', category: 'region', tier: 'gold',
    icon: '📍', nameTh: 'Province Champion', threshold: 1,
    descTh: 'อันดับ 1 ของจังหวัด · ราชา/ราชินีของจังหวัด' },
];

export const BADGES_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

export function findBadge(id: string): BadgeDef | null {
  return BADGES_BY_ID.get(id) ?? null;
}

/** Generate a unique-ish, URL-safe slug for a freshly-unlocked badge.
 *  Format: `<6-char-base36>-<badge-id>` keeps the badge id grep-able
 *  in production logs while obscuring the user-id mapping. */
export function makeShareableSlug(badgeId: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${rand}-${badgeId}`;
}
