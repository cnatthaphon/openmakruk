// Internationalization (i18n) scaffolding.
//
// Today the app is Thai-first; English UI is a follow-on. The reason
// this module exists *now* (not later) is that retrofitting i18n is
// painful — every hardcoded Thai string in JSX/JSON has to be hunted
// down. Setting up the harness today means:
//   1. New strings go through `t('key')` from day one
//   2. Migrating existing strings is a search-and-replace, one section
//      at a time, without restructuring components
//   3. Adding a third language = drop a `pt` field next to `th`/`en`
//
// Contract:
//   - `MessageId` is a string union — adding a key without filling
//     `th` will fail typecheck. No "key was a typo and silently
//     fell through to itself" failures at runtime.
//   - English translations may be empty until filled. `t()` falls
//     back to Thai (the source language) when an English string is
//     blank, so the UI never shows raw keys.
//   - The active language is read from Settings via `getLanguage()`;
//     `setLanguageOverride()` lets components override per-render
//     (used by e.g. the Lesson body in Thai while UI is English).

import { loadSettings } from './settings';

export type Lang = 'th' | 'en';

let override: Lang | null = null;

/** Override the active language (component-scoped via getLanguage). */
export function setLanguageOverride(lang: Lang | null): void {
  override = lang;
}

/** Resolve current UI language from settings (or the override). */
export function getLanguage(): Lang {
  if (override) return override;
  try {
    return loadSettings().language;
  } catch {
    return 'th';
  }
}

// ----------------------------------------------------------------------
// Message catalog
// ----------------------------------------------------------------------
//
// Add a new string:
//   1. Add `'<area>.<name>': { th: '...', en: '...' }` to MESSAGES
//   2. Replace the hardcoded string in the component with `t('<area>.<name>')`
//
// Naming convention: `<screen-or-domain>.<purpose>`. Examples:
//   - `play.hint_button`
//   - `puzzle.feedback_correct`
//   - `nav.tab.play`

type Msg = { th: string; en: string };

const MESSAGES = {
  // Navigation / tabs ------------------------------------------------
  'nav.tab.play':     { th: '♔ เล่น',          en: '♔ Play' },
  'nav.tab.learn':    { th: '🎓 ฝึก',           en: '🎓 Learn' },
  'nav.tab.puzzles':  { th: '🧩 ปริศนา',         en: '🧩 Puzzles' },
  'nav.tab.custom':   { th: '🎨 ออกแบบ',         en: '🎨 Setup' },
  'nav.tab.library':  { th: '📚 คลัง',          en: '📚 Library' },
  'nav.tab.profile':  { th: '👤 โปรไฟล์',        en: '👤 Profile' },
  'nav.tab.settings': { th: '⚙️ ตั้งค่า',        en: '⚙️ Settings' },
  'nav.tab.about':    { th: 'ℹ️ เกี่ยวกับ',       en: 'ℹ️ About' },

  // Common verbs / actions ------------------------------------------
  'action.save':      { th: 'บันทึก',           en: 'Save' },
  'action.cancel':    { th: 'ยกเลิก',           en: 'Cancel' },
  'action.confirm':   { th: 'ยืนยัน',           en: 'Confirm' },
  'action.delete':    { th: 'ลบ',              en: 'Delete' },
  'action.close':     { th: 'ปิด',             en: 'Close' },
  'action.copy':      { th: 'คัดลอก',           en: 'Copy' },
  'action.download':  { th: 'ดาวน์โหลด',        en: 'Download' },
  'action.reload':    { th: 'โหลดใหม่',         en: 'Reload' },
  'action.reset':     { th: 'รีเซ็ต',          en: 'Reset' },
  'action.next':      { th: 'ถัดไป',           en: 'Next' },
  'action.previous':  { th: 'ก่อนหน้า',         en: 'Previous' },
  'action.continue':  { th: 'ทำต่อ',           en: 'Continue' },
  'action.start':     { th: 'เริ่ม',            en: 'Start' },
  'action.resume':    { th: 'เล่นต่อ',          en: 'Resume' },

  // Loading / empty states ------------------------------------------
  'state.loading':    { th: 'กำลังโหลด ...',    en: 'Loading ...' },
  'state.empty':      { th: 'ไม่มีรายการ',       en: 'Nothing here yet' },
  'state.error':      { th: 'เกิดข้อผิดพลาด',    en: 'Something went wrong' },

  // Errors / boundary ----------------------------------------------
  'error.boundary.title':   { th: 'เกิดข้อผิดพลาดในการแสดงผล', en: 'Something broke while rendering' },
  'error.boundary.message': {
    th: 'โหลดหน้าใหม่อีกครั้ง หากปัญหายังอยู่ลองรีเซ็ตข้อมูลในการตั้งค่า',
    en: 'Reload the page. If the issue persists, try resetting data in Settings.',
  },

  // Play screen -----------------------------------------------------
  'play.hint_button':       { th: 'ขอ Hint',       en: 'Get hint' },
  'play.analyze_button':    { th: 'วิเคราะห์',      en: 'Analyse' },
  'play.resign':            { th: 'ยอมแพ้',        en: 'Resign' },
  'play.offer_draw':        { th: 'เสนอเสมอ',      en: 'Offer draw' },
  'play.your_turn':         { th: 'ตาคุณ',         en: 'Your turn' },
  'play.engine_thinking':   { th: 'CPU กำลังคิด ...', en: 'CPU thinking ...' },

  // Puzzles ---------------------------------------------------------
  'puzzle.correct':         { th: 'ถูกต้อง',        en: 'Correct' },
  'puzzle.try_again':       { th: 'ลองอีกครั้ง',     en: 'Try again' },
  'puzzle.show_solution':   { th: 'เฉลย',          en: 'Show solution' },
  'puzzle.next_puzzle':     { th: 'ปริศนาถัดไป',    en: 'Next puzzle' },

  // Generic --------------------------------------------------------
  'common.you':             { th: 'คุณ',          en: 'You' },
  'common.opponent':        { th: 'คู่ต่อสู้',      en: 'Opponent' },
  'common.draw':            { th: 'เสมอ',         en: 'Draw' },
  'common.win':             { th: 'ชนะ',          en: 'Win' },
  'common.loss':            { th: 'แพ้',          en: 'Loss' },
} as const satisfies Record<string, Msg>;

export type MessageId = keyof typeof MESSAGES;

/**
 * Translate a message id to the active language. Falls back to Thai
 * if the English translation is empty, so the UI never shows a key
 * when a translation hasn't been filled in yet.
 *
 * Optional substitution: pass `{ name: 'Alice' }` and embed `{name}`
 * placeholders in the message string. Substitution is intentionally
 * simple — no ICU, no plural rules; the call sites that need that
 * complexity (numbers, genders) can format pre-substitution and
 * pass the result in as a substring.
 */
export function t(
  id: MessageId,
  vars?: Record<string, string | number>,
): string {
  const entry = MESSAGES[id];
  if (!entry) {
    // Safety net — should be impossible given the typed union, but a
    // misconstructed key (e.g. concatenated dynamic id) shouldn't
    // crash the UI.
    return id;
  }
  const lang = getLanguage();
  let out: string = entry[lang];
  if (!out) out = entry.th;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

/** All known message ids. Useful for tooling / coverage reports. */
export function allMessageIds(): MessageId[] {
  return Object.keys(MESSAGES) as MessageId[];
}
