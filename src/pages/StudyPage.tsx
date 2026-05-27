// 📖 ศึกษา — combined study browser for Openings + Endgames + Tactic
// themes. Sub-tabs at the top let the user pick which content type;
// each section pulls from the existing content/manifest pipeline so
// adding more entries is JSON-only (no code change needed here).
//
// Why a single tab with sub-tabs (not 3 separate tabs):
//   - Keeps the top-nav tidy (still 9 tabs after this addition).
//   - All three share the "browse + view" interaction model; same
//     UX patterns reused across.
//   - Cross-linking (e.g. an opening footnote that references an
//     endgame study) becomes a same-tab navigation.

import { useEffect, useMemo, useState } from 'react';
import {
  loadEndgames,
  loadMasterGames,
  loadOpenings,
  loadTacticsThemes,
} from '../lib/content';
import type {
  EndgameStudy,
  MasterGame,
  Opening,
  TacticTheme,
} from '../lib/extraContentSchema';
import { Board } from '../components/Board';
import { MAKRUK_START_FEN, loadFfish } from '../lib/makruk';
import { thaiUci } from '../lib/thaiUci';
import { SkeletonGrid } from '../components/Skeleton';

type StudySubTab = 'openings' | 'endgames' | 'themes' | 'master';

const SUBTABS: { id: StudySubTab; label: string }[] = [
  { id: 'openings', label: '📖 หมากเปิด' },
  { id: 'endgames', label: '🏁 หมากปลายเกม' },
  { id: 'themes', label: '🎯 ยุทธวิธีตามหัวข้อ' },
  { id: 'master', label: '👑 เกมตัวอย่าง' },
];

export function StudyPage({
  onLoadPuzzleTheme,
}: {
  /** Called when a tactic-theme card is opened — caller navigates to
   *  the Puzzles tab with the theme filter pre-selected. */
  onLoadPuzzleTheme?: (matchTag: string) => void;
} = {}) {
  const [tab, setTab] = useState<StudySubTab>('openings');
  return (
    <div className="study-page">
      <header className="study-header">
        <h2>📖 ทฤษฎี · เปิดเกม · จบเกม · ธีมยุทธวิธี</h2>
        <p className="label-aside">
          เปิด · ปิดท้าย · ยุทธวิธี — เนื้อหาวิชาการ จัดกลุ่มตามประเภท
        </p>
        <div className="study-banner-row">
          <button
            className="study-trainer-banner"
            onClick={() => { window.location.hash = '#/movetrainer'; }}
          >
            🎯 Move Trainer · ฝึกจำ opening ทีละตา →
          </button>
          <button
            className="study-trainer-banner"
            onClick={() => { window.location.hash = '#/pattern'; }}
          >
            🧠 Pattern Recognition · 10 รอบ visualization →
          </button>
        </div>
      </header>

      <div className="study-subtabs" role="tablist">
        {SUBTABS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={tab === s.id}
            className={`study-subtab ${tab === s.id ? 'is-active' : ''}`}
            onClick={() => setTab(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="study-content">
        {tab === 'openings' && <OpeningsSection />}
        {tab === 'endgames' && <EndgamesSection />}
        {tab === 'themes' && (
          <ThemesSection onLoadTheme={onLoadPuzzleTheme} />
        )}
        {tab === 'master' && <MasterGamesSection />}
      </div>
    </div>
  );
}

// ─── Openings ─────────────────────────────────────────────────────

function OpeningsSection() {
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadOpenings()
      .then((data) => setOpenings(data))
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p className="study-error">⚠ โหลด openings ไม่สำเร็จ: {err}</p>;
  if (!openings) return <SkeletonGrid count={5} withThumb={false} />;
  if (openings.length === 0) {
    return <p className="study-empty">🚧 ยังไม่มี opening · เพิ่มได้ผ่าน JSON</p>;
  }
  const active = openings.find((o) => o.id === activeId);
  if (active) {
    return <OpeningView opening={active} onClose={() => setActiveId(null)} />;
  }
  return (
    <div className="study-list">
      {openings.map((op) => (
        <button
          key={op.id}
          className="study-card"
          onClick={() => setActiveId(op.id)}
        >
          <div className="study-card-title">{op.name}</div>
          <div className="study-card-meta">
            {op.moves.length} ตา · {op.themes.join(' · ')}
            {op.ratingBand && (
              <> · rating {op.ratingBand.min}-{op.ratingBand.max}</>
            )}
          </div>
          <div className="study-card-desc">{op.description}</div>
        </button>
      ))}
    </div>
  );
}

function OpeningView({ opening, onClose }: { opening: Opening; onClose: () => void }) {
  // Replay through ffish to compute the FEN at each ply.
  const [fens, setFens] = useState<string[]>([MAKRUK_START_FEN]);
  const [ply, setPly] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadFfish().then((ffish) => {
      if (cancelled) return;
      const board = new ffish.Board('makruk', MAKRUK_START_FEN);
      const out: string[] = [MAKRUK_START_FEN];
      try {
        // Guard: a malformed dataset entry shouldn't crash the page.
        // ffish.push throws if the move is illegal in the current
        // position; we surface the bad ply, freeze the replay at the
        // last known-good FEN, and let the user navigate what's valid.
        for (let i = 0; i < opening.moves.length; i++) {
          const mv = opening.moves[i];
          try {
            board.push(mv);
            out.push(board.fen());
          } catch (e) {
            console.warn('study.opening.invalidMove', { openingId: opening.id, ply: i, mv, err: String(e) });
            break;
          }
        }
        setFens(out);
      } finally {
        board.delete();
      }
    });
    return () => { cancelled = true; };
  }, [opening.id]);
  // Clamp ply to the validated-length we actually built — if the data
  // had a bad move at ply N, fens has length N+1 and the slider can't
  // step past it.
  const maxPly = Math.max(0, fens.length - 1);
  const safePly = Math.min(ply, maxPly);
  const currentFen = fens[safePly] ?? MAKRUK_START_FEN;
  const lastMoveUci = safePly > 0 ? opening.moves[safePly - 1] : null;
  return (
    <div className="study-view">
      <button className="study-back" onClick={onClose}>
        ← กลับ
      </button>
      <h3>{opening.name}</h3>
      <p className="study-view-desc">{opening.description}</p>
      <div className="study-view-board">
        <Board
          fen={currentFen}
          legalMoves={[]}
          flipped={false}
          disabled
          turn="white"
          isCheck={false}
          lastMove={lastMoveUci ? { from: lastMoveUci.slice(0, 2), to: lastMoveUci.slice(2, 4) } : null}
          hint={null}
          onMove={() => undefined}
        />
      </div>
      <div className="study-view-stepper">
        <button onClick={() => setPly(0)} disabled={ply === 0}>⏮</button>
        <button onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0}>◀</button>
        <span className="label-aside">
          ตา {ply} / {opening.moves.length}
        </span>
        <button
          onClick={() => setPly((p) => Math.min(opening.moves.length, p + 1))}
          disabled={ply === opening.moves.length}
        >▶</button>
        <button onClick={() => setPly(opening.moves.length)} disabled={ply === opening.moves.length}>⏭</button>
      </div>
      <div className="study-view-line">
        <span className="label">ลำดับตา:</span>{' '}
        {opening.moves.map((mv, i) => (
          <button
            key={i}
            className={`study-move ${i + 1 === ply ? 'is-current' : ''}`}
            onClick={() => setPly(i + 1)}
          >
            {thaiUci(mv)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Endgames ─────────────────────────────────────────────────────

function EndgamesSection() {
  const [endgames, setEndgames] = useState<EndgameStudy[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadEndgames()
      .then((data) => setEndgames(data))
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p className="study-error">⚠ โหลด endgames ไม่สำเร็จ: {err}</p>;
  if (!endgames) return <SkeletonGrid count={5} withThumb={false} />;
  if (endgames.length === 0) {
    return <p className="study-empty">🚧 ยังไม่มี endgame · เพิ่มได้ผ่าน JSON</p>;
  }
  const active = endgames.find((e) => e.id === activeId);
  if (active) {
    return <EndgameView endgame={active} onClose={() => setActiveId(null)} />;
  }
  return (
    <div className="study-list">
      {endgames.map((eg) => (
        <button
          key={eg.id}
          className="study-card"
          onClick={() => setActiveId(eg.id)}
        >
          <div className="study-card-title">{eg.title}</div>
          <div className="study-card-meta">
            {eg.category} · {eg.difficulty} · {eg.moves.length} ตา
          </div>
        </button>
      ))}
    </div>
  );
}

function EndgameView({ endgame, onClose }: { endgame: EndgameStudy; onClose: () => void }) {
  const [fens, setFens] = useState<string[]>([endgame.fen]);
  const [ply, setPly] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadFfish().then((ffish) => {
      if (cancelled) return;
      const board = new ffish.Board('makruk', endgame.fen);
      const out: string[] = [endgame.fen];
      try {
        for (let i = 0; i < endgame.moves.length; i++) {
          const mv = endgame.moves[i];
          try {
            board.push(mv);
            out.push(board.fen());
          } catch (e) {
            console.warn('study.endgame.invalidMove', { endgameId: endgame.id, ply: i, mv, err: String(e) });
            break;
          }
        }
        setFens(out);
      } finally {
        board.delete();
      }
    });
    return () => { cancelled = true; };
  }, [endgame.id]);
  const maxPly = Math.max(0, fens.length - 1);
  const safePly = Math.min(ply, maxPly);
  const currentFen = fens[safePly] ?? endgame.fen;
  const lastMoveUci = safePly > 0 ? endgame.moves[safePly - 1] : null;
  const note = useMemo(
    () => endgame.commentary.find((c) => c.plyAfter === ply),
    [endgame.commentary, ply],
  );
  return (
    <div className="study-view">
      <button className="study-back" onClick={onClose}>← กลับ</button>
      <h3>{endgame.title}</h3>
      <div className="study-view-board">
        <Board
          fen={currentFen}
          legalMoves={[]}
          flipped={false}
          disabled
          turn={ply % 2 === 0 ? 'white' : 'black'}
          isCheck={false}
          lastMove={lastMoveUci ? { from: lastMoveUci.slice(0, 2), to: lastMoveUci.slice(2, 4) } : null}
          hint={null}
          onMove={() => undefined}
        />
      </div>
      {/* Note slot is always rendered (even when empty) so the page
          height doesn't jump when stepping into / out of an annotated
          ply. min-height reserves a stable two-line block; the dim
          placeholder hints that other plies have commentary. */}
      <div className={`study-view-note${note ? '' : ' is-empty'}`} aria-live="polite">
        {note ? <>📝 {note.text}</> : <span className="label-aside">— ตานี้ไม่มีคำอธิบายเพิ่มเติม —</span>}
      </div>
      <div className="study-view-stepper">
        <button onClick={() => setPly(0)} disabled={ply === 0}>⏮</button>
        <button onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0}>◀</button>
        <span className="label-aside">ตา {ply} / {endgame.moves.length}</span>
        <button onClick={() => setPly((p) => Math.min(endgame.moves.length, p + 1))} disabled={ply === endgame.moves.length}>▶</button>
        <button onClick={() => setPly(endgame.moves.length)} disabled={ply === endgame.moves.length}>⏭</button>
      </div>
    </div>
  );
}

// ─── Tactic themes ────────────────────────────────────────────────

function ThemesSection({ onLoadTheme }: { onLoadTheme?: (matchTag: string) => void }) {
  const [themes, setThemes] = useState<TacticTheme[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadTacticsThemes()
      .then((data) => setThemes(data))
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p className="study-error">⚠ โหลด themes ไม่สำเร็จ: {err}</p>;
  if (!themes) return <SkeletonGrid count={4} withThumb={false} />;
  if (themes.length === 0) {
    return <p className="study-empty">🚧 ยังไม่มี theme · เพิ่มได้ผ่าน JSON</p>;
  }
  return (
    <div className="study-list">
      {themes.map((th) => (
        <button
          key={th.id}
          className="study-card"
          onClick={() => onLoadTheme?.(th.matchTag)}
        >
          <div className="study-card-title">{th.name}</div>
          <div className="study-card-meta">{th.examplePuzzles.length} ปริศนาตัวอย่าง</div>
          <div className="study-card-desc">{th.description}</div>
        </button>
      ))}
    </div>
  );
}


// ─── Master Games ─────────────────────────────────────────────────

function MasterGamesSection() {
  const [games, setGames] = useState<MasterGame[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadMasterGames()
      .then((data) => setGames(data))
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p className="study-error">⚠ โหลด master games ไม่สำเร็จ: {err}</p>;
  if (!games) return <SkeletonGrid count={3} withThumb={false} />;
  if (games.length === 0) {
    return <p className="study-empty">🚧 ยังไม่มีเกมตัวอย่าง · เพิ่มได้ผ่าน JSON</p>;
  }
  const active = games.find((g) => g.id === activeId);
  if (active) {
    return <MasterGameView game={active} onClose={() => setActiveId(null)} />;
  }
  return (
    <div className="study-list">
      {games.map((g) => (
        <button
          key={g.id}
          className="study-card"
          onClick={() => setActiveId(g.id)}
        >
          <div className="study-card-title">{g.title}</div>
          <div className="study-card-meta">
            {g.whiteName} vs {g.blackName} · {g.result} · {g.moves.length} ply
          </div>
          <div className="study-card-desc">{g.subtitle}</div>
        </button>
      ))}
    </div>
  );
}

function MasterGameView({ game, onClose }: { game: MasterGame; onClose: () => void }) {
  const [fens, setFens] = useState<string[]>([MAKRUK_START_FEN]);
  const [ply, setPly] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadFfish().then((ffish) => {
      if (cancelled) return;
       
      const ffishAny = ffish as any;
      const board = new ffishAny.Board('makruk', MAKRUK_START_FEN);
      const out: string[] = [MAKRUK_START_FEN];
      try {
        for (let i = 0; i < game.moves.length; i++) {
          const mv = game.moves[i];
          try {
            board.push(mv);
            out.push(board.fen());
          } catch (e) {
            console.warn('study.masterGame.invalidMove', { gameId: game.id, ply: i, mv, err: String(e) });
            break;
          }
        }
        setFens(out);
      } finally {
        board.delete();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  const maxPly = Math.max(0, fens.length - 1);
  const safePly = Math.min(ply, maxPly);
  const currentFen = fens[safePly] ?? MAKRUK_START_FEN;
  const lastMoveUci = safePly > 0 ? game.moves[safePly - 1] : null;
  const note = useMemo(
    () => game.commentary.find((c) => c.plyAfter === ply),
    [game.commentary, ply],
  );

  return (
    <div className="study-view">
      <button className="study-back" onClick={onClose}>← กลับ</button>
      <h3>{game.title}</h3>
      <p className="study-view-desc">
        {game.whiteName} vs {game.blackName} · ผลลัพธ์ <strong>{game.result}</strong>
      </p>
      <div className="study-view-board">
        <Board
          fen={currentFen}
          legalMoves={[]}
          flipped={false}
          disabled
          turn={ply % 2 === 0 ? 'white' : 'black'}
          isCheck={false}
          lastMove={lastMoveUci ? { from: lastMoveUci.slice(0, 2), to: lastMoveUci.slice(2, 4) } : null}
          hint={null}
          onMove={() => undefined}
        />
      </div>
      {/* Note slot is always rendered (even when empty) so the page
          height doesn't jump when stepping into / out of an annotated
          ply. min-height reserves a stable two-line block; the dim
          placeholder hints that other plies have commentary. */}
      <div className={`study-view-note${note ? '' : ' is-empty'}`} aria-live="polite">
        {note ? <>📝 {note.text}</> : <span className="label-aside">— ตานี้ไม่มีคำอธิบายเพิ่มเติม —</span>}
      </div>
      <div className="study-view-stepper">
        <button onClick={() => setPly(0)} disabled={ply === 0}>⏮</button>
        <button onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0}>◀</button>
        <span className="label-aside">ตา {ply} / {game.moves.length}</span>
        <button
          onClick={() => setPly((p) => Math.min(game.moves.length, p + 1))}
          disabled={ply === game.moves.length}
        >▶</button>
        <button onClick={() => setPly(game.moves.length)} disabled={ply === game.moves.length}>⏭</button>
      </div>
    </div>
  );
}
