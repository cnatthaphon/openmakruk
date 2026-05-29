// 📊 Stats page — population-level public stats.
//
// Reached via `/#/stats` (a hidden content route, deep-linkable from
// share images + the footer). Shows:
//
//   • Total registered players (humans)
//   • Online right now (last_seen_at within 5 minutes)
//   • Region breakdown (6 regions per Thai government classification)
//   • Top 10 declared provinces by player count
//   • Score-family aggregates (3 axes: Outcome / Quality / Speed)
//
// Why a dedicated page (vs sticking these on Profile or About):
//   - These numbers describe the platform, not the visitor — they
//     deserve their own room so a journalist or curious onlooker can
//     find them without an account
//   - Server is the single source of truth (per architecture rule) —
//     no client compute, no local cache — the page is intentionally
//     a thin renderer over /api/stats
//
// Score families: see /api/stats payload comments. The three family
// concept lets us measure "are you winning?" (Outcome), "are you
// playing well?" (Quality), and "are you fast/durable?" (Speed)
// without forcing them into a single confused metric.

import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { getBackend } from '../lib/backend';
import type { PopulationStats } from '../lib/backend/types';
import { navigate } from '../lib/router';
import { SkeletonScreen } from '../components/Skeleton';

export function StatsPage() {
  const backend = getBackend();
  const supports = backend.fetchStats !== undefined;
  const [data, setData] = useState<PopulationStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!supports || !backend.fetchStats) return;
    let cancelled = false;
    backend
      .fetchStats()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [supports, backend]);

  if (!supports) {
    return (
      <Page variant="medium" className="stats-page">
        <p className="label-aside">หน้านี้ต้องการ backend ที่ออนไลน์</p>
      </Page>
    );
  }

  if (err) {
    return (
      <Page variant="medium" className="stats-page">
        <p className="bot-detail-error">⚠ {err}</p>
        <button className="bot-detail-back" onClick={() => navigate({ tab: 'profile' })}>
          ← กลับโปรไฟล์
        </button>
      </Page>
    );
  }

  if (!data) {
    return (
      <Page variant="medium" className="stats-page">
        <SkeletonScreen message="กำลังโหลดสถิติ…" />
      </Page>
    );
  }

  return (
    <Page variant="medium" className="stats-page">
      <button
        className="bot-detail-back"
        onClick={() => navigate({ tab: 'profile' })}
        aria-label="กลับโปรไฟล์"
      >
        ← กลับ
      </button>

      <header className="stats-hero">
        <h2 className="stats-title">📊 สถิติแพลตฟอร์ม OpenMakruk</h2>
        <p className="stats-subtitle">
          อัปเดตล่าสุด {new Date(data.generatedAt).toLocaleString('th-TH')} ·
          “ออนไลน์” = active ภายใน {data.onlineWindowMinutes} นาที
        </p>
      </header>

      <section className="stats-section">
        <h3>👥 ผู้เล่นทั้งหมด</h3>
        <div className="stats-headline-grid">
          <div className="stats-card">
            <div className="stats-num">{data.population.total.toLocaleString('th-TH')}</div>
            <div className="stats-label">ลงทะเบียนทั้งหมด</div>
          </div>
          <div className="stats-card stats-card-online">
            <div className="stats-num">
              <span className="stats-online-dot" aria-hidden="true">●</span>
              {data.population.online.toLocaleString('th-TH')}
            </div>
            <div className="stats-label">ออนไลน์ตอนนี้</div>
          </div>
          <div className="stats-card">
            <div className="stats-num">{data.families.outcome.totalGames.toLocaleString('th-TH')}</div>
            <div className="stats-label">เกมรวมทั้งหมด</div>
          </div>
        </div>
        {data.population.undeclared.total > 0 && (
          <p className="stats-foot">
            ผู้เล่นที่ยังไม่ระบุจังหวัด: {data.population.undeclared.total.toLocaleString('th-TH')}
            {' · '}ออนไลน์ {data.population.undeclared.online.toLocaleString('th-TH')}
          </p>
        )}
      </section>

      <section className="stats-section">
        <h3>🗺️ แบ่งตามภูมิภาค</h3>
        <table className="stats-table">
          <thead>
            <tr>
              <th>ภูมิภาค</th>
              <th>ผู้เล่น</th>
              <th>ออนไลน์</th>
            </tr>
          </thead>
          <tbody>
            {data.byRegion.map((r) => (
              <tr key={r.region}>
                <td>{r.label}</td>
                <td>{r.total.toLocaleString('th-TH')}</td>
                <td>
                  {r.online > 0 ? (
                    <>
                      <span className="stats-online-dot" aria-hidden="true">●</span>
                      {r.online.toLocaleString('th-TH')}
                    </>
                  ) : (
                    <span className="stats-dim">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="stats-section">
        <h3>📍 จังหวัดที่มีผู้เล่นมากที่สุด · Top 10</h3>
        {data.topProvinces.length === 0 ? (
          <p className="stats-dim">ยังไม่มีผู้เล่นที่ระบุจังหวัด</p>
        ) : (
          <table className="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th>จังหวัด</th>
                <th>ผู้เล่น</th>
                <th>ออนไลน์</th>
              </tr>
            </thead>
            <tbody>
              {data.topProvinces.map((p, i) => (
                <tr key={p.code}>
                  <td className="stats-rank">{i + 1}</td>
                  <td>{p.nameTh}</td>
                  <td>{p.total.toLocaleString('th-TH')}</td>
                  <td>
                    {p.online > 0 ? (
                      <>
                        <span className="stats-online-dot" aria-hidden="true">●</span>
                        {p.online.toLocaleString('th-TH')}
                      </>
                    ) : (
                      <span className="stats-dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="stats-section">
        <h3>⚖️ ระบบคะแนน 3 ตระกูล (Three Measurement Families)</h3>
        <p className="stats-section-intro">
          OpenMakruk แยก <em>"คุณเล่นดีแค่ไหน"</em> ออกจาก{' '}
          <em>"คุณชนะหรือไม่"</em> โดยตั้งใจ — เพื่อให้ training platform
          ไม่ลงโทษการแพ้ในเกมที่เล่นได้สะอาด. คะแนนทุกตระกูลวัดจากการเล่นกับ bot
          และผ่านการ verify โดย server.
        </p>

        <div className="stats-family-grid">
          <article className="stats-family stats-family-a">
            <header>
              <span className="stats-family-tag">Family A</span>
              <h4>Performance Quality — เล่นดีแค่ไหน</h4>
            </header>
            <p className="stats-family-q">“คุณเล่นได้สวยแค่ไหน?”</p>
            <p className="stats-family-note">
              Accuracy %, ACPL, best / good / inaccuracy / mistake / blunder
              counts, motif ที่ตรวจพบ (capture · check · fork · mate threat).
              ปัจจุบันเก็บใน local storage ของแต่ละคน — roll-up เป็น public
              aggregate มาในเวอร์ชั่นถัดไป
            </p>
            <a className="stats-family-link" href="#/profile">
              → ดูใน Profile ของคุณ
            </a>
          </article>

          <article className="stats-family stats-family-b">
            <header>
              <span className="stats-family-tag">Family B</span>
              <h4>Competitive Result — ชนะ challenge ไหม</h4>
            </header>
            <p className="stats-family-q">“คุณเอาชนะ challenge ได้แค่ไหน?”</p>
            <dl className="stats-family-stats">
              <dt>Top Rating</dt>
              <dd>{data.families.outcome.topRating}</dd>
              <dt>ค่าเฉลี่ย Rating</dt>
              <dd>{data.families.outcome.avgRating}</dd>
              <dt>ชนะรวม</dt>
              <dd>{data.families.outcome.wins.toLocaleString('th-TH')}</dd>
              <dt>เสมอรวม</dt>
              <dd>{data.families.outcome.draws.toLocaleString('th-TH')}</dd>
            </dl>
            <p className="stats-family-note">
              Elo (ความแข็งแกร่งระยะยาว) + Match Score (ถ่วงด้วยความยาก
              ของคู่ต่อสู้: easy 1 · medium 3 · hard 8 · master 20) +
              tournament / gauntlet
            </p>
          </article>

          <article className="stats-family stats-family-c">
            <header>
              <span className="stats-family-tag">Family C</span>
              <h4>Speed / Survival — เร็วและทนแค่ไหน</h4>
            </header>
            <p className="stats-family-q">“คุณเร็วและทนแค่ไหน?”</p>
            <dl className="stats-family-stats">
              <dt>เกมเล่นเยอะที่สุด (1 คน)</dt>
              <dd>{data.families.speed.topGamesPlayed.toLocaleString('th-TH')}</dd>
            </dl>
            <p className="stats-family-note">
              Boss Rush best time · Puzzle Rush score · Survive rounds ·
              Counting Trainer star rating — บันทึก best ใน local ของแต่ละคน
            </p>
          </article>
        </div>

        <p className="stats-section-intro">
          <strong>หลักการสำคัญ:</strong> เกมที่แพ้ด้วย accuracy 82% และ
          blunder 1 ตา ยังได้ Family-A signal เป็นบวก. ผู้เล่นที่ "ชนะแต่
          blunder 5 ตา" และ "แพ้แต่เล่นสะอาด" จึงไม่ถูกวัดเป็นคนเก่งเท่ากัน.
        </p>
      </section>

      <section className="stats-section stats-cta">
        <h3>🎯 อยากแข่งกัน?</h3>
        <p>
          OpenMakruk เป็น <strong>single-player platform</strong> — ไม่มี PvP สด
          แต่ใช้โหมด <a href="#/challenge">Async Challenge</a> ท้าเพื่อนเล่น bot เดียวกัน
          แล้วเทียบคะแนนตามทั้ง 3 family ข้างบนนี้ได้
        </p>
        <button className="stats-cta-btn" onClick={() => navigate({ tab: 'challenge' })}>
          ⚔️ สร้าง Challenge
        </button>
      </section>
    </Page>
  );
}
