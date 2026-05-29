// Shared <Page> wrapper — the non-board peer of <BoardLayout>.
//
// Phase 37 — co-Claude audit:
//   "20+ distinct max-width values across the codebase. Navigating
//    between tabs shifts the centered content left/right because
//    Play=1280, Profile=920, Settings=720, About=720, Library=960...
//    User reads this as 'site feels unfinished'."
//
// Adoption strategy:
//   - Board pages (Play / Puzzles / Lessons / drills): use
//     <BoardLayout> (already adopted in Phase 36) — its outer
//     element is the centered container. Don't wrap in <Page>.
//   - Non-board pages (Settings / About / Profile / Library / ...):
//     wrap their root in <Page variant=…> instead of baking
//     max-width into a per-page CSS class.
//
// Width mapping (one max-width per variant — the WHOLE point):
//   narrow  720  reading content: Settings, About, Cert
//   medium  960  dashboards / lists: Profile, Library, Stats,
//                BotDetail, Challenge, BossRush, Learn index,
//                Exhibition feed, Study index
//   wide   1280  index of board content: Puzzles
//
// Variants resolve to `var(--container-{variant})` so the source of
// truth is App.css :root. Any future change is a single edit.

import type { ReactNode } from 'react';

export type PageVariant = 'narrow' | 'medium' | 'wide';

type Props = {
  /** Width tier — picks one of three tokens. Default 'medium'. */
  variant?: PageVariant;
  /** Forwarded to the wrapper for one-off layout tweaks (e.g.
   *  page-specific background / scroll behaviour). Avoid using this
   *  for width or padding — that's the variant's job. */
  className?: string;
  children: ReactNode;
};

export function Page({ variant = 'medium', className, children }: Props) {
  return (
    <div
      className={`page page--${variant}${className ? ` ${className}` : ''}`}
      data-page-variant={variant}
    >
      {children}
    </div>
  );
}
