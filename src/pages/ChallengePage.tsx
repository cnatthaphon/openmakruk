// ⚔️ Async Challenge page.
//
// Two modes, switched by the URL:
//   /#/challenge          → CREATE: pick a bot + criterion + share URL
//   /#/challenge/<code>   → ACCEPT: someone sent you a link, accept it
//
// Mental model: this is Strava-segment-for-Makruk. Both players play
// the same bot under the same time control; results are compared on
// the user's chosen criterion (outcome / quality / speed / all). The
// page intentionally does NOT mediate a realtime match — that's the
// whole "async" point of the position.
//
// Sharing:
//   - The full challenge state is encoded in the URL (base64url).
//     No backend storage needed for v1; the URL is the database.
//   - We surface a "Copy / LINE / Twitter" share row so the creator
//     can ship the link in one click.
//
// After accepting: we set the challenge target (existing Phase 10C
// mechanism) and navigate to the Play tab. The user plays as normal —
// the existing scoring path already records the game against the bot.

import { useEffect, useState } from 'react';
import { getBackend } from '../lib/backend';
import { navigate } from '../lib/router';
import { setChallengeTarget } from '../lib/challenge';
import { loadSettings, saveSettings } from '../lib/settings';
import { loadStats } from '../lib/stats';
import { toast } from '../components/Toast';
import { SkeletonScreen } from '../components/Skeleton';
import type { BotCharacter } from '../lib/backend/types';
import {
  type ChallengeCriterion,
  type ChallengePayload,
  CRITERION_LABELS_TH,
  TIME_CTL_LABELS_TH,
  buildChallengeUrl,
  decodeChallenge,
  loadChallengeHistory,
  recordChallenge,
} from '../lib/asyncChallenge';

type Props = {
  code: string | null;
};

export function ChallengePage({ code }: Props) {
  if (code) return <AcceptView code={code} />;
  return <CreateView />;
}

// ─── CREATE ─────────────────────────────────────────────────────────

function CreateView() {
  const backend = getBackend();
  const supports = backend.fetchBots !== undefined;
  const [bots, setBots] = useState<BotCharacter[]>([]);
  const [selectedBot, setSelectedBot] = useState<string>('');
  const [criterion, setCriterion] = useState<ChallengeCriterion>('outcome');
  const [tc, setTc] = useState<ChallengePayload['tc']>('blitz5');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const history = loadChallengeHistory();
  const displayName = loadStats().displayName || 'นักหมาก';

  useEffect(() => {
    if (!supports || !backend.fetchBots) return;
    backend.fetchBots()
      .then((b) => {
        setBots(b);
        if (b.length > 0 && !selectedBot) setSelectedBot(b[0].id);
      })
      .catch(() => undefined);
    // selectedBot intentionally excluded — only seed once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supports, backend]);

  const handleCreate = () => {
    if (!selectedBot) return;
    const slug = selectedBot.startsWith('bot:') ? selectedBot.slice(4) : selectedBot;
    const payload: ChallengePayload = { v: 1, b: slug, c: criterion, tc, by: displayName };
    const url = buildChallengeUrl(payload);
    setShareUrl(url);
    recordChallenge({
      code: url.split('/').pop() ?? '',
      payload,
      role: 'created',
    });
  };

  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl)
      .then(() => toast.success('คัดลอกลิงก์แล้ว'))
      .catch(() => toast.error('คัดลอกไม่สำเร็จ'));
  };

  const shareLine = () => {
    if (!shareUrl) return;
    const bot = bots.find((b) => b.id === selectedBot);
    const text = `ฉันท้าคุณเล่นกับ ${bot?.displayName ?? 'bot'} ที่ OpenMakruk — ใครทำได้ดีกว่ากัน?`;
    const url = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!supports) {
    return (
      <main className="challenge-page">
        <p className="label-aside">หน้านี้ต้องการ backend ที่ออนไลน์</p>
      </main>
    );
  }

  return (
    <main className="challenge-page">
      <button
        className="bot-detail-back"
        onClick={() => navigate({ tab: 'profile' })}
        aria-label="กลับโปรไฟล์"
      >
        ← กลับ
      </button>

      <header className="challenge-hero">
        <h2>⚔️ Async Challenge</h2>
        <p className="challenge-tag">
          ท้าเพื่อนเล่น <strong>bot เดียวกัน</strong> ภายใต้ <strong>กฎเดียวกัน</strong> —
          แล้วเทียบคะแนน. แบบ Strava segment / Trackmania ghost / Wordle ของหมากรุกไทย
        </p>
      </header>

      <section className="challenge-builder">
        <h3>📤 สร้าง Challenge</h3>
        <div className="challenge-form">
          <label className="challenge-field">
            <span>🤖 เลือก bot</span>
            <select
              value={selectedBot}
              onChange={(e) => setSelectedBot(e.target.value)}
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.avatar} {b.displayName} · {b.tier} · ⭐ {b.rating}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="challenge-field">
            <legend>🎯 เกณฑ์การวัด</legend>
            {(Object.keys(CRITERION_LABELS_TH) as ChallengeCriterion[]).map((c) => (
              <label key={c} className="challenge-radio">
                <input
                  type="radio"
                  name="criterion"
                  value={c}
                  checked={criterion === c}
                  onChange={() => setCriterion(c)}
                />
                {CRITERION_LABELS_TH[c]}
              </label>
            ))}
          </fieldset>

          <label className="challenge-field">
            <span>⏱️ เวลา</span>
            <select
              value={tc}
              onChange={(e) => setTc(e.target.value as ChallengePayload['tc'])}
            >
              {(Object.keys(TIME_CTL_LABELS_TH) as ChallengePayload['tc'][]).map((id) => (
                <option key={id} value={id}>{TIME_CTL_LABELS_TH[id]}</option>
              ))}
            </select>
          </label>

          <button
            className="challenge-create-btn"
            onClick={handleCreate}
            disabled={!selectedBot}
          >
            ▶️ สร้างลิงก์ Challenge
          </button>
        </div>

        {shareUrl && (
          <div className="challenge-share">
            <p className="challenge-share-label">ลิงก์พร้อมแชร์:</p>
            <code className="challenge-share-url">{shareUrl}</code>
            <div className="challenge-share-actions">
              <button onClick={copy}>📋 คัดลอก</button>
              <button onClick={shareLine}>💬 LINE</button>
              <button onClick={() => acceptInline()}>⚔️ เริ่มเล่นเอง</button>
            </div>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="challenge-history">
          <h3>📜 Challenge ของคุณ</h3>
          <ul className="challenge-history-list">
            {history.map((rec) => (
              <li key={rec.code}>
                <span className="challenge-history-role">
                  {rec.role === 'created' ? '📤 สร้าง' : '📥 รับ'}
                </span>
                <span className="challenge-history-bot">
                  vs {rec.payload.b} · {CRITERION_LABELS_TH[rec.payload.c]}
                </span>
                {rec.result ? (
                  <span className="challenge-history-result">
                    {rec.result.outcome === 'win' ? '🏆' : rec.result.outcome === 'draw' ? '🤝' : '😞'}
                    {' '}{rec.result.moves} ตา
                  </span>
                ) : (
                  <a href={`#/challenge/${rec.code}`} className="challenge-history-link">
                    เริ่มเล่น →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );

  function acceptInline() {
    if (!shareUrl) return;
    const c = shareUrl.split('/').pop();
    if (c) navigate({ tab: 'challenge', id: c });
  }
}

// ─── ACCEPT ─────────────────────────────────────────────────────────

function AcceptView({ code }: { code: string }) {
  const backend = getBackend();
  const payload = decodeChallenge(code);
  const [bot, setBot] = useState<BotCharacter | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Has the local user already attempted this same challenge code?
  // If so we show their prior result inline ("คุณเคยลองแล้ว: 🏆 32 ตา")
  // so re-visiting a link doesn't feel like starting from scratch.
  const priorAttempt = loadChallengeHistory().find(
    (r) => r.code === code && !!r.result,
  );

  useEffect(() => {
    if (!payload || !backend.fetchBot) return;
    backend.fetchBot(`bot:${payload.b}`)
      .then((b) => {
        if (!b) setErr('ไม่พบ bot ใน challenge นี้ (อาจถูกย้ายหรือลบ)');
        else setBot(b);
      })
      .catch((e: unknown) => setErr(String(e)));
  }, [payload, backend]);

  if (!payload) {
    return (
      <main className="challenge-page">
        <p className="bot-detail-error">⚠ ลิงก์ challenge ไม่ถูกต้องหรือชำรุด</p>
        <button className="bot-detail-back" onClick={() => navigate({ tab: 'challenge' })}>
          ← สร้าง challenge ใหม่
        </button>
      </main>
    );
  }

  if (err) {
    return (
      <main className="challenge-page">
        <p className="bot-detail-error">⚠ {err}</p>
        <button className="bot-detail-back" onClick={() => navigate({ tab: 'challenge' })}>
          ← กลับ
        </button>
      </main>
    );
  }

  if (!bot) {
    return (
      <main className="challenge-page">
        <SkeletonScreen message="กำลังโหลด challenge…" />
      </main>
    );
  }

  const accept = () => {
    setChallengeTarget({
      botId: bot.id,
      displayName: bot.displayName,
      avatar: bot.avatar,
      personality: bot.personality,
      tier: bot.tier,
      rating: bot.rating,
    });
    const settings = loadSettings();
    saveSettings({ ...settings, engineId: `personality:${bot.personality}` });
    recordChallenge({ code, payload, role: 'accepted' });
    toast.success(`⚔️ รับ challenge แล้ว · ขอให้โชคดี`);
    navigate({ tab: 'play' });
  };

  return (
    <main className="challenge-page">
      <button
        className="bot-detail-back"
        onClick={() => navigate({ tab: 'challenge' })}
        aria-label="กลับ challenge index"
      >
        ← Challenge index
      </button>

      <article className="challenge-accept-card">
        <header className="challenge-accept-header">
          <span className="challenge-accept-from">⚔️ คุณถูกท้า</span>
          <h2>
            <span className="challenge-accept-by">{payload.by}</span>
            <span className="challenge-accept-verb"> ท้าคุณ!</span>
          </h2>
          <p className="challenge-accept-tagline">
            เพื่อนเล่นไปแล้ว — ตาคุณบ้าง · ลองสู้ bot ตัวเดียวกัน เกณฑ์เดียวกัน แล้วเทียบผล
          </p>
        </header>

        <div className="challenge-accept-bot">
          <div className="challenge-accept-avatar" aria-hidden="true">{bot.avatar}</div>
          <div className="challenge-accept-bot-info">
            <h3>{bot.displayName}</h3>
            <p className="challenge-accept-bot-meta">
              {bot.tier} tier · ⭐ rating {bot.rating}
            </p>
            {bot.lore && (
              <p className="challenge-accept-bot-lore">{bot.lore}</p>
            )}
          </div>
        </div>

        <dl className="challenge-accept-rules">
          <dt>🎯 เกณฑ์วัด</dt>
          <dd>{CRITERION_LABELS_TH[payload.c]}</dd>
          <dt>⏱️ เวลา</dt>
          <dd>{TIME_CTL_LABELS_TH[payload.tc]}</dd>
        </dl>

        {priorAttempt && priorAttempt.result && (
          <div className="challenge-accept-prior" role="status">
            <span aria-hidden="true">
              {priorAttempt.result.outcome === 'win'
                ? '🏆'
                : priorAttempt.result.outcome === 'draw'
                  ? '🤝'
                  : '😞'}
            </span>{' '}
            คุณเคยลองแล้ว · {priorAttempt.result.moves} ตา ·
            {' '}{priorAttempt.result.outcome === 'win' ? 'ชนะ'
              : priorAttempt.result.outcome === 'draw' ? 'เสมอ' : 'แพ้'}
            <span className="challenge-accept-prior-cta"> · ลองอีกครั้งได้</span>
          </div>
        )}

        <button className="challenge-accept-btn" onClick={accept}>
          ⚔️ รับ Challenge — เริ่มเล่น
        </button>
        <p className="challenge-accept-note">
          เมื่อเล่นจบ ผลจะถูกบันทึกในประวัติ challenge · ส่งกลับให้ {payload.by} ได้ผ่าน LINE / Twitter
        </p>
      </article>
    </main>
  );
}
