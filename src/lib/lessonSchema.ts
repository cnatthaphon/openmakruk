// Data schema for lessons served from /content/lessons/all.json.
//
// LessonView dispatches on `demo.kind` to pick the right interactive
// component. Adding a new lesson body = appending a new JSON entry +
// (if it's a new demo type) implementing the matching renderer.
//
// "Foundation, not content" — Phase 2B fills in 6 piece-movement demos
// fully; the other 22 entries carry just enough metadata to render the
// card + read-only body. Phase 2C will swap their `demo: null` for
// real interactive bodies without touching this file.

import type { Color, Role } from './lessonRules';

export type LessonGroup =
  | 'basics'
  | 'pieces'
  | 'rules'
  | 'counting'
  | 'strategy'
  | 'endgame';

export type LessonContent = {
  id: string;
  title: string;
  description: string; // 1-line card subtitle
  group: LessonGroup;
  estimateMinutes: number;
  body?: string; // longer Thai explanation shown in detail view
  demo?: LessonDemo | null;
};

export type LessonDemo =
  | PieceMovementDemo
  | PositionViewerDemo
  | PositionQuizDemo;

/** Single piece on an empty board — used by the Phase 2B piece tutorials. */
export type PieceMovementDemo = {
  kind: 'piece-movement';
  role: Role;
  color: Color;
  startSquare: string;
  /** For Bia: split push from diagonal-capture squares with different colours. */
  pawnSplit?: boolean;
};

/** Read-only position display — for "starting position", "endgame example" etc. */
export type PositionViewerDemo = {
  kind: 'position-viewer';
  fen: string;
  caption?: string;
  highlights?: { square: string; color: 'green' | 'red' | 'yellow' }[];
};

/** Click-the-square quiz — "which square does this piece reach?" */
export type PositionQuizDemo = {
  kind: 'position-quiz';
  fen: string;
  question: string;
  correctSquares: string[];
  successMessage: string;
  failureMessage: string;
};

export const LESSON_GROUP_LABELS: Record<LessonGroup, string> = {
  basics:   '1. พื้นฐานกระดาน',
  pieces:   '2. รู้จักตัวหมาก',
  rules:    '3. กฎเกม (รุก / รุกจน / อับ)',
  counting: '4. นับศักดิ์ (Counting)',
  strategy: '5. กลยุทธ์การเล่น',
  endgame:  '6. ปลายเกม (Endgame)',
};

export const LESSON_GROUP_ORDER: LessonGroup[] = [
  'basics',
  'pieces',
  'rules',
  'counting',
  'strategy',
  'endgame',
];
