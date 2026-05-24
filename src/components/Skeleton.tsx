// Reusable loading placeholders ("skeletons").
//
// Replace per-page `"กำลังโหลด ..."` text with shimmer cards that
// match the eventual content shape. Goals:
//   1. Layout doesn't jump when content arrives (placeholders take
//      the same vertical room).
//   2. Cheaper, calmer feel than spinners — the user sees what
//      they're going to get.
//   3. Tiny — no library, just CSS keyframes.
//
// Components:
//   <SkeletonLine width="60%" />  — single shimmer bar
//   <SkeletonBlock height={120} /> — rectangular placeholder
//   <SkeletonCard />              — generic card with title + lines
//   <SkeletonGrid count={6} />    — N cards in a responsive grid
//
// Styling lives in App.css under `.skeleton-*`. Width / height
// accept either a number (px) or a CSS length string.

import type { CSSProperties, ReactNode } from 'react';

type Size = number | string;

function toLen(v: Size | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

export function SkeletonLine({
  width = '100%',
  height = 14,
  className = '',
}: {
  width?: Size;
  height?: Size;
  className?: string;
}) {
  const style: CSSProperties = {
    width: toLen(width),
    height: toLen(height),
  };
  return <span className={`skeleton skeleton-line ${className}`} style={style} aria-hidden />;
}

export function SkeletonBlock({
  width = '100%',
  height = 80,
  className = '',
}: {
  width?: Size;
  height?: Size;
  className?: string;
}) {
  return (
    <div
      className={`skeleton skeleton-block ${className}`}
      style={{ width: toLen(width), height: toLen(height) }}
      aria-hidden
    />
  );
}

/**
 * A generic content card placeholder: thumbnail block + title line +
 * two body lines. Mimics the shape of a puzzle / lesson / library
 * card so the layout doesn't shift on arrival.
 */
export function SkeletonCard({
  withThumb = true,
}: {
  withThumb?: boolean;
}) {
  return (
    <div className="skeleton-card" aria-hidden>
      {withThumb ? <SkeletonBlock height={140} className="skeleton-card-thumb" /> : null}
      <div className="skeleton-card-body">
        <SkeletonLine width="70%" height={16} />
        <SkeletonLine width="95%" />
        <SkeletonLine width="60%" />
      </div>
    </div>
  );
}

export function SkeletonGrid({
  count = 6,
  withThumb = true,
}: {
  count?: number;
  withThumb?: boolean;
}) {
  return (
    <div className="skeleton-grid">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} withThumb={withThumb} />
      ))}
    </div>
  );
}

/** Centered placeholder for "screen is loading" / "page is initialising". */
export function SkeletonScreen({ message }: { message?: ReactNode }) {
  return (
    <div className="skeleton-screen" role="status">
      <div className="skeleton-screen-spinner" aria-hidden />
      {message ? <div className="skeleton-screen-message">{message}</div> : null}
    </div>
  );
}
