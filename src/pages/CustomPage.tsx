// Custom Position editor — click pieces from a palette onto an 8×8
// grid, build any legal Makruk position, then hand it to the Play tab
// (or directly to Stockfish for analysis / puzzle generation).
//
// Renders its OWN HTML board instead of reusing chessground, because
// chessground is built around legal-moves-only interaction. This board
// is dumb: every square is a button, click = place/remove the current
// palette selection.

import { useState } from 'react';
import {
  emptyGrid,
  fenToGrid,
  gridToFen,
  PIECE_ROLES,
  startGrid,
  validateGrid,
  type Grid,
  type Piece,
} from '../lib/fen';
import { savePosition } from '../lib/library';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

const ROLE_LABELS: Record<Piece['role'], string> = {
  k: 'ขุน', m: 'เม็ด', s: 'โคน', n: 'ม้า', r: 'เรือ', p: 'เบี้ย',
};

const ROLE_TO_CG: Record<Piece['role'], string> = {
  k: 'king', m: 'queen', s: 'bishop', n: 'knight', r: 'rook', p: 'pawn',
};

type Props = {
  initialFen?: string;
  onLoadPosition: (fen: string) => void;
};

export function CustomPage({ initialFen, onLoadPosition }: Props) {
  const [grid, setGrid] = useState<Grid>(() =>
    initialFen ? fenToGrid(initialFen) : startGrid(),
  );
  const [sideToMove, setSideToMove] = useState<'w' | 'b'>('w');
  // `selection` drives clicks on the board. `null` = eraser.
  const [selection, setSelection] = useState<Piece | null>({ role: 'p', color: 'white' });

  const fen = gridToFen(grid, sideToMove);
  const validationError = validateGrid(grid);

  const placeAt = (rankIdx: number, fileIdx: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      next[rankIdx][fileIdx] = selection; // null → erase
      return next;
    });
  };

  const handleLoad = () => {
    if (validationError) return;
    onLoadPosition(fen);
  };

  const handleSaveToLibrary = () => {
    if (validationError) return;
    const title = prompt('ชื่อตำแหน่ง:', `Custom ${new Date().toLocaleString('th-TH')}`);
    if (title === null) return;
    const note = prompt('โน้ต (ใส่หรือไม่ใส่ก็ได้):', '') ?? '';
    const tagsRaw = prompt('Tags (คั่นด้วยจุลภาค เช่น "endgame,mate-in-2"):', '') ?? '';
    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    savePosition({
      fen,
      title: title.trim() || 'ไม่มีชื่อ',
      note: note.trim(),
      tags,
      source: 'custom',
    });
    alert('✓ บันทึกตำแหน่งในคลังแล้ว');
  };

  const handleAnalyzeAtPlay = () => {
    if (validationError) return;
    // Set a flag so the Play page auto-runs Analyse on first mount
    try {
      window.localStorage.setItem('openmakruk_auto_analyze', '1');
    } catch {
      // ignore
    }
    onLoadPosition(fen);
  };

  const handleCopyFen = async () => {
    if (validationError) return;
    try {
      await navigator.clipboard.writeText(fen);
      alert('คัดลอก FEN แล้ว');
    } catch {
      alert('Browser ไม่อนุญาต clipboard — กดเลือก FEN ในกล่องด้านล่างแทน');
    }
  };

  return (
    <div className="custom-page">
      <header className="custom-header">
        <h2>🎨 ออกแบบกระดาน</h2>
        <p>
          คลิกตัวหมากในแถบขวา → คลิกบนช่องเพื่อวาง · คลิกที่ "ลบ" แล้วคลิกช่องเพื่อลบ ·
          ตั้งฝ่ายเดิน แล้วกด "เล่นจาก position นี้"
        </p>
      </header>

      <div className="custom-layout">
        <div className="custom-board-wrap">
          <div className="custom-board">
            {RANKS.map((rank, rankIdx) =>
              FILES.map((file, fileIdx) => {
                const piece = grid[rankIdx][fileIdx];
                const isDark = (rankIdx + fileIdx) % 2 === 1;
                return (
                  <button
                    key={`${file}${rank}`}
                    className={`custom-square ${isDark ? 'dark' : 'light'} ${
                      piece ? 'has-piece' : ''
                    }`}
                    onClick={() => placeAt(rankIdx, fileIdx)}
                    aria-label={`${file}${rank}${piece ? ` ${piece.color} ${piece.role}` : ''}`}
                  >
                    {piece && (
                      <div
                        className="custom-piece"
                        style={{
                          backgroundImage: `url(/pieces/makruk/${piece.color}_${
                            ROLE_TO_CG[piece.role]
                          }.svg)`,
                        }}
                      />
                    )}
                    {fileIdx === 0 && <span className="custom-coord rank">{rank}</span>}
                    {rankIdx === 7 && <span className="custom-coord file">{file}</span>}
                  </button>
                );
              }),
            )}
          </div>
        </div>

        <aside className="custom-side">
          <div className="custom-palette-section">
            <div className="custom-section-title">ตัวหมากขาว</div>
            <div className="custom-palette">
              {PIECE_ROLES.map((role) => (
                <PaletteButton
                  key={`w-${role}`}
                  piece={{ role, color: 'white' }}
                  selected={
                    selection?.role === role && selection?.color === 'white'
                  }
                  onClick={() => setSelection({ role, color: 'white' })}
                />
              ))}
            </div>
            <div className="custom-section-title">ตัวหมากดำ</div>
            <div className="custom-palette">
              {PIECE_ROLES.map((role) => (
                <PaletteButton
                  key={`b-${role}`}
                  piece={{ role, color: 'black' }}
                  selected={
                    selection?.role === role && selection?.color === 'black'
                  }
                  onClick={() => setSelection({ role, color: 'black' })}
                />
              ))}
            </div>
            <button
              className={`custom-eraser ${selection === null ? 'is-active' : ''}`}
              onClick={() => setSelection(null)}
              title="คลิกแล้วคลิกช่องเพื่อลบ"
            >
              🩹 ลบ
            </button>
          </div>

          <div className="custom-controls">
            <div className="custom-section-title">ตั้งค่า</div>
            <div className="custom-side-toggle">
              <span className="label">ฝ่ายเดิน:</span>
              <button
                className={sideToMove === 'w' ? 'is-active' : ''}
                onClick={() => setSideToMove('w')}
              >
                ♔ ขาว
              </button>
              <button
                className={sideToMove === 'b' ? 'is-active' : ''}
                onClick={() => setSideToMove('b')}
              >
                ♚ ดำ
              </button>
            </div>
            <div className="custom-actions">
              <button onClick={() => setGrid(startGrid())}>
                ⟳ Reset ปกติ
              </button>
              <button onClick={() => setGrid(emptyGrid())}>🧹 Clear</button>
            </div>
            <button
              className="custom-load"
              onClick={handleLoad}
              disabled={validationError !== null}
            >
              ▶ เล่นจาก position นี้
            </button>
            <div className="custom-hub-actions">
              <button
                className="custom-hub-button"
                onClick={handleAnalyzeAtPlay}
                disabled={validationError !== null}
                title="โหลดไปที่หน้า Play แล้วเรียก engine วิเคราะห์ top 3 ตาเดิน"
              >
                🔍 วิเคราะห์ตำแหน่ง
              </button>
              <button
                className="custom-hub-button"
                onClick={handleSaveToLibrary}
                disabled={validationError !== null}
                title="บันทึกตำแหน่งในคลังของคุณเพื่อกลับมาเปิดทีหลัง"
              >
                💾 บันทึกในคลัง
              </button>
              <button
                className="custom-hub-button"
                onClick={handleCopyFen}
                disabled={validationError !== null}
              >
                📋 คัดลอก FEN
              </button>
            </div>
            {validationError && (
              <div className="custom-error">⚠ {validationError}</div>
            )}
            <details className="custom-fen">
              <summary>FEN</summary>
              <textarea
                readOnly
                value={fen}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                rows={3}
              />
            </details>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PaletteButton({
  piece,
  selected,
  onClick,
}: {
  piece: Piece;
  selected: boolean;
  onClick: () => void;
}) {
  const label = `${ROLE_LABELS[piece.role]} (${piece.color === 'white' ? 'ขาว' : 'ดำ'})`;
  return (
    <button
      className={`custom-palette-btn ${selected ? 'is-selected' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <div
        className="palette-piece"
        style={{
          backgroundImage: `url(/pieces/makruk/${piece.color}_${
            ROLE_TO_CG[piece.role]
          }.svg)`,
        }}
      />
    </button>
  );
}
