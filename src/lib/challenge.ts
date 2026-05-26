// Challenge target — when set, the Play tab is locked to a specific
// bot character. The active engine plays as that bot's personality;
// recorded games count against that specific bot id (e.g.
// `bot:attacker-master`) instead of the generic difficulty bucket
// so the Bot Hall of Fame stats reflect real head-to-head.
//
// Usage:
//   1. BotDetailPage's "ท้าดวล" button → setChallengeTarget(bot)
//      + set('engineId', 'personality:<bot.personality>') + navigate(play)
//   2. App Play tab reads the target on mount → shows a banner and
//      uses target.botId for backend.recordGame's opponent field
//   3. User clicks "เปลี่ยนคู่ต่อสู้" or starts a new picker → clearChallengeTarget()
//
// Persists in localStorage so a reload doesn't drop the challenge.

import { defineStore } from './stores';

const CHALLENGE_VERSION = 1;

export type ChallengeTarget = {
  /** Server-side user id of the bot — e.g. `bot:attacker-master`. */
  botId: string;
  displayName: string;
  avatar: string;
  personality: string;
  tier: 'rookie' | 'veteran' | 'master' | 'boss' | string;
  /** Snapshot of bot's rating at challenge time — used to display
   *  "vs Bot (rating 2000)" without a fresh fetch. */
  rating: number;
  /** Unix ms — when this target was set. Useful for showing "challenged
   *  N minutes ago" but mostly informational. */
  setAt: number;
};

const store = defineStore<ChallengeTarget | null>({
  key: 'openmakruk_challenge_target',
  version: CHALLENGE_VERSION,
  default: () => null,
  migrate: (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Partial<ChallengeTarget>;
    if (typeof obj.botId !== 'string' || !obj.botId) return null;
    return {
      botId: obj.botId,
      displayName: typeof obj.displayName === 'string' ? obj.displayName : obj.botId,
      avatar: typeof obj.avatar === 'string' ? obj.avatar : '🤖',
      personality: typeof obj.personality === 'string' ? obj.personality : '',
      tier: typeof obj.tier === 'string' ? obj.tier : 'rookie',
      rating: typeof obj.rating === 'number' ? obj.rating : 1000,
      setAt: typeof obj.setAt === 'number' ? obj.setAt : Date.now(),
    };
  },
});

export function loadChallengeTarget(): ChallengeTarget | null {
  return store.load();
}

export function setChallengeTarget(target: Omit<ChallengeTarget, 'setAt'>): void {
  store.save({ ...target, setAt: Date.now() });
}

export function clearChallengeTarget(): void {
  store.save(null);
}
