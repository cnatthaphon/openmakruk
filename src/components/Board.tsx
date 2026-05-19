import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import type { Square } from '../lib/makruk';
import './Board.css';

type Props = {
  fen: string;          // current position in Makruk FEN (M/S letters)
  legalMoves: string[]; // all legal UCI moves from current position
  flipped: boolean;     // board orientation
  disabled: boolean;    // engine thinking / game over / not user's turn
  turn: 'white' | 'black';
  isCheck: boolean;
  lastMove: { from: Square; to: Square } | null;
  onMove: (from: Square, to: Square) => void;
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
 *
 * Movement legality is still produced by ffish-es6 (Fairy-Stockfish);
 * chessground only renders. CSS in Board.css repaints the queen and
 * bishop slots with Makruk artwork so users still see Met and Khon.
 */
function toChessgroundFen(makrukFen: string): string {
  return makrukFen
    .replace(/M/g, 'Q')
    .replace(/m/g, 'q')
    .replace(/S/g, 'B')
    .replace(/s/g, 'b');
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
  onMove,
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
      coordinates: true,
      lastMove: lastMove ? [lastMove.from as Key, lastMove.to as Key] : undefined,
      movable: {
        free: false,
        color: disabled ? undefined : turn,
        dests: buildDests(legalMoves),
        showDests: true,
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
        enabled: true,
        duration: 220,
      },
      highlight: {
        lastMove: true,
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

  // Sync React state into chessground without remounting.
  useEffect(() => {
    apiRef.current?.set({
      fen: toChessgroundFen(fen),
      orientation: flipped ? 'black' : 'white',
      turnColor: turn,
      check: isCheck,
      lastMove: lastMove ? [lastMove.from as Key, lastMove.to as Key] : [],
      movable: {
        color: disabled ? undefined : turn,
        dests: buildDests(legalMoves),
      },
    });
  }, [
    fen,
    legalMoves,
    flipped,
    disabled,
    turn,
    isCheck,
    lastMove?.from,
    lastMove?.to,
  ]);

  return <div ref={containerRef} className="cg-wrap" />;
}
