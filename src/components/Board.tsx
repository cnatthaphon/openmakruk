import type { PieceMap, Square } from '../lib/makruk';
import { MakrukPiece } from './MakrukPiece';
import './Board.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

type Props = {
  pieces: PieceMap;
  selected: Square | null;
  legalDestinations: Square[];
  lastMove: { from: Square; to: Square } | null;
  flipped: boolean;
  showArrow: boolean;
  onSquareClick: (square: Square) => void;
};

/** Map a square like "e4" to (col,row) in the rendered 0-7 grid. */
function squareToColRow(square: Square, flipped: boolean): { col: number; row: number } {
  const fileIdx = square.charCodeAt(0) - 97; // 'a'=0
  const rankNum = parseInt(square[1], 10);    // 1..8
  if (flipped) {
    return { col: 7 - fileIdx, row: rankNum - 1 };
  }
  return { col: fileIdx, row: 8 - rankNum };
}

export function Board({
  pieces,
  selected,
  legalDestinations,
  lastMove,
  flipped,
  showArrow,
  onSquareClick,
}: Props) {
  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="Makruk board">
        {ranks.map((rank, rankIdx) =>
          files.map((file, fileIdx) => {
          const square = `${file}${rank}`;
          const piece = pieces[square];
          const isDark = (rankIdx + fileIdx) % 2 === 1;
          const isSelected = selected === square;
          const isLegal = legalDestinations.includes(square);
          const isLastFrom = lastMove?.from === square;
          const isLastTo = lastMove?.to === square;

          const classes = [
            'square',
            isDark ? 'dark' : 'light',
            isSelected && 'selected',
            isLegal && (piece ? 'legal-capture' : 'legal-move'),
            (isLastFrom || isLastTo) && 'last-move',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={square}
              className={classes}
              onClick={() => onSquareClick(square)}
              aria-label={`${square}${piece ? ' ' + piece : ''}`}
            >
              {piece && <MakrukPiece piece={piece} />}
              {isLegal && !piece && <span className="move-dot" aria-hidden="true" />}
              {fileIdx === 0 && <span className="coord rank-label">{rank}</span>}
              {rankIdx === 7 && <span className="coord file-label">{file}</span>}
            </button>
          );
        }),
      )}
      </div>
      {showArrow && lastMove && lastMove.from !== lastMove.to && (
        <MoveArrow from={lastMove.from} to={lastMove.to} flipped={flipped} />
      )}
    </div>
  );
}

function MoveArrow({
  from,
  to,
  flipped,
}: {
  from: Square;
  to: Square;
  flipped: boolean;
}) {
  const a = squareToColRow(from, flipped);
  const b = squareToColRow(to, flipped);
  // Center of each square in a 0-8 viewBox.
  const x1 = a.col + 0.5;
  const y1 = a.row + 0.5;
  const x2 = b.col + 0.5;
  const y2 = b.row + 0.5;

  // Shorten the line slightly so the arrowhead sits inside the dest square
  // instead of crashing into the next square's edge.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const trim = 0.32;
  const ux = dx / len;
  const uy = dy / len;
  const sx = x1 + ux * trim;
  const sy = y1 + uy * trim;
  const ex = x2 - ux * trim;
  const ey = y2 - uy * trim;

  return (
    <svg
      className="move-arrow"
      viewBox="0 0 8 8"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 8 5 L 0 9 Z" fill="var(--arrow-color)" />
        </marker>
      </defs>
      <line
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        stroke="var(--arrow-color)"
        strokeWidth="0.18"
        strokeLinecap="round"
        markerEnd="url(#arrowhead)"
      />
    </svg>
  );
}
