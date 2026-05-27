// Release info — injected at build time by Vite's `define` so the
// running app can show "you're on commit abc1234 from 2026-05-27".
//
// Why bake at build time (not fetch at runtime):
//   - Show "last updated" without a roundtrip
//   - Surface the SHA in bug reports without coordinating with the API
//   - Works offline (the PWA still tells you what build it is)
//
// `__BUILD_SHA__` and `__BUILD_TIME__` are declared in src/vite-env.d.ts.

/** Human-facing version label. "0.1" is the semver, "beta" tells the
 *  visitor this is pre-1.0. Bump to "0.2-beta" / "1.0" as appropriate. */
export const VERSION = '0.1-beta';

export const BUILD_SHA: string = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';
export const BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

/** Pretty-format the build time for UI display. Uses Thai locale +
 *  short month so it reads "27 พ.ค. 2026, 17:30 น.". */
export function buildTimeLabel(): string {
  try {
    return new Date(BUILD_TIME).toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return BUILD_TIME;
  }
}

/** Returns true while OpenMakruk is in its pre-1.0 phase. UI may want
 *  to show a "ระบบทดสอบ" banner / disclaimers based on this. */
export function isBeta(): boolean {
  return VERSION.includes('beta') || VERSION.includes('alpha') || VERSION.startsWith('0.');
}
