// Profile tab — full version of what the sidebar mini-profile shows.
// Username editable, rating panel, recent games list, achievements
// scaffolding, export/import buttons. No graph yet (Phase 1.x adds D3).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Page } from '../components/Page';
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
import { personalityEngineId } from '../lib/personalities/scoredBot';
import { downloadPgn, gameToPgn, gamesToPgn } from '../lib/pgn';
import { toast } from '../components/Toast';
import { loadStreak } from '../lib/streak';
import { ACHIEVEMENTS, loadUnlocks } from '../lib/achievements';
import { navigate } from '../lib/router';
import { titleForRating, ratingToNextTitle, TITLE_TIERS } from '../lib/titles';
import { loadDrillProgress, DRILL_LEVELS } from '../lib/countingDrill';
import { loadTrainerProgress } from '../lib/moveTrainer';
import { loadRushProgress } from '../lib/bossRush';
import { loadPuzzleProgress } from '../lib/puzzleProgress';
import { getActiveSeason, getPriorSeason, seasonLabel } from '../lib/seasons';
import { aggregateMastery } from '../lib/reviewMastery';
import { MOTIF_LABELS } from '../lib/conceptMastery';
import type { MotifKind } from '../lib/coach/types';
import { computeMatchLeaderboard, formatScore } from '../lib/leaderboard';
import { getBackend } from '../lib/backend';
import { loadSession } from '../lib/backend/cloudSession';
import type {
  MatchLeaderboardEntry,
  BotCharacter,
  BadgeDef,
  UserBadge,
  JourneyView,
  TournamentInfo,
  ActivitySignals,
} from '../lib/backend';
import { findProvince, REGION_LABELS_TH } from '../lib/provinces';
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

// Sub-tab grouping — 18 stacked sections is too long for a single
// scroll. These five tabs cluster sections by user-intent:
//   Overview  — fast glance: rating, today, journey, streak/badges
//   Stats     — performance numbers: match score, review mastery,
//               insights, by-level breakdown, recent history
//   Compete   — competitive surfaces: tournaments, leaderboards,
//               bot hall, gauntlet, seasons, events
//   Progress  — long-term: badges (full list), auto-mine factory
//   Manage    — data: import/export/reset
// Each section keeps its own component; tabs only toggle visibility.
type ProfileSubTab = 'overview' | 'stats' | 'compete' | 'progress' | 'manage';

const SUBTAB_LABELS: Record<ProfileSubTab, string> = {
  overview: '🪪 ภาพรวม',
  stats: '📊 สถิติ',
  compete: '🏆 แข่งขัน',
  progress: '🎖️ ความก้าวหน้า',
  manage: '⚙️ จัดการ',
};

export function ProfilePage({ stats, onStatsChange, onResetAll }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(stats.displayName);
  const [subTab, setSubTab] = useState<ProfileSubTab>('overview');
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
    <Page variant="medium" className="profile-page">
      <button
        className="profile-back-button"
        onClick={() => navigate({ tab: 'play' })}
        title="กลับไปหน้าเล่น"
      >
        ← กลับไปเล่น
      </button>
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
          {(() => {
            const tier = titleForRating(stats.rating);
            const next = ratingToNextTitle(stats.rating);
            return (
              <>
                <div className="profile-rating-value" title="Rating · คะแนน Elo ของคุณ · เพิ่มจากการชนะ bot ที่ rating สูงกว่า">
                  {stats.rating}
                </div>
                <div
                  className="profile-rating-title"
                  style={{ color: tier.color, borderColor: tier.color }}
                  title={`${tier.th} · ${tier.descTh}`}
                >
                  {tier.th}
                </div>
                <div className="profile-rating-label">
                  {next
                    ? `อีก ${next.remaining} → ${next.next.th}`
                    : 'ระดับสูงสุดของตำแหน่ง'}
                </div>
              </>
            );
          })()}
        </div>
      </header>

      <TitleLadderExplainer rating={stats.rating} />

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

      <nav className="profile-subtabs" role="tablist" aria-label="หน้าย่อยของโปรไฟล์">
        {(Object.keys(SUBTAB_LABELS) as ProfileSubTab[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={subTab === k}
            className={`profile-subtab${subTab === k ? ' is-active' : ''}`}
            onClick={() => setSubTab(k)}
          >
            {SUBTAB_LABELS[k]}
          </button>
        ))}
      </nav>

      {subTab === 'overview' && (
        <>
          <SignalsSection />
          <JourneySection />
          <AchievementsAndStreakSection />
        </>
      )}

      {subTab === 'stats' && (
        <>
          <MatchLeaderboardSection stats={stats} />
          <ReviewMasterySection />
          <MasteryOverview />
          <InsightsSection stats={stats} />
        </>
      )}

      {subTab === 'compete' && (
        <>
          <TournamentsSection />
          <GlobalMatchLeaderboardSection />
          <BotHallOfFameSection />
          <GauntletSection />
          <EventsSection />
          <SeasonSection />
          <SeasonHallOfFameSection />
        </>
      )}

      {subTab === 'progress' && (
        <>
          <BadgesSection />
          <AutoMineSection />
        </>
      )}

      {subTab === 'stats' && (
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
      )}

      {subTab === 'stats' && <HistorySection stats={stats} />}

      {subTab === 'manage' && (
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
            ข้อมูลเก็บใน localStorage ของ browser เท่านั้น · cloud sync เป็น
            opt-in ใน <a href="#/settings">⚙️ ตั้งค่า</a>
          </p>
        </section>
      )}
    </Page>
  );
}

// ─── Title-ladder explainer ──────────────────────────────────────────
// Shows the full 8-tier ladder with the user's current position
// highlighted. Addresses real user confusion ("ขุนทอง คืออะไร?"). Lives
// at the top of every sub-tab so users learn the ladder once and the
// answer is always one scroll away.
function TitleLadderExplainer({ rating }: { rating: number }) {
  const [expanded, setExpanded] = useState(false);
  const currentTier = titleForRating(rating);
  return (
    <details
      className="profile-title-ladder"
      open={expanded}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        💡 ระบบยศ · {currentTier.th} ({rating}) — กดดูทั้งหมด
      </summary>
      <div className="profile-title-ladder-body">
        <p className="label-aside">
          ยศ (title) คำนวณจาก <strong>rating</strong> โดยอัตโนมัติ — ไม่ใช่ชื่อผู้เล่น
          (ที่ผู้ใช้ตั้งเอง). ขยับยศได้ด้วยการชนะ bot ที่ rating สูงกว่า.
        </p>
        <table className="profile-title-table">
          <thead>
            <tr><th>Rating</th><th>ยศ</th><th>ความหมาย</th></tr>
          </thead>
          <tbody>
            {TITLE_TIERS.map((t) => (
              <tr
                key={t.minRating}
                className={t.minRating === currentTier.minRating ? 'is-current' : ''}
              >
                <td className="profile-title-rating">
                  {t.minRating === 0 ? '< 1000' : `${t.minRating}+`}
                </td>
                <td style={{ color: t.color }}>
                  <strong>{t.th}</strong>
                </td>
                <td className="label-aside">{t.descTh}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
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
        // 'greedy-bot' baseline was removed (see lib/engine.ts).
        // Hunter personality has the same "grab anything that hangs"
        // tendency and produces similar blunder-rich games for mining.
        personalityEngineId('hunter'),
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

function HistorySection({ stats }: { stats: UserStats }) {
  const [visible, setVisible] = useState(50);
  if (stats.history.length === 0) {
    return (
      <section className="profile-section">
        <h3>ประวัติเกม (0)</h3>
        <p className="label-aside">ยังไม่มีเกมที่บันทึก — เล่นโหมด Rated ก่อน</p>
      </section>
    );
  }
  const shown = stats.history.slice(0, visible);
  const more = stats.history.length - shown.length;
  return (
    <section className="profile-section">
      <h3>ประวัติเกม ({stats.history.length})</h3>
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
        {shown.map((g, i) => (
          <ProfileHistoryRow
            key={g.id ?? i}
            record={g}
            userName={stats.displayName}
          />
        ))}
      </div>
      {more > 0 && (
        <div className="profile-history-more">
          <button onClick={() => setVisible((n) => n + 50)}>
            แสดงเพิ่มอีก 50 ({more} เกมเก่ากว่ารออยู่)
          </button>
        </div>
      )}
    </section>
  );
}

function SignalsSection() {
  const backend = getBackend();
  // Public read — no token required. Anonymous visitors see today's
  // activity counts too; engagement signal is a top-of-funnel asset.
  const supports = backend.fetchSignals !== undefined;
  const [data, setData] = useState<ActivitySignals | null>(null);

  useEffect(() => {
    if (!supports || !backend.fetchSignals) return;
    let cancelled = false;
    backend.fetchSignals()
      .then((s) => !cancelled && setData(s))
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [supports, backend]);

  if (!supports || !data) return null;

  const ago = (at: number) => {
    const mins = Math.floor((Date.now() - at) / 60_000);
    if (mins < 1) return 'เมื่อกี้นี้';
    if (mins < 60) return `${mins} นาทีก่อน`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ชั่วโมงก่อน`;
    return new Date(at).toLocaleDateString('th-TH');
  };

  return (
    <section className="profile-section">
      <h3>📊 Activity · วันนี้</h3>
      <div className="profile-signals">
        <div className="profile-signal">
          <span className="profile-signal-value">{data.gamesToday}</span>
          <span className="profile-signal-label">เกมเล่นวันนี้</span>
        </div>
        <div className="profile-signal">
          <span className="profile-signal-value">{data.puzzlesToday}</span>
          <span className="profile-signal-label">ปริศนาแก้วันนี้</span>
        </div>
        {data.lastGame && (
          <div className="profile-signal-row">
            <span className="label-aside">เกมล่าสุด:</span>{' '}
            {data.lastGame.displayName} · {ago(data.lastGame.at)}
          </div>
        )}
        {data.lastPuzzle && (
          <div className="profile-signal-row">
            <span className="label-aside">แก้ปริศนาล่าสุด:</span>{' '}
            {data.lastPuzzle.displayName} · {ago(data.lastPuzzle.at)}
          </div>
        )}
      </div>
    </section>
  );
}

function TournamentsSection() {
  const backend = getBackend();
  // Public read — tournament catalog is the same for everyone.
  const supports = backend.fetchTournaments !== undefined;
  const [list, setList] = useState<TournamentInfo[] | null>(null);

  useEffect(() => {
    if (!supports || !backend.fetchTournaments) return;
    let cancelled = false;
    backend.fetchTournaments()
      .then((t) => !cancelled && setList(t))
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [supports, backend]);

  if (!supports || !list || list.length === 0) return null;

  return (
    <section className="profile-section">
      <h3>🏆 Tournaments</h3>
      <p className="label-aside">
        เกมที่เล่นในช่วง active ได้คะแนน × multiplier บน match leaderboard
      </p>
      <div className="profile-tournaments">
        {list.map((t) => (
          <div key={t.id} className={`profile-tournament ${t.active ? 'is-active' : ''}`}>
            <span className="profile-tournament-icon">{t.icon}</span>
            <div className="profile-tournament-body">
              <div className="profile-tournament-name">
                {t.nameTh} · ×{t.multiplier}
                {t.active && <span className="profile-tournament-live"> · LIVE</span>}
              </div>
              <div className="label-aside">{t.descTh}</div>
              {t.active && t.activeUntil && (
                <div className="label-aside">
                  จบเมื่อ: {new Date(t.activeUntil).toLocaleString('th-TH')}
                </div>
              )}
              {!t.active && t.upcomingStartsAt && (
                <div className="label-aside">
                  เริ่ม: {new Date(t.upcomingStartsAt).toLocaleString('th-TH')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function JourneySection() {
  const backend = getBackend();
  const session = loadSession();
  const supports =
    backend.isOnline() && session.token.length > 0 && backend.fetchJourney !== undefined;
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!supports || !backend.fetchJourney) return;
    let cancelled = false;
    backend.fetchJourney(session.token)
      .then((j) => !cancelled && setJourney(j))
      .catch((e: unknown) => !cancelled && setErr(String(e)));
    return () => { cancelled = true; };
  }, [supports, backend, session.token]);

  if (!supports) return null;

  return (
    <section className="profile-section">
      <h3>🛤️ Journey · ทางสู่ระดับถัดไป</h3>
      <p className="label-aside">
        ระดับเลื่อนตาม rating + checkpoints จริง · ผ่านครบ = ใกล้ขั้นต่อไปแน่นอน
      </p>
      {err && <p className="label-aside" style={{ color: '#c75555' }}>{err}</p>}
      {!journey && !err && <p className="label-aside">กำลังโหลด…</p>}
      {journey && (
        <div className="profile-journey">
          <div className="profile-journey-header">
            <span className="profile-journey-current-icon">{journey.currentIcon}</span>
            <div>
              <div className="profile-journey-current-name">
                {journey.currentNameTh}
              </div>
              <div className="label-aside">rating ปัจจุบัน {journey.rating}</div>
            </div>
            {journey.nextLevel && (
              <>
                <span className="profile-journey-arrow">→</span>
                <span className="profile-journey-next-icon">{journey.nextIcon}</span>
                <div>
                  <div className="profile-journey-next-name">{journey.nextNameTh}</div>
                  <div className="label-aside">ratingแตะ {journey.nextRatingFloor}</div>
                </div>
              </>
            )}
          </div>

          {journey.checkpoints.length === 0 ? (
            <p className="label-aside">
              🎉 คุณอยู่ระดับสูงสุดแล้ว · ปกป้องตำแหน่งให้นานที่สุด
            </p>
          ) : (
            <div className="profile-journey-checks">
              {journey.checkpoints.map((cp) => {
                const pct = cp.neededCount > 0
                  ? Math.min(100, (cp.doneCount / cp.neededCount) * 100)
                  : 0;
                return (
                  <div
                    key={cp.id}
                    className={`profile-journey-check ${cp.complete ? 'done' : ''}`}
                  >
                    <div className="profile-journey-check-head">
                      <span className="profile-journey-check-icon">
                        {cp.complete ? '✅' : '⬜'}
                      </span>
                      <span className="profile-journey-check-label">{cp.labelTh}</span>
                      <span className="profile-journey-check-count">
                        {cp.doneCount} / {cp.neededCount}
                      </span>
                    </div>
                    <div className="profile-journey-check-bar">
                      <div
                        className="profile-journey-check-fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="profile-journey-ladder">
            {journey.levelLadder.map((l) => (
              <div
                key={l.id}
                className={`profile-journey-step ${l.id === journey.currentLevel ? 'is-here' : ''}`}
                title={`${l.nameTh} · rating ${l.ratingFloor}+`}
              >
                <span>{l.icon}</span>
                <span className="label-aside">{l.ratingFloor}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BadgesSection() {
  const backend = getBackend();
  const session = loadSession();
  const supports =
    backend.isOnline() &&
    session.token.length > 0 &&
    backend.fetchBadgeCatalog !== undefined &&
    backend.fetchMyBadges !== undefined;

  const [catalog, setCatalog] = useState<BadgeDef[] | null>(null);
  const [mine, setMine] = useState<UserBadge[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!supports || !backend.fetchBadgeCatalog || !backend.fetchMyBadges) return;
    let cancelled = false;
    Promise.all([
      backend.fetchBadgeCatalog(),
      backend.fetchMyBadges(session.token),
    ])
      .then(([cat, badges]) => {
        if (cancelled) return;
        setCatalog(cat);
        setMine(badges);
      })
      .catch((e: unknown) => !cancelled && setErr(String(e)));
    return () => { cancelled = true; };
  }, [supports, backend, session.token]);

  if (!supports) return null;

  const unlockedSet = new Set((mine ?? []).map((b) => b.badgeId));
  const unlockedById = new Map((mine ?? []).map((b) => [b.badgeId, b]));

  const byCategory: Record<string, BadgeDef[]> = {};
  for (const b of catalog ?? []) {
    if (!byCategory[b.category]) byCategory[b.category] = [];
    byCategory[b.category].push(b);
  }
  // Sort tiers within a category from low (bronze) to high (diamond).
  const tierOrder = { bronze: 0, silver: 1, gold: 2, diamond: 3 };
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);
  }
  const categoryLabels: Record<string, string> = {
    rating: '⭐ Rating ladder',
    puzzles: '🧩 Puzzle solver',
    streak: '🔥 Daily streak',
    'bot-conqueror': '⚔️ Bot conqueror',
    region: '📍 ภูมิภาค',
  };

  return (
    <section className="profile-section">
      <h3>
        🏅 Badges{' '}
        <span className="label-aside">
          · {mine?.length ?? 0} / {catalog?.length ?? 0} ปลดล็อก
        </span>
      </h3>
      <p className="label-aside">
        Tier ladder — bronze → silver → gold → diamond · ปลดล็อกอัตโนมัติเมื่อผ่านเงื่อนไข · share ผ่าน
        cert link ที่ <code>/#/cert/&lt;slug&gt;</code>
      </p>
      {err && <p className="label-aside" style={{ color: '#c75555' }}>{err}</p>}
      {!catalog && !err && <p className="label-aside">กำลังโหลด…</p>}
      {catalog && (
        <div className="profile-badges">
          {Object.entries(byCategory).map(([cat, list]) => (
            <div key={cat} className="profile-badges-cat">
              <h4>{categoryLabels[cat] ?? cat}</h4>
              <div className="profile-badges-row">
                {list.map((b) => {
                  const got = unlockedSet.has(b.id);
                  const userBadge = unlockedById.get(b.id);
                  return (
                    <div
                      key={b.id}
                      className={`profile-badge ${got ? 'unlocked' : 'locked'} tier-${b.tier}`}
                      title={`${b.nameTh} · ${b.descTh}${got && userBadge?.unlockedAt ? ` · ปลดล็อก ${new Date(userBadge.unlockedAt).toLocaleDateString('th-TH')}` : ''}`}
                    >
                      <span className="profile-badge-icon">{got ? b.icon : '🔒'}</span>
                      <div>
                        <div className="profile-badge-name">{b.nameTh}</div>
                        <div className="profile-badge-desc">{b.descTh}</div>
                        {got && userBadge && (
                          <a
                            className="profile-badge-cert-link"
                            href={`/#/cert/${userBadge.shareableSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            🔗 share cert
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BotHallOfFameSection() {
  const backend = getBackend();
  // Public read — Bot Hall of Fame is part of the brand surface, not
  // gated behind cloud sync. Strategy goal: show the 22-character
  // cast to first-time visitors so they understand what they can
  // play against before being asked to sign anything.
  const supports = backend.fetchBots !== undefined;
  const [bots, setBots] = useState<BotCharacter[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<'all' | 'rookie' | 'veteran' | 'master'>('all');

  useEffect(() => {
    if (!supports || !backend.fetchBots) return;
    let cancelled = false;
    backend.fetchBots()
      .then((b) => {
        if (!cancelled) setBots(b);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(String(e));
      });
    return () => { cancelled = true; };
  }, [supports, backend]);

  if (!supports) return null;

  const filtered = bots
    ? tierFilter === 'all'
      ? bots
      : bots.filter((b) => b.tier === tierFilter)
    : null;

  return (
    <section className="profile-section">
      <h3>🤖 Bot Hall of Fame · 22 characters · live rating</h3>
      <p className="label-aside">
        Bots ที่คุณแข่งด้วย · rating ขยับจริงตามทุกเกม · ทุกคนเริ่มฝึกที่ Rookie แล้วเอาชนะ Master ก่อนจะปะทะ 👑 boss
      </p>
      <div className="profile-bots-links">
        <button
          className="profile-bots-live-link"
          onClick={() => navigate({ tab: 'exhibition' })}
        >
          🎬 ดู bot vs bot · live (cron ทุก 30 นาที) →
        </button>
        <button
          className="profile-bots-live-link"
          onClick={() => navigate({ tab: 'bossrush' })}
        >
          🏆 Boss Rush · ผ่าน 7 บอตต่อรอบ →
        </button>
      </div>

      <div className="profile-bots-tabs" role="tablist">
        {(['all', 'rookie', 'veteran', 'master'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tierFilter === t}
            className={tierFilter === t ? 'is-active' : ''}
            onClick={() => setTierFilter(t)}
          >
            {t === 'all' ? '🌐 ทุกระดับ' : t === 'rookie' ? '🥉 Rookie' : t === 'veteran' ? '🥈 Veteran' : '🥇 Master'}
          </button>
        ))}
      </div>

      {err && <p className="label-aside" style={{ color: '#c75555' }}>{err}</p>}
      {!bots && !err && <p className="label-aside">กำลังโหลด…</p>}
      {filtered && (
        <div className="profile-bots-grid">
          {filtered.map((b) => (
            <button
              key={b.id}
              className="profile-bot-card"
              onClick={() => navigate({ tab: 'bots', id: b.id })}
              title={`เปิดหน้า ${b.displayName}`}
            >
              <div className="profile-bot-card-head">
                <span className="profile-bot-avatar">{b.avatar}</span>
                <div className="profile-bot-id">
                  <strong>{b.displayName}</strong>
                  <span className="label-aside">{b.rating}</span>
                </div>
                <span className="profile-bot-tier" data-tier={b.tier}>
                  {b.tier === 'rookie' ? '🥉' : b.tier === 'veteran' ? '🥈' : '🥇'}
                </span>
              </div>
              <div className="profile-bot-card-meta label-aside">
                {b.gamesPlayed} เกม · bot ชนะ {b.losses} · เปิดดูรายละเอียด →
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

type LbScope = 'global' | 'region' | 'province';

function GlobalMatchLeaderboardSection() {
  const backend = getBackend();
  // Public read — leaderboards are public. The only thing cloud sync
  // gates is the "📍 จังหวัดของฉัน" tab (needs the user's stored
  // province); the LB itself shows up regardless.
  const supports = backend.fetchMatchLeaderboard !== undefined;
  const session = loadSession();
  const myProvinceObj = session.province ? findProvince(session.province) : null;
  const myRegion = myProvinceObj?.region ?? null;

  // Scope selector. Defaults to global when the user hasn't set a
  // province; pre-selects region/province when they have, since
  // that's the more interesting "fight your neighbors" framing.
  const [scope, setScope] = useState<LbScope>(myRegion ? 'region' : 'global');
  const [entries, setEntries] = useState<MatchLeaderboardEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!supports || !backend.fetchMatchLeaderboard) return;
    let cancelled = false;
    setEntries(null);
    setErr(null);
    const opts: { limit: number; province?: string; region?: string } = { limit: 100 };
    if (scope === 'province' && session.province) opts.province = session.province;
    if (scope === 'region' && myRegion) opts.region = myRegion;
    backend
      .fetchMatchLeaderboard(opts)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [supports, backend, scope, session.province, myRegion]);

  if (!supports) return null;

  const myId = session.userId;
  const scopeHeader =
    scope === 'province'
      ? `📍 จังหวัด ${myProvinceObj?.nameTh ?? '—'}`
      : scope === 'region'
        ? `🗺️ ภูมิภาค ${myRegion ? REGION_LABELS_TH[myRegion] : '—'}`
        : '🌍 ทั่วประเทศ';

  return (
    <section className="profile-section">
      <h3>🏆 Match Leaderboard · server-verified · {scopeHeader}</h3>
      <p className="label-aside">
        คะแนนคำนวณฝั่ง server · แก้ localStorage ของตัวเองไม่ขึ้นบอร์ดนี้ · เกมต้องผ่าน engine verification
      </p>

      <div className="profile-lb-scope-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={scope === 'global'}
          className={scope === 'global' ? 'is-active' : ''}
          onClick={() => setScope('global')}
        >
          🌍 ทั่วประเทศ
        </button>
        <button
          role="tab"
          aria-selected={scope === 'region'}
          className={scope === 'region' ? 'is-active' : ''}
          onClick={() => setScope('region')}
          disabled={!myRegion}
          title={myRegion ? undefined : 'เลือกจังหวัดของคุณก่อน · Settings → ☁️ Cloud Sync'}
        >
          🗺️ ภูมิภาคของฉัน
        </button>
        <button
          role="tab"
          aria-selected={scope === 'province'}
          className={scope === 'province' ? 'is-active' : ''}
          onClick={() => setScope('province')}
          disabled={!session.province}
          title={session.province ? undefined : 'เลือกจังหวัดของคุณก่อน · Settings → ☁️ Cloud Sync'}
        >
          📍 จังหวัดของฉัน
        </button>
      </div>

      {err && <p className="label-aside" style={{ color: '#c75555' }}>เชื่อมต่อล้มเหลว: {err}</p>}
      {!entries && !err && <p className="label-aside">กำลังโหลด…</p>}
      {entries && entries.length === 0 && (
        <p className="label-aside">
          ยังไม่มีผู้เล่นบนบอร์ดนี้ ·{' '}
          {scope === 'global'
            ? 'ลองชนะ master 1 เกมก่อน'
            : scope === 'region'
              ? 'ภูมิภาคของคุณยังไม่มีคนแข่ง · เป็นคนแรก!'
              : 'จังหวัดของคุณยังไม่มีคนแข่ง · เป็นคนแรก!'}
        </p>
      )}
      {entries && entries.length > 0 && (
        <div className="profile-global-lb">
          {entries.map((e) => {
            const p = findProvince(e.province);
            return (
              <div
                key={e.userId}
                className={`profile-global-lb-row ${e.userId === myId ? 'is-me' : ''}`}
              >
                <span className="profile-global-lb-rank">#{e.rank}</span>
                <span className="profile-global-lb-name">
                  {e.displayName}
                  {e.isBot && <span className="profile-global-lb-bot-tag" title="bot character"> 🤖</span>}
                  {p && <span className="profile-global-lb-province"> · 📍 {p.nameTh}</span>}
                </span>
                <span className="profile-global-lb-meta">
                  {e.wins}W · {e.draws}D · {e.losses}L
                </span>
                <span className="profile-global-lb-score">{formatScore(e.score)} pt</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MatchLeaderboardSection({ stats }: { stats: UserStats }) {
  const lb = computeMatchLeaderboard(stats);
  return (
    <section className="profile-section">
      <h3>
        <span className="score-family-tag score-family-b-tag" title="Family B — Competitive Result">B</span>
        🏆 Match Score · <span className="profile-family-label">Competitive Result family</span>
      </h3>
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

function ReviewMasterySection() {
  const m = aggregateMastery();
  if (m.reviewCount === 0) {
    return (
      <section className="profile-section">
        <h3>
          <span className="score-family-tag score-family-a-tag" title="Family A — Performance Quality">A</span>
          📈 Review Mastery · <span className="profile-family-label">Performance Quality family</span>
        </h3>
        <p className="label-aside">
          เล่นเกม + กด "🔍 ดูรีวิวเกม" เพื่อสะสมข้อมูล · ระบบจะ aggregate ค่า accuracy + จำนวน blunder/mistake ข้ามเกม
        </p>
      </section>
    );
  }
  const arrow = m.trend > 1 ? '↗' : m.trend < -1 ? '↘' : '→';
  return (
    <section className="profile-section">
      <h3>
        <span className="score-family-tag score-family-a-tag" title="Family A — Performance Quality">A</span>
        📈 Review Mastery · จาก {m.reviewCount} รีวิวล่าสุด · <span className="profile-family-label">Performance Quality family</span>
      </h3>
      <div className="mastery-grid">
        <div className="mastery-tile" style={{ borderColor: '#7aba7f55' }}>
          <div className="mastery-tile-label">Accuracy เฉลี่ย</div>
          <div className="mastery-tile-value" style={{ color: '#7aba7f' }}>
            {m.averageAccuracy}%
          </div>
          <div className="mastery-tile-sub">
            {m.totalMoves} ตา รวม
          </div>
        </div>
        <div className="mastery-tile" style={{ borderColor: '#d4a23c55' }}>
          <div className="mastery-tile-label">Accuracy 10 เกมล่าสุด</div>
          <div className="mastery-tile-value" style={{ color: '#d4a23c' }}>
            {m.recentAccuracy}% {arrow}
          </div>
          <div className="mastery-tile-sub">
            trend {m.trend > 0 ? '+' : ''}{m.trend}
          </div>
        </div>
        <div className="mastery-tile" style={{ borderColor: '#e85a4a55' }}>
          <div className="mastery-tile-label">Blunders รวม</div>
          <div className="mastery-tile-value" style={{ color: '#e85a4a' }}>
            {m.totals.blunder}
          </div>
          <div className="mastery-tile-sub">
            ค่า mistake: {m.totals.mistake}
          </div>
        </div>
        <div className="mastery-tile" style={{ borderColor: '#8acf6a55' }}>
          <div className="mastery-tile-label">ตาที่ดีที่สุด</div>
          <div className="mastery-tile-value" style={{ color: '#8acf6a' }}>
            {m.totals.best}
          </div>
          <div className="mastery-tile-sub">
            good: {m.totals.good}
          </div>
        </div>
      </div>
      {Object.keys(m.motifs).length > 0 && (
        <>
          <h4 className="mastery-motif-subtitle">🎯 Motifs ที่คุณเล่นมาแล้ว</h4>
          <div className="mastery-motif-grid">
            {(Object.keys(m.motifs) as MotifKind[]).map((kind) => (
              <div key={kind} className="mastery-motif-chip">
                <span className="mastery-motif-label">{MOTIF_LABELS[kind] ?? kind}</span>
                <span className="mastery-motif-count">{m.motifs[kind]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SeasonHallOfFameSection() {
  const backend = getBackend();
  const supports = backend.fetchClosedSeasons !== undefined;
  const [seasons, setSeasons] = useState<import('../lib/backend/types').SeasonSummary[] | null>(null);
  const [active, setActive] = useState<import('../lib/backend/types').SeasonInfo | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [winners, setWinners] = useState<import('../lib/backend/types').SeasonDetail | null>(null);

  useEffect(() => {
    if (!supports) return;
    let cancelled = false;
    if (backend.fetchActiveSeason) {
      backend.fetchActiveSeason().then((s) => {
        if (!cancelled) setActive(s);
      }).catch(() => undefined);
    }
    if (backend.fetchClosedSeasons) {
      backend.fetchClosedSeasons().then((s) => {
        if (!cancelled) setSeasons(s);
      }).catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [supports, backend]);

  useEffect(() => {
    if (!openId || !backend.fetchSeasonWinners) {
      setWinners(null);
      return;
    }
    let cancelled = false;
    backend.fetchSeasonWinners(openId).then((d) => {
      if (!cancelled) setWinners(d);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [openId, backend]);

  if (!supports) return null;
  return (
    <section className="profile-section">
      <h3>🏆 Season Hall of Fame</h3>
      <p className="label-aside">
        ผู้ชนะแต่ละไตรมาส · บันทึกถาวร · scope: global · region · province
      </p>
      {active && (
        <p className="season-active-line">
          ฤดูกาลปัจจุบัน: <strong>{active.label}</strong> · จบ{' '}
          {new Date(active.endsAt).toLocaleDateString('th-TH')}
        </p>
      )}
      {seasons && seasons.length === 0 && (
        <p className="label-aside">ยังไม่มีฤดูกาลที่ปิด · cron rollover จะบันทึกหลังจบไตรมาสแรก</p>
      )}
      {seasons && seasons.length > 0 && (
        <ul className="season-hof-list">
          {seasons.map((s) => (
            <li key={s.id}>
              <button
                className="season-hof-row"
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
              >
                <span><strong>{s.label}</strong></span>
                <span className="label-aside">
                  ปิด {s.closedAt ? new Date(s.closedAt).toLocaleDateString('th-TH') : '—'}
                </span>
              </button>
              {openId === s.id && winners && (
                <div className="season-hof-winners">
                  {winners.winners.length === 0 ? (
                    <span className="label-aside">ไม่มีผู้ชนะบันทึก</span>
                  ) : (
                    winners.winners.map((w, i) => (
                      <div key={i} className="season-hof-winner">
                        <span className="label-aside">{w.scope}</span>
                        <span>#{w.rank} · {w.displayName} · {w.rating}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeasonSection() {
  // Touches getActiveSeason on every Profile render — it freezes any
  // rolled-over seasons + updates the active snapshot in one call.
  const active = getActiveSeason();
  const prior = getPriorSeason();
  return (
    <section className="profile-section">
      <h3>📅 ฤดูกาล · {seasonLabel(active.seasonId)}</h3>
      <p className="label-aside">
        Snapshot ของฤดูกาลนี้ · เริ่มต้นเมื่อต้นไตรมาส · ตัวเลขจะคงตอนหลังจบไตรมาส
      </p>
      <div className="season-grid">
        <div className="season-tile">
          <div className="season-tile-label">Peak rating</div>
          <div className="season-tile-value">{active.peakRating}</div>
          {prior && (
            <div className="season-tile-sub">
              ฤดูก่อน {seasonLabel(prior.seasonId)}: {prior.peakRating}
            </div>
          )}
        </div>
        <div className="season-tile">
          <div className="season-tile-label">เกมที่บันทึก</div>
          <div className="season-tile-value">{active.totalGames}</div>
          {prior && (
            <div className="season-tile-sub">
              ฤดูก่อน: {prior.totalGames}
            </div>
          )}
        </div>
        <div className="season-tile">
          <div className="season-tile-label">ปริศนาแก้</div>
          <div className="season-tile-value">{active.puzzlesSolved}</div>
          {prior && (
            <div className="season-tile-sub">
              ฤดูก่อน: {prior.puzzlesSolved}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MasteryOverview() {
  // Aggregate progress across the four "skill verticals" — derived
  // from existing local progress stores so this stays offline-safe.
  const drill = loadDrillProgress();
  const trainer = loadTrainerProgress();
  const rush = loadRushProgress();
  const puzzleProg = loadPuzzleProgress();

  // Drill: cleared if best exists for that level
  const drillCleared = Object.values(drill.bestByLevel).filter(Boolean).length;
  const drillTotal = DRILL_LEVELS.length;

  // Move Trainer: "mastered" if perfectMoves === totalMoves
  const trainerMastered = Object.values(trainer.bestByOpening).filter(
    (b) => b && b.perfectMoves === b.totalMoves,
  ).length;
  // Count by reading the catalog length lazily — fallback to 5 for
  // the standard openings catalog if loadOpenings hasn't fired yet.
  const trainerTotal = 5;

  // Boss Rush: max clear across all tiers
  const rushMax = Math.max(
    rush.bestByTier.rookie?.beatenCount ?? 0,
    rush.bestByTier.veteran?.beatenCount ?? 0,
    rush.bestByTier.master?.beatenCount ?? 0,
  );
  const rushFullClears = (['rookie', 'veteran', 'master'] as const).filter(
    (t) => (rush.bestByTier[t]?.beatenCount ?? 0) === 7,
  ).length;

  // Puzzles solved from local progress
  const solvedPuzzles = puzzleProg.solved ? Object.keys(puzzleProg.solved).length : 0;

  const tiles: { label: string; value: string; sub: string; color: string }[] = [
    {
      label: '🔢 Counting drills',
      value: `${drillCleared} / ${drillTotal}`,
      sub: drillCleared === drillTotal ? 'ครบทุก level ⭐' : 'ฝึก endgame Makruk เฉพาะตัว',
      color: '#d4a23c',
    },
    {
      label: '📖 Move Trainer',
      value: `${trainerMastered} / ${trainerTotal}`,
      sub: trainerMastered === trainerTotal ? 'จำ opening ครบ ⭐' : 'opening ที่จำได้แม่น',
      color: '#a37bf5',
    },
    {
      label: '🧩 Puzzles solved',
      value: `${solvedPuzzles}`,
      sub: 'ปริศนาทั้งหมด · รวมทุก category',
      color: '#7aba7f',
    },
    {
      label: '🏆 Boss Rush max',
      value: `${rushMax} / 7`,
      sub: rushFullClears > 0 ? `clear ${rushFullClears} tier เต็ม` : 'ผ่านบอตติดต่อกัน',
      color: '#e85a4a',
    },
  ];

  return (
    <section className="profile-section">
      <h3>🎯 Skill Mastery</h3>
      <p className="label-aside">
        ภาพรวม progress ของคุณข้าม 4 mode หลัก · อัพเดต local realtime
      </p>
      <div className="mastery-grid">
        {tiles.map((t) => (
          <div key={t.label} className="mastery-tile" style={{ borderColor: t.color + '55' }}>
            <div className="mastery-tile-label">{t.label}</div>
            <div className="mastery-tile-value" style={{ color: t.color }}>{t.value}</div>
            <div className="mastery-tile-sub">{t.sub}</div>
          </div>
        ))}
      </div>
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
