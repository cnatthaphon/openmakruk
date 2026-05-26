// Daily login reward — gamified streak milestones.
//
// Triggers a one-time-per-day toast when the user opens the site, with
// escalating message intensity at streak milestones (1, 3, 7, 14, 30,
// 100 consecutive days). The streak itself is owned by lib/streak.ts;
// this module owns "did we already announce today's reward" so the
// toast doesn't re-fire on every reload.
//
// Why not pure CSS / passive: the milestone moments (7-day, 30-day)
// are the *exact* points chess.com and Duolingo retain users — a
// silent streak counter doesn't carry the same weight as an explicit
// "🎉 7 วันติด" pop-up that feels like a win.

import { defineStore } from './stores';
import { loadStreak } from './streak';

const REWARD_VERSION = 1;

type DailyRewardState = {
  /** Last date (YYYY-MM-DD, Bangkok local) we announced the reward. */
  lastAnnouncedDate: string | null;
};

const store = defineStore<DailyRewardState>({
  key: 'openmakruk_daily_reward',
  version: REWARD_VERSION,
  default: () => ({ lastAnnouncedDate: null }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<DailyRewardState>;
    return {
      lastAnnouncedDate:
        typeof obj.lastAnnouncedDate === 'string' ? obj.lastAnnouncedDate : null,
    };
  },
});

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export type DailyReward = {
  /** Toast text in Thai. */
  message: string;
  /** Visual tone for the toast — drives the celebration intensity. */
  tier: 'small' | 'medium' | 'big' | 'epic';
  /** The streak day this reward marks. */
  streakDay: number;
};

const MILESTONES: { day: number; tier: DailyReward['tier']; build: (d: number) => string }[] = [
  { day: 100, tier: 'epic',   build: (d) => `🌟 100 วันติด! ${d} วันแล้วที่อยู่กับเรา · คุณคือนักเล่นตัวจริง` },
  { day: 30,  tier: 'big',    build: (d) => `🏆 ${d} วันติดต่อกัน · นิสัยเล่นทุกวันเริ่มแล้ว` },
  { day: 14,  tier: 'big',    build: () => `💪 2 อาทิตย์ติดต่อกัน · ฟอร์มขึ้นแล้ว` },
  { day: 7,   tier: 'medium', build: (d) => `🔥 ${d} วันติด · ติด habit แล้ว` },
  { day: 3,   tier: 'medium', build: (d) => `⚡ ${d} วันติด · เริ่มมาก่อตัวแล้ว` },
  { day: 1,   tier: 'small',  build: () => `👋 ยินดีต้อนรับกลับ · เริ่มสะสม streak วันแรก` },
];

/** Check if there's a reward to announce today and return it. Marks
 *  the day as announced as a side effect — calling twice on the same
 *  day returns null the second time. */
export function claimDailyRewardIfDue(): DailyReward | null {
  const state = store.load();
  const today = todayKey();
  if (state.lastAnnouncedDate === today) return null;

  const streak = loadStreak();
  const day = streak.current;
  if (day < 1) return null;

  // Pick the highest milestone the streak qualifies for. Day-1 entry
  // exists so first-day visitors get a friendly welcome.
  const milestone = MILESTONES.find((m) => day >= m.day);
  if (!milestone) return null;

  store.save({ lastAnnouncedDate: today });
  return {
    message: milestone.build(day),
    tier: milestone.tier,
    streakDay: day,
  };
}
