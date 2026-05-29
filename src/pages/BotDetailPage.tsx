// 🤖 Bot Detail page — individual character profile for any of the
// 22 bot characters. Reached via `/#/bots/<bot-id>` from the Bot Hall
// of Fame card, or directly from share links.
//
// Why a dedicated page (vs the current expand-in-place card):
//   - 22 bots feel like a roster, not a spreadsheet — each bot reads
//     as a character with motto + strengths/weaknesses, not a row
//     with numbers
//   - Deep-linkable: someone can paste "/#/bots/bot:attacker-master"
//     into LINE and a friend lands on the right page
//   - Future home for per-user head-to-head, recent games vs this
//     bot, replay highlights (Phase 10D+)
//
// Data sources:
//   - Live stats (rating + W/L/D counts) come from /api/bots/:id —
//     server aggregates from games table on each request
//   - Personality + emoji + Thai description come from the static
//     PERSONALITIES catalog
//   - Narrative (motto + strengths/weaknesses + how-to-beat) come
//     from the static PERSONALITY_NARRATIVES catalog

import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { getBackend } from '../lib/backend';
import type { BotCharacter } from '../lib/backend/types';
import { findPersonality } from '../lib/personalities/personalities';
import { findNarrative } from '../lib/personalities/narrative';
import { navigate } from '../lib/router';
import { SkeletonScreen } from '../components/Skeleton';
import { setChallengeTarget } from '../lib/challenge';
import { loadSettings, saveSettings } from '../lib/settings';
import { toast } from '../components/Toast';

type Props = {
  botId: string | null;
};

export function BotDetailPage({ botId }: Props) {
  const backend = getBackend();
  const supports = backend.fetchBot !== undefined;
  const [bot, setBot] = useState<BotCharacter | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!botId || !supports || !backend.fetchBot) return;
    // Share-link normalization: `/#/bots/attacker-master` (cleaner URL,
    // what a Hall-of-Fame click used to drop) and `/#/bots/bot:attacker-master`
    // (what worker stores) must both resolve. Prepend `bot:` if missing.
    const normalized = botId.startsWith('bot:') ? botId : `bot:${botId}`;
    let cancelled = false;
    setBot(null);
    setErr(null);
    backend
      .fetchBot(normalized)
      .then((b) => {
        if (cancelled) return;
        if (!b) setErr('ไม่พบ bot id นี้');
        else setBot(b);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [botId, supports, backend]);

  if (!botId) {
    return (
      <Page variant="medium" className="bot-detail-page">
        <p className="label-aside">ไม่มี bot id ใน URL · กรุณาเลือกจาก Bot Hall of Fame</p>
        <button className="bot-detail-back" onClick={() => navigate({ tab: 'profile' })}>
          ← กลับ Hall of Fame
        </button>
      </Page>
    );
  }

  if (!supports) {
    return (
      <Page variant="medium" className="bot-detail-page">
        <p className="label-aside">หน้า bot detail ต้องการ backend ที่ออนไลน์ · ลองรีเฟรชอีกครั้ง</p>
      </Page>
    );
  }

  if (err) {
    return (
      <Page variant="medium" className="bot-detail-page">
        <p className="bot-detail-error">⚠ {err}</p>
        <button className="bot-detail-back" onClick={() => navigate({ tab: 'profile' })}>
          ← กลับ Hall of Fame
        </button>
      </Page>
    );
  }

  if (!bot) {
    return (
      <Page variant="medium" className="bot-detail-page">
        <SkeletonScreen message="กำลังโหลด bot…" />
      </Page>
    );
  }

  const personality = findPersonality(bot.personality);
  const narrative = findNarrative(bot.personality);
  // win rate vs humans: from the bot's POV, "losses" = bot won = human
  // lost. We display the bot's win rate, not the user's.
  const totalDecisive = bot.losses + bot.wins; // bot wins + bot losses
  const botWinRate =
    totalDecisive > 0 ? Math.round((bot.losses / totalDecisive) * 100) : null;

  return (
    <Page variant="medium" className="bot-detail-page">
      <button
        className="bot-detail-back"
        onClick={() => navigate({ tab: 'profile' })}
        aria-label="กลับ Bot Hall of Fame"
      >
        ← Bot Hall of Fame
      </button>

      <header className="bot-detail-hero">
        <div className="bot-detail-avatar" aria-hidden="true">
          {bot.avatar}
        </div>
        <div className="bot-detail-headline">
          <h2 className="bot-detail-name">{bot.displayName}</h2>
          <div className="bot-detail-tags">
            <span className="bot-detail-tier" data-tier={bot.tier}>
              {bot.tier === 'rookie' ? '🥉 Rookie' : bot.tier === 'veteran' ? '🥈 Veteran' : '🥇 Master'}
            </span>
            {personality && (
              <span className="bot-detail-personality">
                {personality.emoji} {personality.name}
              </span>
            )}
            <span className="bot-detail-rating">⭐ {bot.rating}</span>
          </div>
        </div>
      </header>

      {narrative && (
        <p className="bot-detail-motto">{narrative.motto}</p>
      )}

      <section className="bot-detail-section">
        <h3>📜 ตำนาน</h3>
        <p className="bot-detail-lore">{bot.lore}</p>
      </section>

      {personality && (
        <section className="bot-detail-section">
          <h3>{personality.emoji} สไตล์การเล่น</h3>
          <p className="bot-detail-style">{personality.description}</p>
        </section>
      )}

      {narrative && (
        <>
          <section className="bot-detail-section">
            <h3>💪 จุดเด่น</h3>
            <ul className="bot-detail-list">
              {narrative.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>

          <section className="bot-detail-section">
            <h3>🦴 จุดอ่อน</h3>
            <ul className="bot-detail-list">
              {narrative.weaknesses.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>

          <section className="bot-detail-section bot-detail-howtobeat">
            <h3>💡 วิธีเอาชนะ</h3>
            <p>{narrative.howToBeat}</p>
          </section>
        </>
      )}

      <section className="bot-detail-section">
        <h3>📊 สถิติ vs มนุษย์</h3>
        <div className="bot-detail-stats">
          <div className="bot-detail-stat">
            <div className="bot-detail-stat-num">{bot.gamesPlayed}</div>
            <div className="bot-detail-stat-label">เกมรวม</div>
          </div>
          <div className="bot-detail-stat">
            <div className="bot-detail-stat-num">{bot.losses}</div>
            <div className="bot-detail-stat-label">🏆 bot ชนะ</div>
          </div>
          <div className="bot-detail-stat">
            <div className="bot-detail-stat-num">{bot.wins}</div>
            <div className="bot-detail-stat-label">😞 มนุษย์ชนะ</div>
          </div>
          <div className="bot-detail-stat">
            <div className="bot-detail-stat-num">{bot.draws}</div>
            <div className="bot-detail-stat-label">🤝 เสมอ</div>
          </div>
          {botWinRate !== null && (
            <div className="bot-detail-stat highlight">
              <div className="bot-detail-stat-num">{botWinRate}%</div>
              <div className="bot-detail-stat-label">bot win rate</div>
            </div>
          )}
        </div>
      </section>

      <section className="bot-detail-cta">
        <button
          className="bot-detail-challenge"
          onClick={() => {
            // Lock the Play tab to this specific bot character.
            setChallengeTarget({
              botId: bot.id,
              displayName: bot.displayName,
              avatar: bot.avatar,
              personality: bot.personality,
              tier: bot.tier,
              rating: bot.rating,
            });
            // Swap the active engine to this personality so the
            // Play tab actually plays the bot's style. Personality
            // engines are registered as `personality:<id>` by
            // src/lib/personalities/scoredBot.ts.
            const settings = loadSettings();
            saveSettings({
              ...settings,
              engineId: `personality:${bot.personality}`,
            });
            toast.success(`⚔️ พร้อมท้าดวล ${bot.displayName}`);
            navigate({ tab: 'play' });
          }}
        >
          ⚔️ ท้าดวลตอนนี้
        </button>
        <button
          className="bot-detail-share"
          onClick={() => {
            // Share the prefix-stripped slug so URLs read as
            // `openmakruk.com/#/bots/attacker-master` instead of
            // the ugly `bot:attacker-master`. BotDetailPage's effect
            // normalizes either form back into the worker shape.
            const slug = bot.id.startsWith('bot:') ? bot.id.slice(4) : bot.id;
            const url = `${window.location.origin}/#/bots/${encodeURIComponent(slug)}`;
            const text = `เจอ bot ${bot.displayName} (rating ${bot.rating}) ที่ OpenMakruk · ท้าดวลกัน`;
            if (typeof navigator.share === 'function') {
              navigator.share({ title: bot.displayName, text, url }).catch(() => undefined);
            } else {
              const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(
                url,
              )}&text=${encodeURIComponent(text)}`;
              window.open(lineUrl, '_blank', 'noopener,noreferrer');
            }
          }}
        >
          📤 แชร์
        </button>
      </section>
    </Page>
  );
}
