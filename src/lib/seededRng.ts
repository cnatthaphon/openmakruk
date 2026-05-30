// Deterministic pseudo-random generator — used by scored bots so two
// players who run the SAME challenge link land on the SAME bot move
// sequence. The previous Math.random() fallback meant the "Strava
// segment" comparison was rigged from move 1 (different book picks +
// different tiebreaks → different games).
//
// Codex review flag (Phase 38):
//   "Bot challenge ยังไม่ deterministic จริง · ใช้ Math.random() สำหรับ
//    book/tiebreak ถ้า leaderboard/challenge ต้อง 'ทุกคนเจอบอตเดียวกัน'
//    ต้องเปลี่ยนเป็น seeded RNG"
//
// Algorithm: mulberry32. Tiny (~10 lines), passes statistical tests
// good enough for game-move tiebreaks, and produces identical streams
// across Node + browser given the same seed (no Math.random reliance).
//
// Seed composition: any string hashes to a 32-bit int via cyrb53,
// then mulberry32 consumes it. The caller decides what goes into the
// seed string — typically `${challengeId}|${fen}|${ply}|${botId}`.

/** 32-bit hash of a string. Used to convert composite seed labels
 *  (challengeId + fen + ply) into a numeric seed for the PRNG. */
export function hashSeedString(s: string): number {
  // cyrb53 variant — strong enough for game RNG, doesn't need to be
  // cryptographic.
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

/** Mulberry32 generator — returns a function that yields uniform
 *  random numbers in [0, 1). Same seed → same sequence forever. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Convenience: build a generator from a composite seed string. */
export function rngFromSeed(seedString: string): () => number {
  return mulberry32(hashSeedString(seedString));
}

/** Deterministic single-value random in [0, 1) for one-off picks
 *  where the caller doesn't need the generator object. */
export function seededRandom(seedString: string): number {
  return rngFromSeed(seedString)();
}
