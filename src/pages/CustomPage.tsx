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
  PIECE_LIMITS,
  ROLE_NAMES_TH,
  countRole,
  startGrid,
  validateGrid,
  type Grid,
  type Piece,
} from '../lib/fen';
import { savePosition } from '../lib/library';
import { autoAnalyze } from '../lib/flags';
import { toast } from '../components/Toast';
import type { PuzzleCategory } from '../lib/puzzleSchema';
import { verifyAndAnnotate } from '../lib/puzzleVerifier';
import { saveUserPuzzle, newUserPuzzleId } from '../lib/userPuzzles';
import { loadStats } from '../lib/stats';
import { loadFfish } from '../lib/makruk';
import { searchBestMove } from '../lib/engine';
import { getEngineById } from '../lib/engines/registry';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

// Role names (Thai) are now exported from lib/fen.ts as ROLE_NAMES_TH
// so the same labels are reused by validateGrid error messages and
// the picker tooltip — no duplicate-source-of-truth risk.

const ROLE_TO_CG: Record<Piece['role'], string> = {
  k: 'king', m: 'queen', s: 'bishop', n: 'knight', r: 'rook', p: 'pawn',
};

type Props = {
  initialFen?: string;
  onLoadPosition: (fen: string) => void;
};

export function CustomPage({ initialFen, onLoadPosition }: Props) {
  // Default = EMPTY board. Composing a position from scratch is the
  // common case (endgame study, puzzle authoring, problem setup);
  // starting with the full opening array forces the user to clear
  // 32 pieces first. A "Load standard start" button is the opt-in
  // for the rare case where they want it.
  const [grid, setGrid] = useState<Grid>(() =>
    initialFen ? fenToGrid(initialFen) : emptyGrid(),
  );
  const [sideToMove, setSideToMove] = useState<'w' | 'b'>('w');
  // `pickerAt` = which cell is currently showing the piece-picker.
  // null = no picker open. We use a per-cell picker (click-cell →
  // choose piece) instead of a global palette so the user can't keep
  // clicking the same square to "fill it" with random pieces.
  const [pickerAt, setPickerAt] = useState<{ rankIdx: number; fileIdx: number } | null>(null);
  // Picker remembers which side the user was placing for, so a streak
  // of "place 8 white pawns" doesn't keep flipping back to ขาว/ดำ.
  const [pickerSide, setPickerSide] = useState<Piece['color']>('white');
  const [showPuzzleAuthor, setShowPuzzleAuthor] = useState(false);

  const fen = gridToFen(grid, sideToMove);
  const validationError = validateGrid(grid);

  const handleCellClick = (rankIdx: number, fileIdx: number) => {
    // Toggle: clicking the same cell again closes the picker.
    if (pickerAt && pickerAt.rankIdx === rankIdx && pickerAt.fileIdx === fileIdx) {
      setPickerAt(null);
      return;
    }
    setPickerAt({ rankIdx, fileIdx });
  };

  const placeChosen = (rankIdx: number, fileIdx: number, piece: Piece | null) => {
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      next[rankIdx][fileIdx] = piece; // null → clear cell
      return next;
    });
    setPickerAt(null);
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
    toast.success('บันทึกตำแหน่งในคลังแล้ว');
  };

  const handleAnalyzeAtPlay = () => {
    if (validationError) return;
    // Set a flag so the Play page auto-runs Analyse on first mount.
    autoAnalyze.set(true);
    onLoadPosition(fen);
  };

  const handleCopyFen = async () => {
    if (validationError) return;
    try {
      await navigator.clipboard.writeText(fen);
      toast.success('คัดลอก FEN แล้ว');
    } catch {
      toast.error('Browser ไม่อนุญาต clipboard — กดเลือก FEN ในกล่องด้านล่างแทน');
    }
  };

  return (
    <div className="custom-page">
      <header className="custom-header">
        <h2>🎨 ออกแบบกระดาน</h2>
        <p>
          เริ่มจากกระดานว่าง · คลิกช่องเพื่อเลือกตัวหมาก ·
          ระบบจำกัดจำนวนตัวหมากตามกฎ Makruk (ขุน 1 · เม็ดสูงสุด 9 ·
          โคน/ม้า/เรือ ฝ่ายละ 2 · เบี้ย 8) — กดปุ่ม "เริ่มต้นปกติ"
          ถ้าต้องการตั้งหมากแบบเริ่มเกม
        </p>
      </header>

      <div className="custom-layout">
        <div className="custom-board-wrap">
          <div className="custom-board">
            {RANKS.map((rank, rankIdx) =>
              FILES.map((file, fileIdx) => {
                const piece = grid[rankIdx][fileIdx];
                const isDark = (rankIdx + fileIdx) % 2 === 1;
                const pickerOpen = pickerAt
                  ? pickerAt.rankIdx === rankIdx && pickerAt.fileIdx === fileIdx
                  : false;
                return (
                  <button
                    key={`${file}${rank}`}
                    className={`custom-square ${isDark ? 'dark' : 'light'} ${
                      piece ? 'has-piece' : ''
                    } ${pickerOpen ? 'is-picker-open' : ''}`}
                    onClick={() => handleCellClick(rankIdx, fileIdx)}
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

          {pickerAt && (
            <PiecePicker
              grid={grid}
              rankIdx={pickerAt.rankIdx}
              fileIdx={pickerAt.fileIdx}
              side={pickerSide}
              onSideChange={setPickerSide}
              onPick={(p) => placeChosen(pickerAt.rankIdx, pickerAt.fileIdx, p)}
              onClose={() => setPickerAt(null)}
            />
          )}
        </div>

        <aside className="custom-side">
          <div className="custom-palette-section">
            <div className="custom-section-title">จำนวนตัวหมากบนกระดาน</div>
            <PieceCountSummary grid={grid} />
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
              <button onClick={() => { setGrid(startGrid()); setPickerAt(null); }}>
                ⟳ เริ่มต้นปกติ (32 ตัว)
              </button>
              <button onClick={() => { setGrid(emptyGrid()); setPickerAt(null); }}>
                🧹 ล้างกระดาน
              </button>
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
              <button
                className="custom-hub-button"
                onClick={() => setShowPuzzleAuthor((v) => !v)}
                disabled={validationError !== null}
                title="บันทึกตำแหน่งนี้เป็นปริศนา · engine จะ verify ก่อน"
              >
                🧩 บันทึกเป็น puzzle
              </button>
            </div>
            {showPuzzleAuthor && validationError === null && (
              <PuzzleAuthorPanel fen={fen} sideToMove={sideToMove} onClose={() => setShowPuzzleAuthor(false)} />
            )}
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

/**
 * Per-cell piece picker. Opens when the user clicks any board cell.
 * Shows: side toggle (ขาว/ดำ), 6 piece buttons (each disabled when
 * its PIECE_LIMITS cap is reached for the selected side), and a
 * "clear this square" button. Closes on Escape or by clicking the
 * same cell again.
 *
 * Why this instead of the old global palette:
 *   - Old design: a sticky "selected piece" in the sidebar + click
 *     board to place. Made it trivial to "fill the board" with 30
 *     pawns because there was no per-cell affordance to STOP placing.
 *   - New design: every placement is an explicit choice. Limits are
 *     visible at the moment of placement (button greys out when the
 *     cap is hit), not as a validation error after the fact.
 */
function PiecePicker({
  grid,
  rankIdx,
  fileIdx,
  side,
  onSideChange,
  onPick,
  onClose,
}: {
  grid: Grid;
  rankIdx: number;
  fileIdx: number;
  side: Piece['color'];
  onSideChange: (s: Piece['color']) => void;
  onPick: (piece: Piece | null) => void;
  onClose: () => void;
}) {
  const file = FILES[fileIdx];
  const rank = RANKS[rankIdx];
  const currentPiece = grid[rankIdx][fileIdx];
  const isLimitReached = (role: Piece['role']): boolean => {
    // Replacing the existing piece doesn't increase the count, so the
    // limit doesn't apply when we'd be swapping the same role+color.
    if (currentPiece && currentPiece.role === role && currentPiece.color === side) return false;
    return countRole(grid, role, side) >= PIECE_LIMITS[role];
  };

  return (
    <div
      className="custom-piece-picker"
      role="dialog"
      aria-label={`เลือกตัวหมากสำหรับช่อง ${file}${rank}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <header className="custom-piece-picker-head">
        <strong>ช่อง {file}{rank}</strong>
        <button
          className="custom-piece-picker-close"
          onClick={onClose}
          aria-label="ปิดตัวเลือก"
        >✕</button>
      </header>
      <div className="custom-piece-picker-side">
        <button
          className={side === 'white' ? 'is-active' : ''}
          onClick={() => onSideChange('white')}
        >
          ♔ ขาว
        </button>
        <button
          className={side === 'black' ? 'is-active' : ''}
          onClick={() => onSideChange('black')}
        >
          ♚ ดำ
        </button>
      </div>
      <div className="custom-piece-picker-grid">
        {PIECE_ROLES.map((role) => {
          const disabled = isLimitReached(role);
          const used = countRole(grid, role, side);
          const cap = PIECE_LIMITS[role];
          return (
            <button
              key={role}
              className="custom-piece-picker-btn"
              onClick={() => onPick({ role, color: side })}
              disabled={disabled}
              title={
                disabled
                  ? `${ROLE_NAMES_TH[role]}: เต็มแล้ว (${used}/${cap})`
                  : `${ROLE_NAMES_TH[role]}: ${used}/${cap}`
              }
            >
              <div
                className="palette-piece"
                style={{
                  backgroundImage: `url(/pieces/makruk/${side}_${ROLE_TO_CG[role]}.svg)`,
                }}
                aria-hidden="true"
              />
              <span className="custom-piece-picker-count">{used}/{cap}</span>
            </button>
          );
        })}
      </div>
      {currentPiece && (
        <button
          className="custom-piece-picker-clear"
          onClick={() => onPick(null)}
        >
          🩹 ลบหมากในช่องนี้
        </button>
      )}
    </div>
  );
}

/** Sidebar widget — at-a-glance piece census so the user can see what
 *  they've placed without counting cells. Mirrors PIECE_LIMITS, so a
 *  full column reads "K 1/1 · M 0/9 · S 0/2 · …" and immediately tells
 *  the user how much room they have left per type. */
function PieceCountSummary({ grid }: { grid: Grid }) {
  return (
    <div className="custom-piece-summary">
      {(['white', 'black'] as const).map((color) => (
        <div key={color} className={`custom-piece-summary-row is-${color}`}>
          <span className="custom-piece-summary-label">
            {color === 'white' ? '♔ ขาว' : '♚ ดำ'}
          </span>
          {PIECE_ROLES.map((role) => {
            const n = countRole(grid, role, color);
            const cap = PIECE_LIMITS[role];
            const full = n >= cap;
            return (
              <span
                key={role}
                className={`custom-piece-summary-chip${full ? ' is-full' : ''}`}
                title={`${ROLE_NAMES_TH[role]} ${n}/${cap}`}
              >
                <span className="custom-piece-summary-icon">{ROLE_GLYPH[role]}</span>
                {n}/{cap}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const ROLE_GLYPH: Record<Piece['role'], string> = {
  k: '♔', m: '♕', s: '♗', n: '♘', r: '♖', p: '♙',
};

/**
 * Form for saving the current Custom-page position as a user puzzle.
 * Engine verifies the solution before saving; the user can edit and
 * re-verify until the engine accepts.
 */
function PuzzleAuthorPanel({
  fen,
  sideToMove,
  onClose,
}: {
  fen: string;
  sideToMove: 'w' | 'b';
  onClose: () => void;
}) {
  const [solutionText, setSolutionText] = useState('');
  const [category, setCategory] = useState<PuzzleCategory>('mate-1');
  const [rating, setRating] = useState(800);
  const [prompt, setPrompt] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Engine auto-suggest — runs Fairy-Stockfish from the current
  // position and plays both sides through up to 5 plies, populating
  // the solution field with the best line. User can edit before save.
  // Use case: "I've placed an interesting tactic, what's the line?"
  // The user doesn't have to type UCI by hand.
  const handleAutoSuggest = async () => {
    setSuggesting(true);
    setFeedback(null);
    try {
      const ffish = await loadFfish();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ffishAny = ffish as any;
      const board = new ffishAny.Board('makruk', fen);
      // Force Fairy-Stockfish (same as review.ts) — personality bots
      // wouldn't return a meaningful "best line".
      const engine = await getEngineById('fairy-stockfish');
      const opts = engine.capabilities.analysisDefaults ?? { depth: 12 };
      const moves: string[] = [];
      try {
        // Play up to 5 plies (~3 user moves + 2 opponent replies) —
        // long enough to capture mate-in-2 + tactic sequences without
        // running forever.
        for (let i = 0; i < 5; i++) {
          if (board.isGameOver(true)) break;
          const result = await searchBestMove(board.fen(), opts);
          if (!result.bestMove || result.bestMove.length < 4) break;
          board.push(result.bestMove);
          moves.push(result.bestMove);
        }
      } finally {
        board.delete();
      }
      if (moves.length === 0) {
        setFeedback('✗ Engine ไม่พบตาที่เล่นได้ (ตำแหน่งอาจ checkmate/stalemate อยู่แล้ว)');
      } else {
        setSolutionText(moves.join(' '));
        setFeedback(`✓ Auto-suggest: ${moves.length} ตา · แก้ได้ก่อน verify`);
      }
    } catch (err) {
      setFeedback(`✗ Auto-suggest failed: ${String(err)}`);
    } finally {
      setSuggesting(false);
    }
  };

  const handleSave = async () => {
    setVerifying(true);
    setFeedback(null);
    const solution = solutionText.trim().split(/\s+/).filter(Boolean);
    if (solution.length === 0) {
      setFeedback('กรุณาใส่ตาเดินอย่างน้อย 1 ตา (เช่น "a1a8")');
      setVerifying(false);
      return;
    }
    const stats = loadStats();
    const draft = {
      id: newUserPuzzleId(),
      fen,
      category,
      rating,
      toMove: sideToMove === 'w' ? ('white' as const) : ('black' as const),
      solution,
      prompt: prompt.trim() || `Puzzle จาก ${stats.displayName}`,
      themes: ['user-created'],
      authorName: stats.displayName,
    };
    const result = await verifyAndAnnotate(draft);
    if (!result.ok) {
      setFeedback(`✗ Engine reject: ${result.reason}`);
      setVerifying(false);
      return;
    }
    saveUserPuzzle(result.puzzle);
    toast.success(`🧩 บันทึกเรียบร้อย: ${draft.prompt}`);
    setVerifying(false);
    onClose();
  };

  return (
    <div className="custom-puzzle-author">
      <h4>🧩 บันทึกเป็น puzzle</h4>
      <p className="label-aside">
        Engine จะ verify ก่อน · ถ้าไม่ตรง (เช่น สอลูชั่นไม่ใช่ mate จริง) จะปฏิเสธ
      </p>
      <label className="custom-puzzle-field">
        <span>ประเภท</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as PuzzleCategory)}>
          <option value="mate-1">รุกจน 1 ตา</option>
          <option value="mate-2">รุกจน 2+ ตา</option>
          <option value="tactic">ยุทธวิธี</option>
          <option value="counting">นับศักดิ์</option>
          <option value="defense">ป้องกัน / หนีให้รอด</option>
        </select>
      </label>
      <label className="custom-puzzle-field">
        <span>Rating ประมาณ</span>
        <input
          type="number"
          min={400}
          max={2400}
          step={50}
          value={rating}
          onChange={(e) => setRating(parseInt(e.target.value) || 800)}
        />
      </label>
      <label className="custom-puzzle-field">
        <span>คำใบ้/หัวข้อ</span>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="เช่น 'ขาวเดิน · รุกจน 1 ตา'"
          maxLength={120}
        />
      </label>
      <label className="custom-puzzle-field custom-puzzle-solution">
        <span>ลำดับตา (UCI · คั่นด้วยช่องว่าง)</span>
        <div className="custom-puzzle-solution-row">
          <input
            type="text"
            value={solutionText}
            onChange={(e) => setSolutionText(e.target.value)}
            placeholder="เช่น 'a1a8' หรือ 'h5h7 a8b8 h7h8'"
            spellCheck={false}
          />
          <button
            type="button"
            className="custom-puzzle-suggest"
            onClick={handleAutoSuggest}
            disabled={suggesting || verifying}
            title="ให้ engine เดินคอม-vs-คอม จากตำแหน่งปัจจุบัน 5 ตา · แก้ได้ก่อน save"
          >
            {suggesting ? '🔍 คิด...' : '🤖 Auto-suggest'}
          </button>
        </div>
      </label>
      {feedback && (
        <div className={`custom-puzzle-feedback ${feedback.startsWith('✗') ? 'bad' : 'good'}`}>
          {feedback}
        </div>
      )}
      <div className="custom-puzzle-actions">
        <button onClick={onClose} className="secondary">ยกเลิก</button>
        <button onClick={handleSave} disabled={verifying}>
          {verifying ? '🔍 กำลัง verify...' : '✓ verify & บันทึก'}
        </button>
      </div>
    </div>
  );
}
