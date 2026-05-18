import type { FC } from 'react';
import { isWhitePiece } from '../lib/pieces';
import './MakrukPiece.css';

// Stylized SVG renditions of the six Makruk pieces in the spirit of
// traditional turned-wood Thai chess sets (stupa/chedi-like silhouettes).
//
// Identification cues at a glance:
//   - King (ขุน):  tallest, ball + spire on top
//   - Met (เม็ด):  bell, no spire
//   - Khon (โคน):  pointed conical body
//   - Rook (เรือ): squat column with a flat ridged top
//   - Horse (ม้า): horse-head carving
//   - Bia (เบี้ย): short flat dome (shortest piece)
//
// All pieces share a common 100x100 viewBox and an elliptical foot at y≈90
// so heights stay proportional. Each piece's <g> uses currentColor for fill
// so CSS can theme white vs black via classes.

type PieceProps = { white: boolean };

const FOOT = (
  <ellipse cx="50" cy="92" rx="30" ry="4" className="mk-foot" />
);

function KingPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 100" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      {FOOT}
      {/* bell body */}
      <path d="M 28 92 L 28 38 Q 28 20 50 20 Q 72 20 72 38 L 72 92 Z" />
      {/* neck */}
      <rect x="46" y="12" width="8" height="10" />
      {/* finial ball */}
      <circle cx="50" cy="9" r="5" />
      {/* tiny spire on top */}
      <path d="M 48 4 L 50 0 L 52 4 Z" />
    </svg>
  );
}

function MetPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 100" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      {FOOT}
      {/* taller bell, no spire */}
      <path d="M 28 92 L 28 42 Q 28 22 50 22 Q 72 22 72 42 L 72 92 Z" />
      {/* small point on top */}
      <circle cx="50" cy="18" r="3" />
    </svg>
  );
}

function KhonPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 100" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      {FOOT}
      {/* wide base, narrowing to a sharp top */}
      <path d="M 26 92 L 30 50 L 38 28 L 50 10 L 62 28 L 70 50 L 74 92 Z" />
    </svg>
  );
}

function RookPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 100" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      {FOOT}
      {/* squat flared body */}
      <path d="M 28 92 L 28 50 L 22 40 L 22 30 L 78 30 L 78 40 L 72 50 L 72 92 Z" />
      {/* horizontal ridge / groove */}
      <rect x="22" y="35" width="56" height="2.5" className="mk-detail" />
    </svg>
  );
}

function HorsePiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 100" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      {FOOT}
      {/* base */}
      <path d="M 28 92 L 28 70 L 72 70 L 72 92 Z" />
      {/* horse head + neck silhouette */}
      <path
        d="
          M 32 70
          L 32 38
          Q 36 22 52 18
          Q 70 16 76 30
          Q 78 40 70 46
          L 62 50
          L 62 70
          Z
        "
      />
      {/* eye */}
      <circle cx="60" cy="32" r="2.5" className="mk-eye" />
      {/* mane suggestion */}
      <path d="M 32 38 L 24 34 L 28 42 Z" />
      {/* ear */}
      <path d="M 56 18 L 60 10 L 64 20 Z" />
    </svg>
  );
}

function BiaPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 100" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      {FOOT}
      {/* short flat dome */}
      <path d="M 32 92 L 32 65 Q 32 52 50 52 Q 68 52 68 65 L 68 92 Z" />
    </svg>
  );
}

const PIECES: Record<string, FC<PieceProps>> = {
  k: KingPiece,
  m: MetPiece,
  s: KhonPiece,
  n: HorsePiece,
  r: RookPiece,
  p: BiaPiece,
};

type Props = { piece: string };

export function MakrukPiece({ piece }: Props) {
  const white = isWhitePiece(piece);
  const Component = PIECES[piece.toLowerCase()];
  if (!Component) {
    return (
      <span className={`mk-fallback ${white ? 'mk-white' : 'mk-black'}`}>
        {piece}
      </span>
    );
  }
  return <Component white={white} />;
}
