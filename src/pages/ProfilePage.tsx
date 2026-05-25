// Profile tab — full version of what the sidebar mini-profile shows.
// Username editable, rating panel, recent games list, achievements
// scaffolding, export/import buttons. No graph yet (Phase 1.x adds D3).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CPU_RATINGS,
  exportStatsJSON,
  importStatsJSON,
  loadStats,
  recommendedLevel,
  saveStats,
  type GameRecord,
  type UserStats,
} from '../lib/stats';
import { DIFFICULTY_LABELS, type Difficulty } from '../lib/engine';
import { downloadPgn, gameToPgn, gamesToPgn } from '../lib/pgn';
import { toast } from '../components/Toast';
import { loadStreak } from '../lib/streak';
import { ACHIEVEMENTS, loadUnlocks } from '../lib/achievements';
import { computeMatchLeaderboard, formatScore } from '../lib/leaderboard';
import { getBackend } from '../lib/backend';
import { loadSession } from '../lib/backend/cloudSession';
import type { MatchLeaderboardEntry } from '../lib/backend';
import {
  GAUNTLET_ORDER,
  loadGauntlet,
  saveGauntlet,
  startGauntlet,
  type GauntletState,
} from '../lib/gauntlet';
import {
  activeEvents,
  upcomingEvents,
  loadEventScores,
  type Event,
} from '../lib/events';
import { autoMineFromBots, type MineProgress } from '../lib/autoMine';
import {
  computeInsights,
  favoriteTimeControl,
  DAY_LABELS_TH,
} from '../lib/insights';

type Props = {
  stats: UserStats;
  onStatsChange: (s: UserStats) => void;
  onResetAll: () => void;
};

export function ProfilePage({ stats, onStatsChange, onResetAll }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(stats.displayName);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggested = recommendedLevel(stats.rating);
  const winRate = computeWinRate(stats.history);

  const handleSaveName = () => {
    const trimmed = nameDraft.trim().slice(0, 24);
    if (!trimmed) return;
    const next: UserStats = { ...stats, displayName: trimmed };
    saveStats(next);
    onStatsChange(next);
    setEditingName(false);
  };

  const handleExport = () => {
    const blob = new Blob([exportStatsJSON(stats)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openmakruk-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const parsed = importStatsJSON(text);
      if (!parsed) {
        toast.error('ไฟล์ไม่ถูกต้อง');
        return;
      }
      toast.confirm(
        `แทนที่ profile ด้วย "${parsed.displayName}" (rating ${parsed.rating}, ${parsed.totalGames} เกม) ?`,
        {
          confirmLabel: 'แทนที่',
          destructive: true,
          onConfirm: () => {
            saveStats(parsed);
            onStatsChange(parsed);
            toast.success('นำเข้า profile แล้ว');
          },
        },
      );
    });
    e.target.value = '';
  };

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div className="profile-identity">
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveName();
              }}
              className="profile-name-edit"
            >
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={24}
                autoFocus
                placeholder="ชื่อผู้เล่น"
              />
              <button type="submit" className="profile-name-save">บันทึก</button>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(stats.displayName);
                  setEditingName(false);
                }}
              >
                ยกเลิก
              </button>
            </form>
          ) : (
            <>
              <h2 className="profile-name">{stats.displayName}</h2>
              <button
                className="profile-name-edit-button"
                onClick={() => {
                  setNameDraft(stats.displayName);
                  setEditingName(true);
                }}
                title="แก้ชื่อ"
              >
                ✎
              </button>
            </>
          )}
        </div>
        <div className="profile-rating-block">
          <div className="profile-rating-value">{stats.rating}</div>
          <div className="profile-rating-label">Rating</div>
        </div>
      </header>

      <div className="profile-summary">
        <div className="profile-summary-card">
          <div className="profile-summary-num">{stats.totalGames}</div>
          <div className="profile-summary-label">เกมที่บันทึก</div>
        </div>
        <div className="profile-summary-card">
          <div className="profile-summary-num">
            {winRate.total === 0 ? '—' : `${Math.round((winRate.wins / winRate.total) * 100)}%`}
          </div>
          <div className="profile-summary-label">Win rate</div>
        </div>
        <div className="profile-summary-card">
          <div className="profile-summary-num">{DIFFICULTY_LABELS[suggested]}</div>
          <div className="profile-summary-label">แนะนำเล่นที่</div>
        </div>
      </div>

      <AchievementsAndStreakSection />

      <MatchLeaderboardSection stats={stats} />

      <GlobalMatchLeaderboardSection />

      <GauntletSection />

      <EventsSection />

      <AutoMineSection />

      <InsightsSection stats={stats} />

      <section className="profile-section">
        <h3>สถิติแต่ละระดับ</h3>
        <div className="profile-bylevel">
          {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => {
            const r = stats.byLevel[d];
            const total = r.wins + r.losses + r.draws;
            const pct = total > 0 ? (r.wins / total) * 100 : 0;
            return (
              <div key={d} className="profile-bylevel-row">
                <div className="profile-bylevel-name">
                  <strong>{DIFFICULTY_LABELS[d]}</strong>
                  <span className="label-aside"> · CPU ~{CPU_RATINGS[d]}</span>
                </div>
                <div className="profile-bylevel-stats">
                  {total === 0 ? (
                    <span className="label-aside">ยังไม่เคยเล่น</span>
                  ) : (
                    <>
                      <span className="win">{r.wins}W</span>
                      <span className="loss">{r.losses}L</span>
                      <span className="draw">{r.draws}D</span>
                      <span className="label-aside"> · {pct.toFixed(0)}%</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="profile-section">
        <h3>ประวัติเกม ({stats.history.length})</h3>
        {stats.history.length === 0 ? (
          <p className="label-aside">ยังไม่มีเกมที่บันทึก — เล่นโหมด Rated ก่อน</p>
        ) : (
          <>
            <div className="profile-history-actions">
              <button
                onClick={() => {
                  const pgn = gamesToPgn(stats.history, { whiteName: stats.displayName });
                  downloadPgn(pgn, `openmakruk-${stats.displayName}-history.pgn`);
                }}
              >
                📥 Download ทั้งหมด (.pgn)
              </button>
              <span className="label-aside">
                Tip: เปิดด้วย lichess.org analysis board หรือ ChessTempo
              </span>
            </div>
            <div className="profile-history">
              {stats.history.map((g, i) => (
                <ProfileHistoryRow
                  key={g.id ?? i}
                  record={g}
                  userName={stats.displayName}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="profile-section">
        <h3>จัดการข้อมูล</h3>
        <div className="profile-data-actions">
          <button onClick={handleExport}>📤 Export profile (.json)</button>
          <button onClick={() => fileInputRef.current?.click()}>📥 Import profile</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button
            className="profile-reset-button"
            onClick={() => {
              toast.confirm('ลบ profile ทั้งหมด? (rating, history, settings) — กู้ไม่ได้', {
                confirmLabel: 'ลบทั้งหมด',
                destructive: true,
                onConfirm: onResetAll,
              });
            }}
          >
            🗑 ลบ profile ทั้งหมด
          </button>
        </div>
        <p className="label-aside">
          ข้อมูลเก็บใน localStorage ของ browser เท่านั้น — ไม่มี server
        </p>
      </section>
    </div>
  );
}

function ProfileHistoryRow({
  record,
  userName,
}: {
  record: GameRecord;
  userName: string;
}) {
  const date = new Date(record.date);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  const handleExport = () => {
    const pgn = gameToPgn(record, { whiteName: userName });
    const tsName = date
      .toISOString()
      .slice(0, 16)
      .replace(/[:T]/g, '-');
    downloadPgn(pgn, `openmakruk-${tsName}.pgn`);
  };
  return (
    <div className="profile-history-row">
      <span className={`history-outcome ${record.outcome}`}>
        {record.outcome === 'win' ? 'W' : record.outcome === 'loss' ? 'L' : 'D'}
      </span>
      <span className="history-opponent">
        vs {DIFFICULTY_LABELS[record.opponent]}
      </span>
      <span className="history-side">
        ({record.userSide === 'white' ? '♔' : '♚'})
      </span>
      <span className="history-plies">{record.plyCount} ply</span>
      <span className={`history-delta ${record.ratingDelta >= 0 ? 'up' : 'down'}`}>
        {record.ratingDelta >= 0 ? '+' : ''}
        {record.ratingDelta}
      </span>
      <span className="history-rating">→ {record.ratingAfter}</span>
      <span className="history-date">{dateStr}</span>
      <button
        className="history-pgn-button"
        onClick={handleExport}
        title="Export this game to PGN"
      >
        📋 PGN
      </button>
    </div>
  );
}

function computeWinRate(history: GameRecord[]): { wins: number; total: number } {
  const wins = history.filter((g) => g.outcome === 'win').length;
  return { wins, total: history.length };
}

function AutoMineSection() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<MineProgress | null>(null);
  const [lastResult, setLastResult] = useState<{ minedCount: number; games: number } | null>(null);

  const handleMine = async () => {
    if (running) return;
    setRunning(true);
    setProgress(null);
    setLastResult(null);
    try {
      const author = loadStats().displayName;
      const result = await autoMineFromBots(
        'greedy-bot',
        'fairy-stockfish',
        3, // 3 games to keep it reasonable for browser
        author,
        (p) => setProgress(p),
      );
      setLastResult({ minedCount: result.minedCount, games: result.games });
      if (result.minedCount > 0) {
        toast.success(`🤖 mined ${result.minedCount} puzzles จาก ${result.games} เกม`);
      } else {
        toast.info('ไม่พบ blunder ที่น่าสนใจในรอบนี้ · ลองอีกครั้ง');
      }
    } catch (err) {
      toast.error(`mining ผิดพลาด: ${String(err)}`);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <section className="profile-section">
      <h3>🤖 Auto Content Factory</h3>
      <p className="label-aside">
        ให้ bot เล่นแข่งกันเอง · ระบบจะหา "blunder" ของ bot อ่อนแล้วทำเป็น puzzle · puzzle ปรากฏใน tab ปริศนา → ของฉัน
      </p>
      <button
        className="profile-mine-button"
        onClick={handleMine}
        disabled={running}
      >
        {running
          ? `🔄 game ${progress?.game ?? 0}/${progress?.totalGames ?? 0} · ${progress?.status ?? ''} · mined: ${progress?.minedCount ?? 0}`
          : '🤖 generate puzzles (3 เกม · ~2 นาที)'}
      </button>
      {lastResult && (
        <p className="label-aside" style={{ marginTop: '0.5rem' }}>
          ผลล่าสุด: {lastResult.minedCount} puzzles จาก {lastResult.games} bot games
        </p>
      )}
    </section>
  );
}

function EventsSection() {
  const active = activeEvents();
  const upcoming = upcomingEvents();
  const scores = loadEventScores();
  return (
    <section className="profile-section">
      <h3>🎯 Events</h3>
      <p className="label-aside">
        แข่งกับ bot ตามช่วงเวลา · ผลถูกเก็บคะแนน · ตรวจสอบ engine ที่กำหนดใน Settings ก่อนเล่น
      </p>
      {active.length === 0 && upcoming.length === 0 ? (
        <p className="label-aside">ไม่มี event ตอนนี้</p>
      ) : null}
      {active.map((e) => (
        <EventCard key={e.id} event={e} active score={scores[e.id]} />
      ))}
      {upcoming.map((e) => (
        <EventCard key={e.id} event={e} active={false} score={scores[e.id]} />
      ))}
    </section>
  );
}

function EventCard({ event, active, score }: { event: Event; active: boolean; score?: { bestPoints: number; wins: number; losses: number; draws: number; totalGames: number } }) {
  const startsIn = Math.max(0, event.startsAt - Date.now());
  const endsIn = Math.max(0, event.endsAt - Date.now());
  const fmtDuration = (ms: number) => {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    if (days > 0) return `${days} วัน`;
    const hrs = Math.floor(ms / (60 * 60 * 1000));
    if (hrs > 0) return `${hrs} ชั่วโมง`;
    return `${Math.floor(ms / 60000)} นาที`;
  };
  return (
    <div className={`profile-event ${active ? 'active' : 'upcoming'}`}>
      <div className="profile-event-header">
        <strong>{event.name}</strong>
        <span className="profile-event-status">
          {active ? `เหลือ ${fmtDuration(endsIn)}` : `เริ่มใน ${fmtDuration(startsIn)}`}
        </span>
      </div>
      <p className="profile-event-desc">{event.description}</p>
      <div className="profile-event-meta">
        <span className="label-aside">
          engine: <code>{event.engineId}</code> · win {event.pointsPerWin}pt · draw {event.pointsPerDraw}pt
        </span>
      </div>
      {score && (
        <div className="profile-event-score">
          📊 ของคุณ: {score.totalGames} เกม · {score.wins}W {score.draws}D {score.losses}L · {score.bestPoints} pt
        </div>
      )}
    </div>
  );
}

function GauntletSection() {
  const [g, setG] = useState<GauntletState>(() => loadGauntlet());
  const onStart = () => {
    toast.confirm(
      'เริ่ม Gauntlet — ต้องชนะ CPU ทั้ง 4 ระดับติด ๆ. ถ้าแพ้/เสมอ = เริ่มใหม่. ยืนยัน?',
      {
        confirmLabel: 'เริ่ม',
        onConfirm: () => {
          const fresh = startGauntlet();
          saveGauntlet(fresh);
          setG(fresh);
          toast.success(`🏰 Gauntlet เริ่มแล้ว — รอบแรก: ${DIFFICULTY_LABELS[GAUNTLET_ORDER[0]]}`);
        },
      },
    );
  };
  const lastRun = g.history[0];
  return (
    <section className="profile-section">
      <h3>🏰 Gauntlet Challenge</h3>
      <p className="label-aside">
        ชนะ CPU ทั้ง 4 ระดับติดต่อกัน · แพ้/เสมอ = เริ่มใหม่
      </p>
      {g.active ? (
        <div className="profile-gauntlet-active">
          <div className="profile-gauntlet-progress">
            {GAUNTLET_ORDER.map((level, i) => {
              const status =
                i < g.cursor ? 'won' : i === g.cursor ? 'current' : 'pending';
              return (
                <div key={level} className={`profile-gauntlet-rung ${status}`}>
                  <span className="profile-gauntlet-icon">
                    {status === 'won' ? '✓' : status === 'current' ? '▶' : '○'}
                  </span>
                  <span>{DIFFICULTY_LABELS[level]}</span>
                </div>
              );
            })}
          </div>
          <p className="profile-gauntlet-hint">
            เปิด <strong>Play</strong> tab · ระดับถูกล็อก: <strong>{DIFFICULTY_LABELS[GAUNTLET_ORDER[g.cursor]]}</strong>
          </p>
        </div>
      ) : (
        <button className="profile-gauntlet-start" onClick={onStart}>
          🏁 เริ่ม Gauntlet
        </button>
      )}
      {lastRun && (
        <div className="profile-gauntlet-last">
          <span className="label-aside">รอบล่าสุด:</span>{' '}
          {lastRun.outcome === 'completed'
            ? '🏆 ชนะหมด!'
            : `❌ จบที่ ${DIFFICULTY_LABELS[lastRun.reachedLevel]}`}
        </div>
      )}
    </section>
  );
}

function GlobalMatchLeaderboardSection() {
  // Only mount when cloud sync is online — keeps the leaderboard hidden
  // for offline users so they don't see a perpetual "loading" or
  // "enable cloud sync" empty state in the middle of their profile.
  const backend = getBackend();
  const supports = backend.isOnline() && backend.fetchMatchLeaderboard !== undefined;

  const [entries, setEntries] = useState<MatchLeaderboardEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!supports || !backend.fetchMatchLeaderboard) return;
    let cancelled = false;
    backend
      .fetchMatchLeaderboard(50)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [supports, backend]);

  if (!supports) return null;

  const myId = loadSession().userId;

  return (
    <section className="profile-section">
      <h3>🌍 Global Match Leaderboard · server-verified</h3>
      <p className="label-aside">
        เปรียบเทียบกับผู้เล่นทั่วโลก · คะแนนคำนวณฝั่ง server · แก้ localStorage ของตัวเองไม่ขึ้นบอร์ดนี้
      </p>
      {err && <p className="label-aside" style={{ color: '#c75555' }}>เชื่อมต่อล้มเหลว: {err}</p>}
      {!entries && !err && <p className="label-aside">กำลังโหลด…</p>}
      {entries && entries.length === 0 && (
        <p className="label-aside">ยังไม่มีผู้เล่นบนบอร์ด · ลองชนะ master 1 เกมก่อน</p>
      )}
      {entries && entries.length > 0 && (
        <div className="profile-global-lb">
          {entries.map((e) => (
            <div
              key={e.userId}
              className={`profile-global-lb-row ${e.userId === myId ? 'is-me' : ''}`}
            >
              <span className="profile-global-lb-rank">#{e.rank}</span>
              <span className="profile-global-lb-name">{e.displayName}</span>
              <span className="profile-global-lb-meta">
                {e.wins}W · {e.draws}D · {e.losses}L
              </span>
              <span className="profile-global-lb-score">{formatScore(e.score)} pt</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MatchLeaderboardSection({ stats }: { stats: UserStats }) {
  const lb = computeMatchLeaderboard(stats);
  return (
    <section className="profile-section">
      <h3>🏆 Match Score</h3>
      <div className="profile-leaderboard-total">
        <span className="profile-lb-total-label">รวมคะแนน</span>
        <span className="profile-lb-total-value">{formatScore(lb.total)}</span>
        <span className="profile-lb-total-aside">
          จาก {lb.totalGames} เกม · ชนะ {lb.totalWins} ครั้ง
        </span>
      </div>
      <div className="profile-leaderboard-rows">
        {lb.byLevel.map((entry) => (
          <div key={entry.level} className="profile-lb-row">
            <span className="profile-lb-level">
              <strong>{DIFFICULTY_LABELS[entry.level]}</strong>
              <span className="label-aside"> · {entry.weight}pt/ชนะ</span>
            </span>
            <span className="profile-lb-points">
              {formatScore(entry.points)} pt
              <span className="label-aside">
                {' '}({entry.record.wins}W · {entry.record.draws}D · {entry.record.losses}L)
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="label-aside profile-lb-note">
        คะแนน = ชนะ × น้ำหนัก + (เสมอ × น้ำหนัก / 2) · แพ้ = 0
      </p>
    </section>
  );
}

function InsightsSection({ stats }: { stats: UserStats }) {
  const insights = useMemo(() => computeInsights(stats.history), [stats.history]);

  if (insights.totalGames === 0) {
    return (
      <section className="profile-section">
        <h3>📊 Insights</h3>
        <p className="label-aside">เล่นเกมแรกก่อน แล้วระบบจะวิเคราะห์ pattern การเล่นของคุณ</p>
      </section>
    );
  }

  const favTC = favoriteTimeControl(insights);
  const tcLabel = favTC ? labelForTC(favTC) : '—';
  const maxDayCount = Math.max(...insights.perDayOfWeek, 1);

  return (
    <section className="profile-section">
      <h3>📊 Insights · จาก {insights.totalGames} เกมล่าสุด</h3>

      {/* By color ---------------------------------------------------- */}
      <div className="insights-row">
        <div className="insights-block">
          <div className="insights-label">เล่นฝั่งขาว</div>
          <SideBar stats={insights.asWhite} />
        </div>
        <div className="insights-block">
          <div className="insights-label">เล่นฝั่งดำ</div>
          <SideBar stats={insights.asBlack} />
        </div>
      </div>

      {/* By level ---------------------------------------------------- */}
      <div className="insights-block">
        <div className="insights-label">แยกตามระดับคู่ต่อสู้</div>
        <div className="insights-bylevel">
          {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
            <div key={d} className="insights-bylevel-row">
              <span className="insights-bylevel-name">{DIFFICULTY_LABELS[d]}</span>
              <SideBar stats={insights.byLevel[d]} compact />
            </div>
          ))}
        </div>
      </div>

      {/* Length distribution ---------------------------------------- */}
      <div className="insights-row">
        <Stat label="ความยาวเฉลี่ย" value={`${insights.avgPlies.toFixed(1)} ply`} />
        <Stat label="เกมสั้น (<30 ply)" value={`${insights.shortGames}`} />
        <Stat label="เกมกลาง" value={`${insights.mediumGames}`} />
        <Stat label="เกมยาว (>80 ply)" value={`${insights.longGames}`} />
      </div>

      {/* Form + streaks --------------------------------------------- */}
      <div className="insights-row">
        <div className="insights-block">
          <div className="insights-label">ฟอร์มล่าสุด (10 เกมล่าสุด)</div>
          <SideBar stats={insights.recentForm} />
        </div>
        <Stat label="ชนะติดต่อกันสูงสุด" value={`${insights.longestWinStreak}`} />
        <Stat label="แพ้ติดต่อกันสูงสุด" value={`${insights.longestLossStreak}`} />
      </div>

      {/* Best win + rating trajectory ------------------------------ */}
      <div className="insights-row">
        <Stat
          label="ชนะระดับสูงสุด"
          value={insights.bestWinAgainst ? DIFFICULTY_LABELS[insights.bestWinAgainst] : '—'}
        />
        <Stat
          label="rating delta เฉลี่ย"
          value={`${insights.avgRatingDelta >= 0 ? '+' : ''}${insights.avgRatingDelta.toFixed(1)}`}
        />
        <Stat label="time control ที่ชอบ" value={tcLabel} />
      </div>

      {/* Day-of-week activity --------------------------------------- */}
      <div className="insights-block">
        <div className="insights-label">เล่นวันไหนมากที่สุด</div>
        <div className="insights-dow">
          {insights.perDayOfWeek.map((count, i) => (
            <div key={i} className="insights-dow-col">
              <div
                className="insights-dow-bar"
                style={{ height: `${Math.round((count / maxDayCount) * 60)}px` }}
                title={`${count} เกม`}
              />
              <div className="insights-dow-label">{DAY_LABELS_TH[i]}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="insights-stat">
      <div className="insights-stat-value">{value}</div>
      <div className="insights-stat-label">{label}</div>
    </div>
  );
}

function SideBar({
  stats,
  compact = false,
}: {
  stats: { wins: number; losses: number; draws: number; total: number; winRate: number };
  compact?: boolean;
}) {
  if (stats.total === 0) {
    return <div className="insights-sidebar-empty">— ไม่มีเกม —</div>;
  }
  const winPct = (stats.wins / stats.total) * 100;
  const drawPct = (stats.draws / stats.total) * 100;
  const lossPct = (stats.losses / stats.total) * 100;
  return (
    <div className={`insights-sidebar ${compact ? 'compact' : ''}`}>
      <div className="insights-sidebar-bar">
        <div className="insights-sidebar-win" style={{ width: `${winPct}%` }} />
        <div className="insights-sidebar-draw" style={{ width: `${drawPct}%` }} />
        <div className="insights-sidebar-loss" style={{ width: `${lossPct}%` }} />
      </div>
      <div className="insights-sidebar-counts">
        <span>{stats.wins}W</span>
        <span>{stats.draws}D</span>
        <span>{stats.losses}L</span>
        <span className="insights-sidebar-rate">
          ({(stats.winRate * 100).toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}

function labelForTC(id: string): string {
  // Avoid importing TIME_CONTROLS at module top to keep this lazy —
  // most renders never hit favoriteTimeControl. require-style import
  // not available in ESM so inline a small map mirroring clock.ts.
  // (Out of sync if clock.ts changes; that's caught by smoke tests
  // since the label "unknown" is visually obvious.)
  const map: Record<string, string> = {
    'unlimited': 'ไม่จำกัด',
    'blitz-5': 'Blitz 5',
    'blitz-5-3': "Blitz 5+3",
    'rapid-10': 'Rapid 10',
    'rapid-15-10': "Rapid 15+10",
    'classical-30': 'Classical 30',
  };
  return map[id] ?? id;
}

function AchievementsAndStreakSection() {
  const streak = loadStreak();
  const unlocks = loadUnlocks();
  return (
    <section className="profile-section">
      <h3>🔥 Streak + 🏆 ความสำเร็จ</h3>
      <div className="profile-streak-row">
        <div className="profile-streak-current">
          <span className="profile-streak-emoji">🔥</span>
          <strong>{streak.current}</strong> วันติดต่อกัน
        </div>
        <div className="profile-streak-longest">
          longest: <strong>{streak.longest}</strong> วัน
        </div>
      </div>
      <div className="profile-achievements">
        {ACHIEVEMENTS.map((a) => {
          const got = a.id in unlocks.unlocked;
          return (
            <div
              key={a.id}
              className={`profile-achievement ${got ? 'unlocked' : 'locked'}`}
              title={a.description}
            >
              <span className="profile-achievement-icon">
                {got ? a.icon : '🔒'}
              </span>
              <div>
                <div className="profile-achievement-name">{a.name}</div>
                <div className="profile-achievement-desc">{a.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
