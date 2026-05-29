// 📚 Library tab — the user's saved positions.
//
// Lists positions sorted by createdAt (newest first). Each row has:
//   - Mini-board thumbnail (HTML grid, same renderer LessonBoard uses)
//   - Title + note + tags
//   - "▶ Open" → loads into Play tab (via the existing custom-position
//      onLoadPosition path)
//   - "🗑 Delete"
//
// Source tag (custom / play / puzzle / analysis) shows where the
// position came from so the user can mentally filter.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Page } from '../components/Page';
import { fenToPieceMap } from '../lib/makruk';
import { letterToPiece, ROLE_TH } from '../lib/chessAttacks';
import { loadLibrary, removePosition, type SavedPosition } from '../lib/library';
import { toast } from '../components/Toast';
import { navigate } from '../lib/router';

type Props = {
  onLoad: (fen: string) => void;
  /** When set and matching an entry, jumps straight to that position
   *  (clicking through "Open" still goes via the same onLoad path).
   *  Powers `/#/library/<id>` deep links. */
  initialPositionId?: string | null;
};

const SOURCE_LABEL: Record<SavedPosition['source'], string> = {
  custom:   '🎨 ออกแบบ',
  play:     '♔ เกมจริง',
  puzzle:   '🧩 ปริศนา',
  analysis: '🔍 วิเคราะห์',
};

export function LibraryPage({ onLoad, initialPositionId }: Props) {
  const [library, setLibrary] = useState<SavedPosition[]>(() => loadLibrary());
  const [filter, setFilter] = useState('');

  // Deep-link: when a position id is present in the route, find it and
  // open immediately (same path as clicking ▶ Open). Use a ref-style
  // guard so we don't re-fire after the user navigates away within
  // the same mount.
  const openedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialPositionId || openedDeepLinkRef.current === initialPositionId) return;
    const match = library.find((p) => p.id === initialPositionId);
    if (match) {
      openedDeepLinkRef.current = initialPositionId;
      onLoad(match.fen);
    }
  }, [initialPositionId, library, onLoad]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return library;
    const q = filter.toLowerCase();
    return library.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.note.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [library, filter]);

  const handleDelete = (id: string) => {
    toast.confirm('ลบตำแหน่งนี้ออกจากคลัง? (กู้ไม่ได้)', {
      confirmLabel: 'ลบ',
      destructive: true,
      onConfirm: () => {
        removePosition(id);
        setLibrary(loadLibrary());
        toast.success('ลบแล้ว');
      },
    });
  };

  return (
    <Page variant="medium" className="library-page">
      <header className="library-header">
        <h2>📚 คลังตำแหน่ง</h2>
        <p>
          ตำแหน่งที่บันทึกจาก Custom / Play / ปริศนา · เก็บใน IndexedDB ของ browser ·
          ทั้งหมด: <strong>{library.length}</strong>
        </p>
        {library.length > 0 && (
          <input
            type="search"
            className="library-search"
            placeholder="ค้นหาในชื่อ / โน้ต / tag..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
      </header>

      {library.length === 0 && (
        <div className="library-empty">
          <div className="library-empty-icon" aria-hidden="true">📚</div>
          <h3>คลังของคุณยังว่าง</h3>
          <p className="label-aside">
            สะสมตำแหน่งที่น่าจดจำไว้กลับมาฝึกซ้ำ · ใช้ได้ทั้งจากเกมจริง · ปริศนา · หรือออกแบบเอง
          </p>
          <button
            className="library-empty-cta"
            onClick={() => navigate({ tab: 'custom' })}
          >
            🎨 ออกแบบตำแหน่งแรก →
          </button>
        </div>
      )}

      <div className="library-grid">
        {filtered.map((p) => (
          <LibraryCard
            key={p.id}
            position={p}
            onOpen={() => onLoad(p.fen)}
            onDelete={() => handleDelete(p.id)}
          />
        ))}
      </div>
    </Page>
  );
}

function LibraryCard({
  position,
  onOpen,
  onDelete,
}: {
  position: SavedPosition;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const date = new Date(position.createdAt);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear() % 100}`;

  // Count pieces for a quick visual summary
  const pieces = fenToPieceMap(position.fen);
  const pieceCount = Object.keys(pieces).length;

  return (
    <div className="library-card">
      <MiniBoard fen={position.fen} />
      <div className="library-card-body">
        <div className="library-card-title">{position.title || 'ไม่มีชื่อ'}</div>
        <div className="library-card-meta">
          <span className="library-source-tag">{SOURCE_LABEL[position.source]}</span>
          <span className="label-aside">{pieceCount} ตัว · {dateStr}</span>
        </div>
        {position.note && (
          <div className="library-card-note">{position.note}</div>
        )}
        {position.tags.length > 0 && (
          <div className="library-card-tags">
            {position.tags.map((t, i) => (
              <span key={i} className="library-tag">#{t}</span>
            ))}
          </div>
        )}
        <div className="library-card-actions">
          <button className="library-open-button" onClick={onOpen}>
            ▶ เปิด
          </button>
          <button className="library-delete-button" onClick={onDelete} title="ลบ">
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

function MiniBoard({ fen }: { fen: string }) {
  const pieces = fenToPieceMap(fen);
  return (
    <div className="library-mini-board" aria-hidden="true">
      {RANKS.map((rank, rankIdx) =>
        FILES.map((file, fileIdx) => {
          const sq = `${file}${rank}`;
          const letter = pieces[sq];
          const piece = letter ? letterToPiece(letter) : null;
          const isDark = (rankIdx + fileIdx) % 2 === 1;
          return (
            <div
              key={sq}
              className={`library-mini-square ${isDark ? 'dark' : 'light'}`}
              title={piece ? `${ROLE_TH[piece.role]} (${piece.color === 'white' ? 'ขาว' : 'ดำ'})` : sq}
            >
              {piece && (
                <div
                  className="library-mini-piece"
                  style={{
                    backgroundImage: `url(/pieces/makruk/${piece.color}_${roleToCg(piece.role)}.svg)`,
                  }}
                />
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}

function roleToCg(role: string): string {
  return (
    {
      king: 'king',
      met: 'queen',
      khon: 'bishop',
      knight: 'knight',
      rook: 'rook',
      bia: 'pawn',
    }[role] ?? 'pawn'
  );
}
