// 🎬 Bot Exhibition page — recent bot-vs-bot games + replay viewer.
//
// Routes:
//   /#/exhibition         → list of last ~20 games
//   /#/exhibition/<id>    → replay viewer for one game
//
// Why this matters: even with 0 active users, the cron generates fresh
// content every 30 minutes, so a first-time visitor lands on a page
// that feels alive. The reviewer's framing: "Live" tab is never empty.

import { useEffect, useMemo, useState } from 'react';
import { getBackend } from '../lib/backend';
import type {
  ExhibitionGame,
  ExhibitionSummary,
} from '../lib/backend/types';
import { Board } from '../components/Board';
import { loadFfish, MAKRUK_START_FEN } from '../lib/makruk';
import { navigate } from '../lib/router';

type Props = {
  gameId: string | null;
};

export function ExhibitionPage({ gameId }: Props) {
  if (gameId) return <ExhibitionReplay gameId={gameId} />;
  return <ExhibitionFeed />;
}

// ─── Feed (list of recent games) ─────────────────────────────────

function ExhibitionFeed() {
  const backend = getBackend();
  const supports = backend.fetchExhibitionRecent !== undefined;
  const [games, setGames] = useState<ExhibitionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!supports || !backend.fetchExhibitionRecent) return;
    let cancelled = false;
    backend
      .fetchExhibitionRecent()
      .then((g) => {
        if (!cancelled) setGames(g);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [supports, backend]);

  return (
    <main className="exhibition-page exhibition-feed">
      <button className="exhibition-back" onClick={() => navigate({ tab: 'profile' })}>
        ← กลับโปรไฟล์
      </button>
      <header className="exhibition-header">
        <h2>🎬 Bot Exhibition · live</h2>
        <p className="label-aside">
          บอตเล่นกันเองทุก 30 นาที · ดูได้แม้ไม่มีคนเล่นออนไลน์
        </p>
      </header>

      {!supports && (
        <p className="label-aside">ต้องการ backend ออนไลน์ — รีเฟรชอีกครั้ง</p>
      )}
      {err && <p className="exhibition-error">⚠ {err}</p>}
      {!games && supports && !err && <p className="label-aside">กำลังโหลด…</p>}
      {games && games.length === 0 && (
        <p className="label-aside">
          ยังไม่มีเกม — cron จะสร้างเกมแรกในอีกไม่กี่นาที
        </p>
      )}
      {games && games.length > 0 && (
        <div className="exhibition-list">
          {games.map((g) => (
            <button
              key={g.id}
              className="exhibition-card"
              onClick={() => navigate({ tab: 'exhibition', id: g.id })}
            >
              <div className="exhibition-card-vs">
                <span className="exhibition-side">
                  <span className="exhibition-avatar">{g.whiteAvatar ?? '🤖'}</span>
                  {g.whiteName ?? g.whiteBotId}
                </span>
                <span className={`exhibition-result ${outcomeClass(g.outcome)}`}>
                  {formatOutcome(g.outcome)}
                </span>
                <span className="exhibition-side">
                  <span className="exhibition-avatar">{g.blackAvatar ?? '🤖'}</span>
                  {g.blackName ?? g.blackBotId}
                </span>
              </div>
              <div className="exhibition-card-meta label-aside">
                {g.plyCount} ตา · {relativeTime(g.createdAt)} · ดู replay →
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

function formatOutcome(o: string): string {
  if (o === 'white-wins') return 'ขาวชนะ';
  if (o === 'black-wins') return 'ดำชนะ';
  if (o === 'draw') return 'เสมอ';
  if (o === 'truncated') return 'หมดเทิร์น';
  return o;
}
function outcomeClass(o: string): string {
  if (o === 'white-wins') return 'is-white';
  if (o === 'black-wins') return 'is-black';
  return 'is-draw';
}
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'เมื่อกี้';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

// ─── Replay viewer ───────────────────────────────────────────────

function ExhibitionReplay({ gameId }: { gameId: string }) {
  const backend = getBackend();
  const supports = backend.fetchExhibitionGame !== undefined;
  const [game, setGame] = useState<ExhibitionGame | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ply, setPly] = useState(0);
  const [fens, setFens] = useState<string[]>([MAKRUK_START_FEN]);

  useEffect(() => {
    if (!supports || !backend.fetchExhibitionGame) return;
    let cancelled = false;
    backend
      .fetchExhibitionGame(gameId)
      .then((g) => {
        if (cancelled) return;
        if (!g) setErr('ไม่พบเกม');
        else setGame(g);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, supports, backend]);

  // Replay through ffish once we have the moves array to compute the
  // FEN at every ply. Keeps the stepper instant after first load.
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    loadFfish().then((ffish) => {
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ffishAny = ffish as any;
      const board = new ffishAny.Board('makruk', MAKRUK_START_FEN);
      const out: string[] = [MAKRUK_START_FEN];
      try {
        for (const mv of game.moves) {
          board.push(mv);
          out.push(board.fen());
        }
        setFens(out);
      } finally {
        board.delete();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [game]);

  const currentFen = useMemo(
    () => fens[Math.min(ply, fens.length - 1)] ?? MAKRUK_START_FEN,
    [fens, ply],
  );
  const lastMoveUci = game && ply > 0 ? game.moves[ply - 1] : null;

  if (err) {
    return (
      <main className="exhibition-page">
        <button className="exhibition-back" onClick={() => navigate({ tab: 'exhibition' })}>
          ← กลับรายการ
        </button>
        <p className="exhibition-error">⚠ {err}</p>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="exhibition-page">
        <p className="label-aside">กำลังโหลด replay…</p>
      </main>
    );
  }

  return (
    <main className="exhibition-page exhibition-replay">
      <button className="exhibition-back" onClick={() => navigate({ tab: 'exhibition' })}>
        ← กลับรายการ
      </button>

      <header className="exhibition-replay-header">
        <div className="exhibition-replay-vs">
          <span className="exhibition-side">
            <span className="exhibition-avatar">{game.whiteAvatar ?? '🤖'}</span>
            {game.whiteName ?? game.whiteBotId}
          </span>
          <span className={`exhibition-result ${outcomeClass(game.outcome)}`}>
            {formatOutcome(game.outcome)}
          </span>
          <span className="exhibition-side">
            <span className="exhibition-avatar">{game.blackAvatar ?? '🤖'}</span>
            {game.blackName ?? game.blackBotId}
          </span>
        </div>
        <p className="label-aside">
          {game.plyCount} ตา · {relativeTime(game.createdAt)}
        </p>
      </header>

      <div className="exhibition-replay-board">
        <Board
          fen={currentFen}
          legalMoves={[]}
          flipped={false}
          disabled
          turn={ply % 2 === 0 ? 'white' : 'black'}
          isCheck={false}
          lastMove={
            lastMoveUci
              ? { from: lastMoveUci.slice(0, 2), to: lastMoveUci.slice(2, 4) }
              : null
          }
          hint={null}
          onMove={() => undefined}
        />
      </div>

      <div className="exhibition-stepper">
        <button onClick={() => setPly(0)} disabled={ply === 0}>⏮</button>
        <button onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0}>◀</button>
        <span className="label-aside">
          ตา {ply} / {game.moves.length}
        </span>
        <button
          onClick={() => setPly((p) => Math.min(game.moves.length, p + 1))}
          disabled={ply === game.moves.length}
        >
          ▶
        </button>
        <button
          onClick={() => setPly(game.moves.length)}
          disabled={ply === game.moves.length}
        >
          ⏭
        </button>
      </div>
    </main>
  );
}
