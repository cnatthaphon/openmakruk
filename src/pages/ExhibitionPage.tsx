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
import { BoardLayout } from '../components/BoardLayout';
import { BackButton } from '../components/BackButton';
import { loadFfish, MAKRUK_START_FEN } from '../lib/makruk';
import { navigate } from '../lib/router';

/** Normalize a server-supplied bot tier string into the constrained
 *  TierFilter union. The API returns the raw `users.bot_tier` column
 *  (e.g. 'master', 'boss') — this function just guards against null
 *  (legacy rows) or any unexpected string from a future schema. */
function normalizeTier(tier: string | null): 'rookie' | 'veteran' | 'master' | 'boss' | 'unknown' {
  if (tier === 'rookie' || tier === 'veteran' || tier === 'master' || tier === 'boss') return tier;
  return 'unknown';
}

type TierFilter = 'all' | 'rookie' | 'veteran' | 'master' | 'boss';
const EXHIBITION_CRON_PERIOD_MS = 30 * 60_000;

const TIER_LABELS: Record<TierFilter, string> = {
  all: 'ทุก tier',
  rookie: '🥉 Rookie',
  veteran: '🥈 Veteran',
  master: '🥇 Master',
  boss: '👑 Boss',
};

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
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

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

  // Filter by tier of either participant — a "Master tier" view shows
  // any game where at least one Master-tier bot played, so you don't
  // miss matches where Master beat Veteran (both interesting).
  const filtered = useMemo(() => {
    if (!games) return null;
    if (tierFilter === 'all') return games;
    return games.filter(
      (g) => normalizeTier(g.whiteTier) === tierFilter || normalizeTier(g.blackTier) === tierFilter,
    );
  }, [games, tierFilter]);

  // Per-tier counts for the chip strip. Shows "Master · 3" so the
  // user knows whether selecting a tier will give them content.
  const tierCounts = useMemo(() => {
    const out: Record<TierFilter, number> = {
      all: 0, rookie: 0, veteran: 0, master: 0, boss: 0,
    };
    if (!games) return out;
    out.all = games.length;
    for (const g of games) {
      const tiers = new Set([normalizeTier(g.whiteTier), normalizeTier(g.blackTier)]);
      for (const t of tiers) {
        if (t in out) out[t as TierFilter] += 1;
      }
    }
    return out;
  }, [games]);

  // Time-to-next-cron estimate. The exhibition cron fires every 30
  // min (wrangler.toml). Showing "next match in ~12 min" answers the
  // reviewer's "feels stale" feedback when the last game is hours old.
  const nextCronEta = useMemo(() => {
    if (!games) return null;
    return estimateNextCronEta(games);
  }, [games]);

  return (
    <main className="exhibition-page exhibition-feed">
      <BackButton to="profile">โปรไฟล์</BackButton>
      <header className="exhibition-header">
        <h2>🎬 Bot Exhibition · live</h2>
        <p className="label-aside">
          บอตเล่นกันเองทุก 30 นาที · ดูได้แม้ไม่มีคนเล่นออนไลน์
          {nextCronEta && (
            <> · <strong>match ถัดไป {nextCronEta}</strong></>
          )}
        </p>
      </header>

      {games && games.length > 0 && (
        <div className="exhibition-tier-chips" role="tablist" aria-label="กรองตาม tier">
          {(Object.keys(TIER_LABELS) as TierFilter[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tierFilter === t}
              className={`exhibition-tier-chip${tierFilter === t ? ' is-active' : ''}`}
              onClick={() => setTierFilter(t)}
              disabled={t !== 'all' && tierCounts[t] === 0}
            >
              {TIER_LABELS[t]} · {tierCounts[t]}
            </button>
          ))}
        </div>
      )}

      {!supports && (
        <p className="label-aside">ต้องการ backend ออนไลน์ — รีเฟรชอีกครั้ง</p>
      )}
      {err && <p className="exhibition-error">⚠ {err}</p>}
      {!games && supports && !err && <p className="label-aside">กำลังโหลด…</p>}
      {games && games.length === 0 && (
        <p className="label-aside">
          ยังไม่มีเกม — {nextCronEta ? `match ถัดไป ${nextCronEta}` : 'cron จะสร้างเกมแรกในอีกไม่กี่นาที'}
        </p>
      )}
      {filtered && filtered.length === 0 && games && games.length > 0 && (
        <p className="label-aside">
          ไม่มีเกมใน tier นี้ใน feed ล่าสุด — ลอง “ทุก tier” หรือรอเกมถัดไป
        </p>
      )}
      {filtered && filtered.length > 0 && (
        <div className="exhibition-list">
          {filtered.map((g) => {
            const wTier = normalizeTier(g.whiteTier);
            const bTier = normalizeTier(g.blackTier);
            return (
              <button
                key={g.id}
                className="exhibition-card"
                onClick={() => navigate({ tab: 'exhibition', id: g.id })}
              >
                <div className="exhibition-card-vs">
                  <span className="exhibition-side">
                    <span className="exhibition-avatar">{g.whiteAvatar ?? '🤖'}</span>
                    <span className="exhibition-side-name">{g.whiteName ?? g.whiteBotId}</span>
                    {wTier !== 'unknown' && (
                      <span className={`exhibition-tier-badge is-${wTier}`}>
                        {TIER_LABELS[wTier as TierFilter]}
                      </span>
                    )}
                  </span>
                  <span className={`exhibition-result ${outcomeClass(g.outcome)}`}>
                    {formatOutcome(g.outcome)}
                  </span>
                  <span className="exhibition-side">
                    <span className="exhibition-avatar">{g.blackAvatar ?? '🤖'}</span>
                    <span className="exhibition-side-name">{g.blackName ?? g.blackBotId}</span>
                    {bTier !== 'unknown' && (
                      <span className={`exhibition-tier-badge is-${bTier}`}>
                        {TIER_LABELS[bTier as TierFilter]}
                      </span>
                    )}
                  </span>
                </div>
                <div className="exhibition-card-meta label-aside">
                  {g.plyCount} ตา · {relativeTime(g.createdAt)} · ดู replay →
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

function formatOutcome(o: string): string {
  if (o === 'white-wins') return '⚪ ขาวชนะ';
  if (o === 'black-wins') return '⚫ ดำชนะ';
  if (o === 'draw') return '🤝 เสมอ';
  // 'truncated' = match hit the engine's max-ply cap with no winner.
  // The previous "หมดเทิร์น" label was ambiguous — could mean "turn
  // ended" or "out of time". Spell it out so the card reads cleanly.
  if (o === 'truncated') return '⏱️ ครบจำนวนตา · ไม่มีฝ่ายชนะ';
  return o;
}

function estimateNextCronEta(games: ExhibitionSummary[], now = Date.now()): string {
  const last = games[0]?.createdAt ?? null;
  if (last !== null) {
    const diffFromLastGame = last + EXHIBITION_CRON_PERIOD_MS - now;
    if (diffFromLastGame > 0) return formatEta(diffFromLastGame);
  }

  const nextCronSlot =
    Math.floor(now / EXHIBITION_CRON_PERIOD_MS) * EXHIBITION_CRON_PERIOD_MS
    + EXHIBITION_CRON_PERIOD_MS;
  return formatEta(nextCronSlot - now);
}

function formatEta(diffMs: number): string {
  if (diffMs <= 0) return 'เร็วๆ นี้';
  const mins = Math.ceil(diffMs / 60_000);
  return mins < 1 ? 'น้อยกว่า 1 นาที' : `~${mins} นาที`;
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
        <BackButton to="exhibition">รายการ</BackButton>
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
      <BackButton to="exhibition">รายการ</BackButton>
      <BoardLayout
        left={
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
        }
        board={
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
        }
        right={
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
        }
      />
    </main>
  );
}
