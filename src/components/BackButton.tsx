// Shared back button — every page that has a "← X" affordance
// goes through this. Issue #9 audit found:
//   • Labels inconsistent within the same feature
//     ("← รายการ" vs "← กลับ Puzzles" on counting drill).
//   • Class names leaked across pages
//     (StatsPage error state used .bot-detail-back from a different
//      page's CSS, "correct behavior, wrong semantic class").
//   • A few pages used window.location.hash directly instead of
//     the navigate() helper, bypassing the router.
//
// One component + one shared `.back-button` class makes the visual
// affordance identical everywhere and gives the audit one place to
// look for "where does this back arrow go?".
//
// Usage:
//   <BackButton to="learn">รายการบทเรียน</BackButton>
//   <BackButton onClick={onClose}>กลับ</BackButton>
//
// Either `to` (a Tab) OR `onClick` is required. When both are set
// onClick wins. The label is composed as "← {children}" so callers
// pass the destination noun only — no leading arrow.

import type { ReactNode } from 'react';
import { navigate, type Tab } from '../lib/router';

type Props = {
  /** Destination tab. Wins over `onClick` is unset. */
  to?: Tab;
  /** Custom handler. Takes precedence over `to`. */
  onClick?: () => void;
  /** Optional aria-label override. Defaults to "กลับ {children}". */
  ariaLabel?: string;
  /** Extra class for one-off tweaks (e.g. positioning); avoid using
   *  for width/color — those belong in .back-button. */
  className?: string;
  children: ReactNode;
};

export function BackButton({ to, onClick, ariaLabel, className, children }: Props) {
  const handle = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (to) navigate({ tab: to });
  };
  return (
    <button
      type="button"
      className={`back-button${className ? ` ${className}` : ''}`}
      onClick={handle}
      aria-label={ariaLabel ?? `กลับ${typeof children === 'string' ? ` ${children}` : ''}`}
    >
      ← {children}
    </button>
  );
}
