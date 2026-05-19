// Profile tab — full version of what the sidebar mini-profile shows.
// Username editable, rating panel, recent games list, achievements
// scaffolding, export/import buttons. No graph yet (Phase 1.x adds D3).

import { useRef, useState } from 'react';
import {
  CPU_RATINGS,
  exportStatsJSON,
  importStatsJSON,
  recommendedLevel,
  saveStats,
  type GameRecord,
  type UserStats,
} from '../lib/stats';
import { DIFFICULTY_LABELS, type Difficulty } from '../lib/engine';

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
        alert('ไฟล์ไม่ถูกต้อง');
        return;
      }
      if (!confirm(`แทนที่ profile ด้วย "${parsed.displayName}" (rating ${parsed.rating}, ${parsed.totalGames} เกม) ?`)) {
        return;
      }
      saveStats(parsed);
      onStatsChange(parsed);
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
          <div className="profile-history">
            {stats.history.map((g, i) => (
              <ProfileHistoryRow key={i} record={g} />
            ))}
          </div>
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
              if (confirm('ลบ profile ทั้งหมด? (rating, history, settings) — กู้ไม่ได้')) {
                onResetAll();
              }
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

function ProfileHistoryRow({ record }: { record: GameRecord }) {
  const date = new Date(record.date);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
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
    </div>
  );
}

function computeWinRate(history: GameRecord[]): { wins: number; total: number } {
  const wins = history.filter((g) => g.outcome === 'win').length;
  return { wins, total: history.length };
}
