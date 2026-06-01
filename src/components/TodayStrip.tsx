// 📅 "วันนี้" feed — a 3-chip horizontal strip on the home (Play)
// tab giving every visitor a reason to come back tomorrow:
//
//   ⭐ ปริศนาวันนี้  → today's daily puzzle (deterministic, same for everyone)
//   🏆 ทัวร์ถัดไป   → active or soonest upcoming tournament
//   📖 ทำต่อ        → first unfinished lesson (if any)
//
// Renders nothing when none of the three have content (e.g., empty
// puzzle pool + user finished all lessons + no tournaments) — failure-
// mode is silent, not empty-box.
//
// Why on Play tab only: the feed answers "what should I do today?"
// which is a home-screen question, not a per-tab one. ActivityTicker
// already covers "what's happening community-wide" globally; this
// covers "what's next for ME today" specifically.

import { useEffect, useState } from 'react';
import { loadLessons, loadPuzzles } from '../lib/content';
import { dailyDifficultyBand, isDailySolvedToday, pickDailyPuzzle } from '../lib/dailyPuzzle';
import { loadLessonProgress } from '../lib/learnProgress';
import { getBackend } from '../lib/backend';
import type {
  BotCharacter,
  ExhibitionSummary,
  TournamentInfo,
} from '../lib/backend/types';
import { navigate } from '../lib/router';
import { loadStats } from '../lib/stats';

type DailyChip = {
  id: string;
  rating: number;
  solved: boolean;
};

type LessonChip = {
  id: string;
  title: string;
};

type RivalChip = {
  botId: string;
  displayName: string;
  avatar: string;
  /** Bot's wins MINUS the user's wins against it — positive = bot
   *  has the edge, which is when the rivalry banner is most
   *  motivating ("go back and take revenge"). */
  botEdge: number;
  recentGamesAgainst: number;
};

type SuggestionChip = {
  botId: string;
  displayName: string;
  avatar: string;
  rating: number;
  /** Why this bot — used in the chip subtitle. */
  reason: 'level-match' | 'fresh';
};

export function TodayStrip() {
  const [daily, setDaily] = useState<DailyChip | null>(null);
  const [nextLesson, setNextLesson] = useState<LessonChip | null>(null);
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [rival, setRival] = useState<RivalChip | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionChip | null>(null);
  const [latestExhibition, setLatestExhibition] = useState<ExhibitionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadPuzzles()
      .then((puzzles) => {
        if (cancelled) return;
        const p = pickDailyPuzzle(puzzles);
        if (p) {
          setDaily({
            id: p.id,
            rating: p.rating,
            solved: isDailySolvedToday(),
          });
        }
      })
      .catch(() => undefined);

    loadLessons()
      .then((lessons) => {
        if (cancelled) return;
        const progress = loadLessonProgress();
        const next = lessons.find((l) => !progress.completed.has(l.id));
        if (next) setNextLesson({ id: next.id, title: next.title });
      })
      .catch(() => undefined);

    const backend = getBackend();
    if (backend.fetchTournaments) {
      backend
        .fetchTournaments()
        .then((ts) => {
          if (cancelled) return;
          const active = ts.find((t) => t.active);
          const upcoming = ts
            .filter(
              (t) =>
                t.upcomingStartsAt !== null && t.upcomingStartsAt > Date.now(),
            )
            .sort(
              (a, b) =>
                (a.upcomingStartsAt ?? 0) - (b.upcomingStartsAt ?? 0),
            )[0];
          setTournament(active ?? upcoming ?? null);
        })
        .catch(() => undefined);
    }

    // Bot-derived chips: rivalry (active user losing to a bot) AND
    // a level-matched suggestion (a bot near the user's rating that
    // they haven't played in their last several games). Both need
    // the bot roster, so we fetch once and dispatch both.
    if (backend.fetchBots) {
      const stats = loadStats();
      const localHistory = stats.history;
      const userRating = stats.rating;
      const botGames = localHistory.filter((g) => g.opponentId.startsWith('bot:'));

      // Tally per bot id from the user's POV — feeds the rivalry pick.
      type Tally = { wins: number; losses: number; total: number };
      const tally = new Map<string, Tally>();
      for (const g of botGames) {
        const id = g.opponentId;
        const cur = tally.get(id) ?? { wins: 0, losses: 0, total: 0 };
        cur.total++;
        if (g.outcome === 'win') cur.wins++;
        else if (g.outcome === 'loss') cur.losses++;
        tally.set(id, cur);
      }

      // Last-3-opponents set — used to keep the suggestion fresh.
      const recentOpponents = new Set(botGames.slice(-3).map((g) => g.opponentId));

      backend
        .fetchBots()
        .then((bots: BotCharacter[]) => {
          if (cancelled) return;

          // --- Rivalry pick: largest losses-minus-wins, min 3 games.
          let rivalId: string | null = null;
          let rivalEdge = 0;
          let rivalTotal = 0;
          for (const [id, t] of tally.entries()) {
            if (t.total < 3) continue;
            const edge = t.losses - t.wins;
            if (edge > rivalEdge) {
              rivalEdge = edge;
              rivalId = id;
              rivalTotal = t.total;
            }
          }
          if (rivalId) {
            const bot = bots.find((b) => b.id === rivalId);
            if (bot) {
              setRival({
                botId: bot.id,
                displayName: bot.displayName,
                avatar: bot.avatar,
                botEdge: rivalEdge,
                recentGamesAgainst: rivalTotal,
              });
            }
          }

          // --- Level-match suggestion: bot rating closest to user's
          //     rating + 25 (slight stretch upward — beating someone
          //     marginally above you is the most rating-rewarding
          //     and personally-motivating). Skip rivalry candidate
          //     (covered separately) AND the last 3 opponents (so
          //     the chip rotates instead of nagging the same bot).
          //     If there's no rating data yet (new user), bias toward
          //     a Rookie tier bot near 950 — the "starter" experience.
          const target = userRating > 0 ? userRating + 25 : 950;
          const candidates = bots
            .filter((b) =>
              b.id !== rivalId
              && !recentOpponents.has(b.id)
              && b.rating > 0,
            )
            .map((b) => ({ bot: b, gap: Math.abs(b.rating - target) }))
            .sort((a, b) => a.gap - b.gap);
          const best = candidates[0]?.bot;
          if (best) {
            setSuggestion({
              botId: best.id,
              displayName: best.displayName,
              avatar: best.avatar,
              rating: best.rating,
              reason: userRating > 0 ? 'level-match' : 'fresh',
            });
          }
        })
        .catch(() => undefined);
    }

    // Latest bot-vs-bot exhibition game — surfaces /#/exhibition (a
    // hidden route) via "what's been happening" framing. Players who
    // never browse the menu still see that bots played 22h ago and
    // can tap to watch the replay.
    if (backend.fetchExhibitionRecent) {
      backend
        .fetchExhibitionRecent()
        .then((games) => {
          if (cancelled) return;
          const first = games[0];
          if (first) setLatestExhibition(first);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  if (!daily && !nextLesson && !tournament && !rival && !latestExhibition && !suggestion) return null;

  return (
    <div className="today-strip" aria-label="วันนี้">
      <div className="today-strip-label" aria-hidden="true">
        📅 วันนี้
      </div>
      <div className="today-strip-items">
        {daily && (() => {
          const band = dailyDifficultyBand();
          return (
            <button
              className={`today-chip ${daily.solved ? 'is-done' : ''}`}
              onClick={() => navigate({ tab: 'puzzles', id: daily.id })}
              title={daily.solved ? 'แก้แล้ววันนี้ — กลับไปดูได้' : `${band.dayLabel} · band ${band.min}-${band.max} · ลองแก้`}
            >
              <span className="today-chip-icon" aria-hidden="true">
                ⭐
              </span>
              <span className="today-chip-body">
                <span className="today-chip-title">ปริศนา {band.dayLabel}</span>
                <span className="today-chip-meta">
                  rating {daily.rating}
                  {daily.solved && ' · ✓ แก้แล้ว'}
                </span>
              </span>
            </button>
          );
        })()}

        {tournament && (
          <button
            className={`today-chip ${tournament.active ? 'is-active' : ''}`}
            onClick={() => navigate({ tab: 'profile' })}
            title="ดูรายละเอียดทัวร์นาเมนต์ที่หน้าโปรไฟล์"
          >
            <span className="today-chip-icon" aria-hidden="true">
              {tournament.icon}
            </span>
            <span className="today-chip-body">
              <span className="today-chip-title">{tournament.nameTh}</span>
              <span className="today-chip-meta">
                {tournament.active
                  ? `กำลังจัด · ×${tournament.multiplier}`
                  : countdownText(tournament.upcomingStartsAt)}
              </span>
            </span>
          </button>
        )}

        {nextLesson && (
          <button
            className="today-chip"
            onClick={() =>
              navigate({ tab: 'learn', id: nextLesson.id })
            }
            title={nextLesson.title}
          >
            <span className="today-chip-icon" aria-hidden="true">
              📖
            </span>
            <span className="today-chip-body">
              <span className="today-chip-title">ทำต่อ</span>
              <span className="today-chip-meta">{nextLesson.title}</span>
            </span>
          </button>
        )}

        {suggestion && (
          <button
            className="today-chip today-chip-suggestion"
            onClick={() => navigate({ tab: 'bots', id: suggestion.botId })}
            title={
              suggestion.reason === 'level-match'
                ? `ลองสู้ ${suggestion.displayName} — rating ใกล้คุณ`
                : `เริ่มต้นกับ ${suggestion.displayName} — เลเวลเหมาะมือใหม่`
            }
          >
            <span className="today-chip-icon" aria-hidden="true">
              {suggestion.avatar}
            </span>
            <span className="today-chip-body">
              <span className="today-chip-title">
                ลองสู้ {suggestion.displayName}
              </span>
              <span className="today-chip-meta">
                {suggestion.reason === 'level-match'
                  ? `เลเวลเหมาะ · rating ${suggestion.rating}`
                  : `เริ่มต้นได้ · rating ${suggestion.rating}`}
              </span>
            </span>
          </button>
        )}

        {rival && (
          <button
            className="today-chip today-chip-rivalry"
            onClick={() => navigate({ tab: 'bots', id: rival.botId })}
            title={`${rival.displayName} ชนะคุณ ${rival.botEdge} เกมในล่าสุด — ไปแก้ตัว`}
          >
            <span className="today-chip-icon" aria-hidden="true">
              {rival.avatar}
            </span>
            <span className="today-chip-body">
              <span className="today-chip-title">แก้ตัวกับ {rival.displayName}</span>
              <span className="today-chip-meta">
                แพ้นำ {rival.botEdge} จาก {rival.recentGamesAgainst} เกม
              </span>
            </span>
          </button>
        )}

        {latestExhibition && (() => {
          const x = latestExhibition;
          const wAv = x.whiteAvatar ?? '⚪';
          const bAv = x.blackAvatar ?? '⚫';
          const wName = x.whiteName ?? 'ขาว';
          const bName = x.blackName ?? 'ดำ';
          return (
            <button
              className="today-chip today-chip-exhibition"
              onClick={() => navigate({ tab: 'exhibition', id: x.id })}
              title={`บอตเล่นกัน — ${wName} vs ${bName} · ${outcomeLabel(x.outcome)} · ${timeAgo(x.createdAt)}`}
            >
              <span className="today-chip-icon" aria-hidden="true">🎬</span>
              <span className="today-chip-body">
                <span className="today-chip-title">
                  {wAv} {wName} vs {bAv} {bName}
                </span>
                <span className="today-chip-meta">
                  {outcomeLabel(x.outcome)} · {timeAgo(x.createdAt)} · {x.plyCount} ตา
                </span>
              </span>
            </button>
          );
        })()}
      </div>
    </div>
  );
}

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'white-wins': return '⚪ ขาวชนะ';
    case 'black-wins': return '⚫ ดำชนะ';
    case 'draw': return '🤝 เสมอ';
    case 'truncated': return '⏱ ตัดเกม';
    default: return outcome;
  }
}

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'เมื่อสักครู่';
  if (hours < 24) return `${hours} ชม.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} วัน`;
  const weeks = Math.floor(days / 7);
  return `${weeks} สัปดาห์`;
}

function countdownText(ts: number | null): string {
  if (!ts) return '';
  const ms = ts - Date.now();
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'เร็วๆ นี้';
  if (days === 1) return 'พรุ่งนี้';
  return `อีก ${days} วัน`;
}
