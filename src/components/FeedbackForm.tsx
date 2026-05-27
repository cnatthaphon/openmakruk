// 💬 Feedback form — beta-period channel for bug reports + suggestions.
//
// Auth-optional: anonymous submissions work; signed-in users get an
// associated user_id so we can reply via the token's owner if they
// choose to leave a contact channel. Build SHA + locale are stamped
// in for triage.
//
// Why a custom form (instead of GitHub Issues redirect):
//   - 95%+ of Thai users do not have a GitHub account
//   - Friction kills bug reports; a textbox + "ส่ง" works
//   - GitHub Issues stays the developer-facing channel; this routes
//     feedback into the backend where we can read it on our schedule

import { useState } from 'react';
import { getBackend } from '../lib/backend';
import { loadSession } from '../lib/backend/cloudSession';
import { BUILD_SHA } from '../lib/release';
import { toast } from './Toast';

type Kind = 'bug' | 'feature' | 'praise' | 'other';

const KIND_LABELS: Record<Kind, string> = {
  bug: '🐛 รายงานบั๊ก',
  feature: '💡 ขอฟีเจอร์',
  praise: '🙏 ชม / ขอบคุณ',
  other: '💬 อื่น ๆ',
};

export function FeedbackForm({ compact = false }: { compact?: boolean }) {
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (busy || !message.trim()) return;
    const backend = getBackend();
    if (!backend.submitFeedback) {
      toast.error('ต้อง online เพื่อส่งฟีดแบ็ก · ลองรีเฟรชอีกครั้ง');
      return;
    }
    setBusy(true);
    try {
      const session = loadSession();
      await backend.submitFeedback(
        {
          message: message.trim(),
          contact: contact.trim() || undefined,
          kind,
          buildSha: BUILD_SHA,
          locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
        },
        session.token || undefined,
      );
      toast.success('ส่งฟีดแบ็กแล้ว · ขอบคุณที่ช่วยให้ OpenMakruk ดีขึ้น 🙏');
      setMessage('');
      setContact('');
      setSent(true);
    } catch (err) {
      const errStr = String(err instanceof Error ? err.message : err);
      if (errStr.includes('rate_limited')) {
        toast.error('ส่งบ่อยเกินไป · ลองอีกครั้งใน 1 ชั่วโมง');
      } else {
        toast.error(`ส่งไม่สำเร็จ: ${errStr}`);
      }
    } finally {
      setBusy(false);
    }
  };

  if (sent && compact) {
    return (
      <div className="feedback-form-sent">
        ✅ ส่งแล้ว · <button onClick={() => setSent(false)}>ส่งอีก</button>
      </div>
    );
  }

  return (
    <div className={`feedback-form${compact ? ' is-compact' : ''}`}>
      <fieldset className="feedback-form-kind">
        <legend>ประเภท</legend>
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <label key={k} className="feedback-form-kind-radio">
            <input
              type="radio"
              name="feedback-kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            {KIND_LABELS[k]}
          </label>
        ))}
      </fieldset>

      <label className="feedback-form-field">
        <span>ข้อความ</span>
        <textarea
          rows={compact ? 4 : 6}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            kind === 'bug'
              ? 'อธิบายสิ่งที่เกิดขึ้น · ทำอะไรอยู่ก่อนหน้านั้น · เกิดที่หน้าไหน'
              : kind === 'feature'
                ? 'อยากให้มีฟีเจอร์อะไร · ใช้ตอนไหน · ทำไมจะดีขึ้น'
                : 'พิมพ์ข้อความตรงนี้…'
          }
        />
        <span className="feedback-form-counter">
          {message.length} / 4000
        </span>
      </label>

      <label className="feedback-form-field">
        <span>📩 ช่องทางตอบกลับ (ไม่บังคับ)</span>
        <input
          type="text"
          maxLength={200}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="อีเมล · LINE id · เบอร์โทร · หรือเว้นว่างถ้าไม่ต้องการให้ตอบ"
        />
      </label>

      <button
        className="feedback-form-submit"
        onClick={handleSubmit}
        disabled={busy || !message.trim()}
      >
        {busy ? '⏳ กำลังส่ง…' : '✉️ ส่งฟีดแบ็ก'}
      </button>

      <p className="feedback-form-foot">
        ส่งโดยไม่ระบุตัวตนก็ได้ · ถ้า cloud sync เปิดอยู่ ข้อความจะผูกกับ
        บัญชีของคุณเพื่อให้เราตอบกลับได้ · build: <code>{BUILD_SHA}</code>
      </p>
    </div>
  );
}
