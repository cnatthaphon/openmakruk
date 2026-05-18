import type { FC } from 'react';
import { isWhitePiece } from '../lib/pieces';
import './MakrukPiece.css';

// SVG renditions of the six Makruk pieces, drawn in the spirit of
// traditional turned-wood Thai chess sets. Each piece occupies a 100x120
// viewBox; the height differences between pieces are real and intentional
// (King is the tallest, Bia is the shortest — like a real set).
//
// Identification cues:
//   King  (ขุน):  stupa silhouette, ball + spire, tallest
//   Met   (เม็ด): bell, small finial bump, no ball
//   Khon  (โคน): tapering chedi spire, sharp top
//   Rook  (เรือ): wide flared squat body, flat ridged top
//   Horse (ม้า):  horse-head carving with mane, eye, ear
//   Bia   (เบี้ย): low compact dome, shortest piece

type PieceProps = { white: boolean };

function Shadow() {
  return <ellipse cx="50" cy="116" rx="34" ry="3.5" className="mk-shadow" />;
}

function Foot() {
  // Wider disc-shaped base shared by every piece.
  return (
    <path
      className="mk-foot"
      d="M 16 108 Q 16 102 22 100 L 78 100 Q 84 102 84 108 L 80 113 Q 78 115 70 115 L 30 115 Q 22 115 20 113 Z"
    />
  );
}

function KingPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 120" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      <Shadow />
      <Foot />
      {/* Bell body, hour-glass waist for stupa silhouette */}
      <path
        d="
          M 26 100
          C 22 90 22 78 28 70
          C 30 62 32 55 30 48
          C 30 38 36 32 50 30
          C 64 32 70 38 70 48
          C 68 55 70 62 72 70
          C 78 78 78 90 74 100
          Z
        "
      />
      {/* Highlight strip on left side */}
      <path className="mk-highlight" d="M 32 95 C 30 80 32 60 38 48" />
      {/* Neck */}
      <path d="M 44 30 L 44 22 L 56 22 L 56 30 Z" />
      {/* Finial ball */}
      <circle cx="50" cy="16" r="6.5" />
      {/* Spire tip */}
      <path d="M 46 9 L 50 2 L 54 9 Z" />
    </svg>
  );
}

function MetPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 120" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      <Shadow />
      <Foot />
      {/* Simpler bell, slightly shorter than King */}
      <path
        d="
          M 26 100
          C 24 88 26 70 32 58
          C 32 46 38 38 50 36
          C 62 38 68 46 68 58
          C 74 70 76 88 74 100
          Z
        "
      />
      <path className="mk-highlight" d="M 32 95 C 30 80 32 60 38 52" />
      {/* Small bud on top — no ball */}
      <ellipse cx="50" cy="32" rx="4.5" ry="6" />
    </svg>
  );
}

function KhonPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 120" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      <Shadow />
      <Foot />
      {/* Tapering chedi: wider at base, peaks sharply */}
      <path
        d="
          M 24 100
          C 24 92 28 80 32 70
          C 36 56 42 40 48 22
          L 50 12
          L 52 22
          C 58 40 64 56 68 70
          C 72 80 76 92 76 100
          Z
        "
      />
      <path className="mk-highlight" d="M 34 95 C 36 82 42 60 48 38" />
      {/* tiny pip at very tip */}
      <circle cx="50" cy="10" r="2" />
    </svg>
  );
}

function RookPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 120" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      <Shadow />
      <Foot />
      {/* Squat boat-like body: wide flared top, narrower middle */}
      <path
        d="
          M 30 100
          C 26 90 26 78 30 72
          L 30 60
          C 24 58 22 52 26 46
          L 26 40
          Q 26 36 32 36
          L 68 36
          Q 74 36 74 40
          L 74 46
          C 78 52 76 58 70 60
          L 70 72
          C 74 78 74 90 70 100
          Z
        "
      />
      <path className="mk-highlight" d="M 34 95 C 32 82 34 70 36 64" />
      {/* horizontal ridge / "deck plank" */}
      <rect x="28" y="44" width="44" height="2.5" className="mk-detail" />
      <rect x="28" y="52" width="44" height="1.5" className="mk-detail" />
    </svg>
  );
}

function HorsePiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 120" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      <Shadow />
      <Foot />
      {/* Squat base column */}
      <path
        d="
          M 30 100
          C 26 92 26 84 30 78
          L 70 78
          C 74 84 74 92 70 100
          Z
        "
      />
      {/* Horse head + neck silhouette, facing right */}
      <path
        d="
          M 32 78
          C 30 64 32 52 38 42
          C 42 32 50 26 60 24
          C 70 22 78 26 80 34
          C 82 42 80 50 74 56
          L 70 60
          C 68 64 66 70 64 78
          Z
        "
      />
      <path className="mk-highlight" d="M 36 75 C 34 60 38 46 44 38" />
      {/* Mane */}
      <path d="M 34 50 L 26 46 L 28 56 L 32 60 Z" />
      {/* Ear */}
      <path d="M 60 24 L 64 12 L 70 22 Z" />
      {/* Eye */}
      <circle cx="66" cy="38" r="2.4" className="mk-eye" />
      {/* Nostril */}
      <ellipse cx="76" cy="44" rx="1.8" ry="1.2" className="mk-eye" />
      {/* Suggestion of mouth line */}
      <path className="mk-detail-stroke" d="M 70 50 L 78 49" />
    </svg>
  );
}

function BiaPiece({ white }: PieceProps) {
  return (
    <svg viewBox="0 0 100 120" className={`mk-piece ${white ? 'mk-white' : 'mk-black'}`}>
      <Shadow />
      <Foot />
      {/* Low compact dome */}
      <path
        d="
          M 32 100
          C 28 92 28 80 32 74
          C 34 66 40 60 50 60
          C 60 60 66 66 68 74
          C 72 80 72 92 68 100
          Z
        "
      />
      <path className="mk-highlight" d="M 36 95 C 34 86 36 76 40 70" />
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
