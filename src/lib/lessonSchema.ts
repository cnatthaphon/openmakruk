// Data schema for lessons served from /content/lessons/all.json.
//
// v2: a lesson is a sequence of `steps`. Each step is either prose
// (kind:'text') or one of the interactive demo kinds. The renderer
// walks through them with prev/next nav and shows a step progress
// indicator at the top. v1 lessons (single `body` + optional `demo`)
// still work — they get normalised to a 1- or 2-step sequence at
// render time via lessonToSteps() below.
//
// Adding a new demo kind: extend the `LessonDemo` union here, then add
// a matching case to the dispatcher in LessonView.tsx — the exhaustive
// `never` guard makes the compiler tell you if you forget.

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
  description: string;
  group: LessonGroup;
  estimateMinutes: number;
  /** v2: sequence of steps. Preferred shape going forward. */
  steps?: LessonStep[];
  /** v1 (back-compat): single intro body string. */
  body?: string;
  /** v1 (back-compat): single demo after body. */
  demo?: LessonDemo | null;
};

export type LessonStep =
  | TextStep
  | DemoStep;

export type TextStep = {
  kind: 'text';
  /** Plain Thai prose. Newlines render as paragraph breaks. */
  text: string;
  /** Optional subheading for this step. */
  heading?: string;
};

export type DemoStep = {
  kind: 'demo';
  demo: LessonDemo;
  /** Short caption shown above the board. */
  caption?: string;
};

export type LessonDemo =
  | PieceMovementDemo
  | PositionViewerDemo
  | PositionQuizDemo
  | ReplayDemo
  | TryMoveDemo
  | CountingDemo;

/** Single piece on an empty board — Phase 2B piece tutorials. */
export type PieceMovementDemo = {
  kind: 'piece-movement';
  role: Role;
  color: Color;
  startSquare: string;
  /** For Bia: paint push vs diagonal-capture squares differently. */
  pawnSplit?: boolean;
};

/** Read-only position display. */
export type PositionViewerDemo = {
  kind: 'position-viewer';
  fen: string;
  caption?: string;
  highlights?: { square: string; color: 'green' | 'red' | 'yellow' }[];
};

/** Click-the-square quiz: "which squares are X?" */
export type PositionQuizDemo = {
  kind: 'position-quiz';
  fen: string;
  question: string;
  correctSquares: string[];
  successMessage: string;
  failureMessage: string;
};

/** Drag-the-move quiz: same as a puzzle but with educational framing. */
export type TryMoveDemo = {
  kind: 'try-move';
  fen: string;
  prompt: string;
  /** UCI moves any of which counts as correct. */
  correctMoves: string[];
  successMessage: string;
  failureMessage: string;
  hint?: string;
};

/** Animated game / sequence walk-through with per-ply commentary. */
export type ReplayDemo = {
  kind: 'replay';
  /** Starting FEN before any move is played. */
  fen: string;
  /** UCI moves applied in order. */
  moves: string[];
  /**
   * Commentary keyed by the ply count AFTER the move is applied.
   * `plyAfter: 0` → shown before any move (the starting position).
   * `plyAfter: 1` → shown after move 0 has been applied. Etc.
   */
  commentary: { plyAfter: number; text: string }[];
};

/** Counting-rule demonstration: position + simulated count progression. */
export type CountingDemo = {
  kind: 'counting-demo';
  fen: string;
  /** Which side is the "bare king" (the side being counted-against). */
  bareKingSide: 'white' | 'black';
  /** Max count before draw (8 / 16 / 22 / 32 / 44 / 64). */
  countLimit: number;
  caption: string;
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

/**
 * Normalise a lesson into a uniform array of steps regardless of
 * whether it uses the v1 (body+demo) or v2 (steps) shape.
 *
 * v2 path: returns lesson.steps as-is.
 * v1 path: builds 0-2 steps from body and/or demo. A lesson with
 * neither still gets a placeholder text step so the user has
 * something to read before marking it complete.
 */
export function lessonToSteps(lesson: LessonContent): LessonStep[] {
  if (lesson.steps && lesson.steps.length > 0) return lesson.steps;
  const out: LessonStep[] = [];
  if (lesson.body) {
    out.push({ kind: 'text', text: lesson.body });
  }
  if (lesson.demo) {
    out.push({ kind: 'demo', demo: lesson.demo });
  }
  if (out.length === 0) {
    out.push({
      kind: 'text',
      text: 'บทเรียนนี้ยังไม่มีเนื้อหา · กดปุ่ม "เข้าใจแล้ว" ด้านล่างเพื่อข้ามได้',
    });
  }
  return out;
}
