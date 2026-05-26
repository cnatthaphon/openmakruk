// Title system — rating-derived honorific that appears alongside the
// player's name across the platform (profile header, leaderboard rows,
// share text, certs). Identity comes before the number — saying "ฉัน
// เป็นขุนทอง" is more shareable than "ฉัน rating 1200".
//
// Tiers borrow from Thai martial / royal court vocabulary so the
// titles feel native to the Makruk domain rather than imported
// chess-rank terminology:
//
//    < 1000   มือใหม่               — Novice (no title prefix shown)
//   1000+     ผู้เล่น                — Player
//   1200+     ขุนทอง                — Gold Khun (the "first real title")
//   1400+     ขุนเหล็ก              — Iron Khun
//   1600+     นักรบ                 — Warrior
//   1800+     อาจารย์               — Master
//   2000+     ปรมาจารย์             — Grand Master
//   2200+     จอมพล                — Field Marshal (Boss bot's tier)
//
// Each tier has a colour token so the UI can render the title with
// a subtle accent — gold for ขุนทอง, steel for ขุนเหล็ก, crimson for
// นักรบ, etc. Colours are conservative (low saturation) to stay
// professional, not loud.

export type TitleTier = {
  /** Lower bound (inclusive). */
  minRating: number;
  /** Title text shown next to the player name. */
  th: string;
  /** Single-line description for tooltip / about page. */
  descTh: string;
  /** Hex colour used as the title text/border accent. */
  color: string;
  /** Optional decorative icon — kept text-only by default to avoid
   *  the emoji-font fallback issue on Linux/headless. */
  icon?: string;
};

export const TITLE_TIERS: TitleTier[] = [
  { minRating: 0,    th: 'มือใหม่',    descTh: 'เริ่มเล่นใหม่ · ยังสะสมเกม', color: '#9aa68a' },
  { minRating: 1000, th: 'ผู้เล่น',     descTh: 'เคยจบเกมแล้ว ระดับ casual', color: '#c0c0c0' },
  { minRating: 1200, th: 'ขุนทอง',    descTh: 'ระดับ club beginner — เริ่มจริงจัง', color: '#cd7f32' },
  { minRating: 1400, th: 'ขุนเหล็ก',  descTh: 'ระดับ club intermediate', color: '#a8a8b0' },
  { minRating: 1600, th: 'นักรบ',     descTh: 'ระดับนักเล่นที่แข็ง', color: '#d4a23c' },
  { minRating: 1800, th: 'อาจารย์',   descTh: 'ระดับครู · ผู้เล่นกองหลัก', color: '#a37bf5' },
  { minRating: 2000, th: 'ปรมาจารย์', descTh: 'ระดับ master · ยากชนะ', color: '#7aba7f' },
  { minRating: 2200, th: 'จอมพล',    descTh: 'ระดับเทพ — เทียบเท่า Boss bot', color: '#e85a4a' },
];

/** Resolve a rating to its title tier. Returns the highest tier the
 *  rating qualifies for. Never returns null — every rating, even 0,
 *  maps to "มือใหม่". */
export function titleForRating(rating: number): TitleTier {
  let chosen = TITLE_TIERS[0];
  for (const tier of TITLE_TIERS) {
    if (rating >= tier.minRating) chosen = tier;
  }
  return chosen;
}

/** Distance in rating points to the next title above the current one,
 *  or null if already at the top. Used by the Profile page to show
 *  "อีก 47 แต้มจะเป็นขุนทอง" prompts. */
export function ratingToNextTitle(rating: number): {
  next: TitleTier;
  remaining: number;
} | null {
  for (const tier of TITLE_TIERS) {
    if (tier.minRating > rating) {
      return { next: tier, remaining: tier.minRating - rating };
    }
  }
  return null;
}
