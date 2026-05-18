import type { PieceMap, Square } from '../lib/makruk';
import { PIECE_GLYPHS, isWhitePiece } from '../lib/pieces';
import './Board.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

type Props = {
  pieces: PieceMap;
  selected: Square | null;
  legalDestinations: Square[];
  lastMove: { from: Square; to: Square } | null;
  flipped: boolean;
  onSquareClick: (square: Square) => void;
};

export function Board({
  pieces,
  selected,
  legalDestinations,
  lastMove,
  flipped,
  onSquareClick,
}: Props) {
  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  return (
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
              {piece && (
                <span className={`piece ${isWhitePiece(piece) ? 'white' : 'black'}`}>
                  {PIECE_GLYPHS[piece] ?? piece}
                </span>
              )}
              {isLegal && !piece && <span className="move-dot" aria-hidden="true" />}
              {fileIdx === 0 && <span className="coord rank-label">{rank}</span>}
              {rankIdx === 7 && <span className="coord file-label">{file}</span>}
            </button>
          );
        }),
      )}
    </div>
  );
}
