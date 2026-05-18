import { isWhitePiece } from '../lib/pieces';
import './MakrukPiece.css';

// Renders a Makruk piece as a CSS-masked silhouette.
//
// The mask source is one of seven SVG files in /public/pieces/ that came
// from Wikimedia Commons (Yevrowl, CC BY-SA 4.0). Using `mask-image` means
// each silhouette can be coloured by background-color, so the same asset
// powers both light- and dark-side pieces just by switching one CSS variable.

const PIECE_CLASS: Record<string, string> = {
  k: 'mk-khun',
  m: 'mk-met',
  s: 'mk-khon',
  n: 'mk-ma',
  r: 'mk-ruea',
  p: 'mk-bia',
};

type Props = { piece: string };

export function MakrukPiece({ piece }: Props) {
  const white = isWhitePiece(piece);
  const cls = PIECE_CLASS[piece.toLowerCase()];
  if (!cls) {
    return (
      <span className={`mk-fallback ${white ? 'mk-white' : 'mk-black'}`}>
        {piece}
      </span>
    );
  }
  return (
    <div
      className={`mk-piece ${cls} ${white ? 'mk-white' : 'mk-black'}`}
      aria-hidden="true"
    />
  );
}
