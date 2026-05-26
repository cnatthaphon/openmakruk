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
import type { BotCharacter, TournamentInfo } from '../lib/backend/types';
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

export function TodayStrip() {
  const [daily, setDaily] = useState<DailyChip | null>(null);
  const [nextLesson, setNextLesson] = useState<LessonChip | null>(null);
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [rival, setRival] = useState<RivalChip | null>(null);

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

    // Rivalry — find a bot that has played the local user enough and
    // currently leads the head-to-head. Local history is the source
    // of truth because cloud sync is optional; we filter for opponent
    // ids starting with `bot:` and group by opponent.
    if (backend.fetchBots) {
      const localHistory = loadStats().history;
      const botGames = localHistory.filter((g) =>
        typeof g.opponent === 'string' && g.opponent.startsWith('bot:'),
      );
      if (botGames.length >= 3) {
        // Tally per bot id from the user's POV.
        type Tally = { wins: number; losses: number; total: number };
        const tally = new Map<string, Tally>();
        for (const g of botGames) {
          const id = String(g.opponent);
          const cur = tally.get(id) ?? { wins: 0, losses: 0, total: 0 };
          cur.total++;
          if (g.outcome === 'win') cur.wins++;
          else if (g.outcome === 'loss') cur.losses++;
          tally.set(id, cur);
        }
        // Pick the bot with the largest (losses - wins) — i.e. the
        // one the user is losing to most. Need at least 3 decided
        // games against the same bot for it to count as a rivalry.
        let bestId: string | null = null;
        let bestEdge = 0;
        let bestTotal = 0;
        for (const [id, t] of tally.entries()) {
          if (t.total < 3) continue;
          const edge = t.losses - t.wins;
          if (edge > bestEdge) {
            bestEdge = edge;
            bestId = id;
            bestTotal = t.total;
          }
        }
        if (bestId) {
          backend
            .fetchBots()
            .then((bots: BotCharacter[]) => {
              if (cancelled) return;
              const bot = bots.find((b) => b.id === bestId);
              if (bot) {
                setRival({
                  botId: bot.id,
                  displayName: bot.displayName,
                  avatar: bot.avatar,
                  botEdge: bestEdge,
                  recentGamesAgainst: bestTotal,
                });
              }
            })
            .catch(() => undefined);
        }
      }
    }

    return () => {
      cancelled = true;
    };
  }, []);

  if (!daily && !nextLesson && !tournament && !rival) return null;

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
      </div>
    </div>
  );
}

function countdownText(ts: number | null): string {
  if (!ts) return '';
  const ms = ts - Date.now();
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'เร็วๆ นี้';
  if (days === 1) return 'พรุ่งนี้';
  return `อีก ${days} วัน`;
}
