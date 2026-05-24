import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import type { Square } from '../lib/makruk';
import { invalidateChessgroundBounds } from '../lib/chessgroundBounds';
import './Board.css';

type Props = {
  fen: string;          // current position in Makruk FEN (M/S letters)
  legalMoves: string[]; // all legal UCI moves from current position
  flipped: boolean;     // board orientation
  disabled: boolean;    // engine thinking / game over / not user's turn
  turn: 'white' | 'black';
  isCheck: boolean;
  lastMove: { from: Square; to: Square } | null;
  hint: { from: Square; to: Square } | null; // engine-suggested move arrow
  onMove: (from: Square, to: Square) => void;

  // ---- Display preferences (drive chessground config + CSS variant) ----
  /** Which piece SVG set to use. Default: 'fulmene'. */
  pieceSet?: 'fulmene' | 'yevrowl';
  /** Board square palette. Default: 'wood'. */
  boardTheme?: 'wood' | 'green' | 'blue';
  /** UI language — drives the visual coordinate labels. 'th' replaces
   * the chessground-rendered a-h / 1-8 with Thai consonants ก-ซ and
   * Thai digits ๑-๘ via CSS pseudo-elements. Internal UCI move strings
   * are still a-h / 1-8 — display only. */
  language?: 'th' | 'en';
  /** Show file/rank labels around the board. Default: true. */
  showCoordinates?: boolean;
  /** Highlight the previous move's source + target squares. */
  highlightLastMove?: boolean;
  /** Render legal-move dots when a piece is selected. */
  showLegalDots?: boolean;
  /** Animation duration in ms. 0 disables animation. */
  animationMs?: number;
};

/**
 * Map Makruk's variant piece letters to standard chess letters so we
 * can hand the FEN straight to chessground, which only knows the six
 * canonical chess roles (king/queen/bishop/knight/rook/pawn).
 *
 * Makruk → chessground role:
 *   K (Khun)  → king
 *   M (Met)   → queen   ← role rename only; movement rules are still Makruk
 *   S (Khon)  → bishop  ← role rename only; movement rules are still Makruk
 *   N (Ma)    → knight
 *   R (Ruea)  → rook
 *   P (Bia)   → pawn
 */
function toChessgroundFen(makrukFen: string): string {
  return makrukFen
    .replace(/M/g, 'Q')
    .replace(/m/g, 'q')
    .replace(/S/g, 'B')
    .replace(/s/g, 'b');
}

/**
 * Detect a "jump" between two FENs — i.e. the next fen is NOT a
 * single-move continuation of the previous one. True for resume,
 * library load, review-mode variation jumps, undo-back-to-start.
 *
 * Heuristic: count piece-placement chars that differ between the two
 * FENs' first field. A single legal move changes at most ~4 chars
 * (one piece moved + maybe a capture + maybe rank-count digit shifts).
 * More than 6 chars different = something bigger than one move.
 */
function isFenJump(prevFen: string, nextFen: string): boolean {
  if (prevFen === nextFen) return false;
  const prevPlacement = prevFen.split(' ')[0];
  const nextPlacement = nextFen.split(' ')[0];
  if (prevPlacement.length !== nextPlacement.length) return true;
  let diff = 0;
  for (let i = 0; i < prevPlacement.length; i++) {
    if (prevPlacement[i] !== nextPlacement[i]) diff++;
    if (diff > 6) return true;
  }
  return false;
}

function buildDests(legalMoves: string[]): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const uci of legalMoves) {
    const from = uci.slice(0, 2) as Key;
    const to = uci.slice(2, 4) as Key;
    const list = dests.get(from);
    if (list) list.push(to);
    else dests.set(from, [to]);
  }
  return dests;
}

export function Board({
  fen,
  legalMoves,
  flipped,
  disabled,
  turn,
  isCheck,
  lastMove,
  hint,
  onMove,
  pieceSet = 'fulmene',
  boardTheme = 'wood',
  language = 'th',
  showCoordinates = true,
  highlightLastMove = true,
  showLegalDots = true,
  animationMs = 220,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  // chessground holds the events.after callback we register at mount and
  // never re-reads it through api.set(). If we passed `onMove` directly,
  // the captured closure would freeze the initial App state — meaning by
  // the third user move the legal-move check inside App.handleMove runs
  // against the FIRST render's legalMoves and rejects valid moves
  // silently. Route through a ref that we refresh every render so
  // chessground always invokes the latest handleMove.
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  });

  // Bulletproof bounds-cache invalidation: clear the chessground
  // bounds memo at the START of every pointer interaction (capture
  // phase, before chessground's own handler reads it). Why we need
  // this: chessground's internal ResizeObserver fires on size
  // changes only, NOT position changes — so a layout shift that
  // moves the board without resizing leaves clicks 1 file/rank off.
  // See `lib/chessgroundBounds.ts` for the encapsulated detail.
  useEffect(() => {
    const wrap = containerRef.current;
    if (!wrap) return;
    const clearBounds = () => invalidateChessgroundBounds(apiRef.current);
    wrap.addEventListener('mousedown', clearBounds, { capture: true });
    wrap.addEventListener('touchstart', clearBounds, { capture: true, passive: true });
    return () => {
      wrap.removeEventListener('mousedown', clearBounds, { capture: true });
      wrap.removeEventListener('touchstart', clearBounds, { capture: true });
    };
  }, []);

  // Mount chessground once. Subsequent state changes go through api.set()
  // in the second effect so we never re-create the DOM (chessground
  // animates between updates, which would break on remount).
  useEffect(() => {
    if (!containerRef.current) return;

    const config: Config = {
      fen: toChessgroundFen(fen),
      orientation: flipped ? 'black' : 'white',
      turnColor: turn,
      check: isCheck,
      coordinates: showCoordinates,
      lastMove: lastMove ? [lastMove.from as Key, lastMove.to as Key] : undefined,
      movable: {
        free: false,
        color: disabled ? undefined : turn,
        dests: buildDests(legalMoves),
        showDests: showLegalDots,
        events: {
          after: (orig, dest) =>
            onMoveRef.current(orig as Square, dest as Square),
        },
      },
      draggable: {
        enabled: true,
        showGhost: true,
      },
      selectable: {
        enabled: true,
      },
      animation: {
        enabled: animationMs > 0,
        duration: animationMs,
      },
      highlight: {
        lastMove: highlightLastMove,
        check: true,
      },
      premovable: { enabled: false },
      drawable: { enabled: false },
    };

    apiRef.current = Chessground(containerRef.current, config);

    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track previous fen + orientation so we can detect "jumps" (resume
  // from save / library load / review variation / orientation flip).
  // Three problems to solve on jumps:
  //   1. Animation interpolates every piece's transform from old to new
  //      position — mid-animation visuals don't match the piece map,
  //      so clicks during the transition land on the wrong square
  //      ("clicked Met but it counted as Bia").
  //   2. Chessground caches the board's bounding rect for click hit-
  //      testing; if layout shifts (resume-banner appearing/disappearing,
  //      sidebar tab swap), the cached rect goes stale and click coords
  //      map to wrong squares.
  //   3. Orientation flip on resume (userSide=black) — the same coord
  //      change without invalidating the rect causes the same effect.
  // Fix: detect jump, disable animation for that update, AND force a
  // redrawAll afterwards so chessground re-measures the DOM.
  const prevFenRef = useRef(fen);
  const prevFlippedRef = useRef(flipped);

  // Sync React state into chessground without remounting.
  useEffect(() => {
    const prevFen = prevFenRef.current;
    const orientationChanged = prevFlippedRef.current !== flipped;
    const isJump = isFenJump(prevFen, fen) || orientationChanged;
    prevFenRef.current = fen;
    prevFlippedRef.current = flipped;
    // ALWAYS invalidate the bounds memo before applying state changes.
    // Cheap (next click re-measures lazily) but bulletproof against
    // any unobserved layout shift — banner removal, sub-tab swap,
    // sidebar resize, parent flex reflow, etc.
    invalidateChessgroundBounds(apiRef.current);
    apiRef.current?.set({
      fen: toChessgroundFen(fen),
      orientation: flipped ? 'black' : 'white',
      turnColor: turn,
      check: isCheck,
      coordinates: showCoordinates,
      lastMove: lastMove ? [lastMove.from as Key, lastMove.to as Key] : [],
      movable: {
        color: disabled ? undefined : turn,
        dests: buildDests(legalMoves),
        showDests: showLegalDots,
      },
      animation: {
        enabled: !isJump && animationMs > 0,
        duration: animationMs,
      },
      highlight: {
        lastMove: highlightLastMove,
        check: true,
      },
    });
    // After a jump (resume / inspect / orientation flip), re-measure
    // bounds AND force a piece DOM rebuild so any in-flight animation
    // doesn't leave pieces at intermediate positions.
    if (isJump) {
      invalidateChessgroundBounds(apiRef.current);
      apiRef.current?.redrawAll();
    }
  }, [
    fen,
    legalMoves,
    flipped,
    disabled,
    turn,
    isCheck,
    lastMove?.from,
    lastMove?.to,
    showCoordinates,
    highlightLastMove,
    showLegalDots,
    animationMs,
  ]);

  // Drive engine-suggested hint arrow.
  useEffect(() => {
    if (!apiRef.current) return;
    if (hint) {
      apiRef.current.setAutoShapes([
        {
          orig: hint.from as Key,
          dest: hint.to as Key,
          brush: 'green',
        },
      ]);
    } else {
      apiRef.current.setAutoShapes([]);
    }
  }, [hint?.from, hint?.to]);

  // Compose the CSS variant classes. Keeping piece-set + theme as
  // separate flags on the same element lets the CSS cascade override
  // piece images AND board colours independently.
  const variantClasses = `cg-wrap piece-set-${pieceSet} theme-${boardTheme} lang-${language}`;

  return <div ref={containerRef} className={variantClasses} />;
}
