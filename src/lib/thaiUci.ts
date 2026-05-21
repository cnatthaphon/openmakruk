// Thai-friendly square + UCI rendering.
//
// Internal move strings are always UCI (a1-h8 / 4-char form). When the
// UI language is set to Thai, surface them with Thai consonants for
// files and Thai digits for ranks — same letters the board shows
// around its edge:
//
//   files a-h → ก ข ค ง จ ฉ ช ซ
//   ranks 1-8 → ๑ ๒ ๓ ๔ ๕ ๖ ๗ ๘
//
// Example: "f4g5" → "ฉ๔→ช๕"
//
// UCI strings passed to ffish, written to PGN, and stored in
// localStorage stay in standard a-h / 1-8 form. This is display-only.

const FILES_TH = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ'];
const RANKS_TH = ['๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘'];

export function thaiSquare(sq: string): string {
  if (sq.length < 2) return sq;
  const f = sq.charCodeAt(0) - 97;
  const r = parseInt(sq[1], 10) - 1;
  if (f < 0 || f > 7 || r < 0 || r > 7) return sq;
  return `${FILES_TH[f]}${RANKS_TH[r]}`;
}

/** Render a UCI move pair as "fromTh→toTh". */
export function thaiUci(uci: string): string {
  if (uci.length < 4) return uci;
  return `${thaiSquare(uci.slice(0, 2))}→${thaiSquare(uci.slice(2, 4))}`;
}

/**
 * Pick the right notation based on current language. Always returns
 * a string callers can drop straight into JSX without further
 * formatting.
 */
export function formatMove(uci: string, language: 'th' | 'en' = 'th'): string {
  return language === 'th' ? thaiUci(uci) : uci;
}
