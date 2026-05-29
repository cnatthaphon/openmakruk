// Shared "board + side panels" shell.
//
// Phase 36 — user feedback after the Phase 35 polish round:
//   "UI ไม่ consistent. หน้าหลักกระดานกลาง + คอนโทรลขวา · แต่บทเรียน
//    รายละเอียดอยู่ใต้กระดาน ต้องเลื่อนขึ้นลง · ทุกหน้าต้องใช้ pattern
//    เดียวกัน ไม่งั้นงงไปหมด"
//
// Pattern: left (optional narrative / menu) · board (center) ·
// right (controls / sidebar). Top stays clean — no strips pushing
// the board down. On desktop the three columns render side-by-side;
// on narrow viewports they stack with board first, then right,
// then left (left is usually supplementary content so it goes last
// when scrolling is unavoidable).
//
// Every page that shows a board should mount through this component
// so the visual rhythm is identical across Play, lessons, puzzles,
// counting drills, etc. The slot props are deliberately unstyled
// from the inside — callers bring their own content; this shell
// only handles geometry.

import type { ReactNode } from 'react';

type Props = {
  /** Left column — narrative, lesson body, breadcrumbs, menu.
   *  Omit when the page has no contextual content on this side. */
  left?: ReactNode;
  /** Center column — the chess board. Required. */
  board: ReactNode;
  /** Right column — controls, sidebar, move list, eval, etc.
   *  Omit when a page genuinely has no controls (rare). */
  right?: ReactNode;
  /** Compact strip immediately below the board (caption, hint pill,
   *  step indicator). Stays inside the center column so it doesn't
   *  inflate the side panels' min-width. Use sparingly — too much
   *  re-creates the "scroll-to-read" pain we're fixing. */
  belowBoard?: ReactNode;
  /** Optional className override on the outer wrapper — useful for
   *  pages that need a tighter / wider variant without forking
   *  the layout. */
  className?: string;
};

export function BoardLayout({
  left,
  board,
  right,
  belowBoard,
  className,
}: Props) {
  const hasLeft = left !== undefined && left !== null && left !== false;
  const hasRight = right !== undefined && right !== null && right !== false;
  // The data attributes drive CSS for 1/2/3-column variants without
  // requiring callers to thread state through props.
  return (
    <div
      className={`board-layout${className ? ` ${className}` : ''}`}
      data-has-left={hasLeft ? 'true' : 'false'}
      data-has-right={hasRight ? 'true' : 'false'}
    >
      {hasLeft && (
        <aside className="board-layout-left" aria-label="ข้อมูลประกอบ">
          {left}
        </aside>
      )}
      <div className="board-layout-center">
        <div className="board-layout-board">{board}</div>
        {belowBoard && (
          <div className="board-layout-below">{belowBoard}</div>
        )}
      </div>
      {hasRight && (
        <aside className="board-layout-right" aria-label="คอนโทรล">
          {right}
        </aside>
      )}
    </div>
  );
}
