// First-time welcome flow.
//
// Three short steps:
//   1. Welcome + 30-second intro to what Makruk is.
//   2. Pick a display name (default: ผู้เล่น).
//   3. Pick a starting opponent — Random Bot (gentlest), Wanderer, or
//      Defender for the user who wants something slightly trickier.
//
// On finish: save name + engineId to stores, set the onboarded flag,
// and route the user to /#/play so they can start a game immediately
// without having to hunt through tabs.
//
// Renders as a modal overlay — only mounted when !hasOnboarded(). The
// modal blocks page interaction by being position: fixed with a
// backdrop. Users can dismiss with the Skip button at any step.

import { useState } from 'react';
import { loadStats, saveStats } from '../lib/stats';
import { loadSettings, saveSettings } from '../lib/settings';
import { markOnboarded } from '../lib/onboarding';
import { navigate } from '../lib/router';
import { PERSONALITIES } from '../lib/personalities/personalities';
import { personalityEngineId } from '../lib/personalities/scoredBot';
import { PROVINCES_BY_REGION, REGION_LABELS_TH, type Region } from '../lib/provinces';
import { loadSession, saveSession } from '../lib/backend/cloudSession';

type Step = 'welcome' | 'name' | 'region' | 'opponent';

type Props = {
  /** Called after the user finishes or skips. Parent unmounts the
   *  modal in response (typically via a useState boolean). */
  onClose: () => void;
};

// Curated starting opponents for new users — narrower than the full
// catalog so we don't overwhelm. Sorted from gentlest → spicier so
// the natural reading order is also the difficulty ramp.
// First-opponent picks — gentlest personality first. Random Bot is
// gone entirely (it masked engine-load bugs by happily playing
// garbage); the user picks a real character from move 1.
const STARTING_OPPONENTS: { engineId: string; label: string; emoji: string; desc: string }[] = [
  {
    engineId: personalityEngineId('wanderer'),
    label: 'นักเดิน',
    emoji: '🍃',
    desc: 'เดินสับสน บางทีฉลาดเกินคาด · ระดับเริ่มต้น (~700 Elo)',
  },
  {
    engineId: personalityEngineId('cautious'),
    label: 'ระวังตัว',
    emoji: '🐢',
    desc: 'เน้นป้องกัน · เกมยาว · ลองฝึกบุก (~900 Elo)',
  },
  {
    engineId: personalityEngineId('defender'),
    label: 'นักรับ',
    emoji: '🛡️',
    desc: 'รักษาตัวรวมหมู่ · ไม่ค่อยบุก (~950 Elo)',
  },
  {
    engineId: personalityEngineId('positional'),
    label: 'ตามตำแหน่ง',
    emoji: '🧭',
    desc: 'รักษากลาง · ระดับ club beginner (~1000 Elo)',
  },
];

export function OnboardingModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState(() => loadStats().displayName);
  const [engineId, setEngineId] = useState(STARTING_OPPONENTS[0].engineId);
  // Province choice is optional — user can skip. We stash it in the
  // cloud session store so when they later enable cloud sync, the
  // value carries over without re-asking.
  const [province, setProvince] = useState<string | null>(() => loadSession().province);

  const finish = () => {
    const stats = loadStats();
    saveStats({ ...stats, displayName: name.trim() || stats.displayName });
    saveSettings({ ...loadSettings(), engineId });
    if (province !== loadSession().province) {
      const sess = loadSession();
      saveSession({ ...sess, province });
    }
    markOnboarded();
    // First-task heuristic: drop the new user into a mate-in-1 puzzle
    // instead of an empty play board. Solving one easy puzzle in the
    // first 60 seconds is a much sharper success moment than staring
    // at an unfamiliar start position. The puzzles tab itself surfaces
    // the daily puzzle prominently so they'll see it.
    navigate({ tab: 'puzzles', id: null });
    onClose();
  };

  const skip = () => {
    markOnboarded();
    onClose();
  };

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true">
      <div className="onboarding-modal">
        <button
          className="onboarding-skip"
          onClick={skip}
          title="ข้ามไปก่อนได้ · ไปที่ Settings ตอนหลังเพื่อเปลี่ยน"
        >
          ข้าม ✕
        </button>

        {/* Wrap each step in a <form> so Enter from the focused input/
            select submits the step (browser default behavior for a
            form with a single submit button). Without this, pressing
            Enter after typing a name does nothing — the user has to
            click "ต่อไป →" with the mouse, which feels broken. */}
        {step === 'welcome' && (
          <form onSubmit={(e) => { e.preventDefault(); setStep('name'); }}>
            <h2>ยินดีต้อนรับสู่ OpenMakruk</h2>
            <p>
              นี่คือแพลตฟอร์มสำหรับ <strong>หมากรุกไทย (Makruk)</strong> — เกมหมากรุกพื้นบ้านของไทยที่มีเอกลักษณ์เฉพาะตัว ต่างจากหมากรุกสากล:
            </p>
            <ul className="onboarding-bullets">
              <li>🎯 <strong>เม็ด</strong> เดินเฉียง 1 ช่อง (ไม่ใช่ Queen)</li>
              <li>🐘 <strong>โคน</strong> เดินเฉียง 4 ทิศ + ตรงไป 1 ช่อง</li>
              <li>👑 จบเกมด้วยรุกฆาตหรือ <strong>การนับ</strong> (counting)</li>
            </ul>
            <p className="onboarding-meta">
              ระบบฝึก รวบรวมปริศนา ฝึกเปิดเกม จบเกม · เล่นกับ bot หลายสไตล์ · ฟรีทั้งหมด · เล่นออฟไลน์ได้ทุกฟีเจอร์ · เปิด ☁️ cloud sync ใน Settings ถ้าอยากเทียบคะแนนกับคนอื่น (anonymous · ไม่ต้องสมัคร)
            </p>
            <div className="onboarding-buttons">
              <button type="submit" className="primary">ต่อไป →</button>
            </div>
          </form>
        )}

        {step === 'name' && (
          <form onSubmit={(e) => { e.preventDefault(); setStep('region'); }}>
            <h2>เรียกคุณว่าอะไรดี</h2>
            <p>ชื่อจะแสดงในประวัติเกม · เปลี่ยนได้ใน Profile</p>
            <input
              className="onboarding-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoFocus
              placeholder="ผู้เล่น"
            />
            <div className="onboarding-buttons">
              <button type="button" onClick={() => setStep('welcome')}>← ย้อนกลับ</button>
              <button type="submit" className="primary">ต่อไป →</button>
            </div>
          </form>
        )}

        {step === 'region' && (
          <form onSubmit={(e) => { e.preventDefault(); setStep('opponent'); }}>
            <h2>คุณอยู่จังหวัดไหน</h2>
            <p>
              เพื่อจัด leaderboard ต่อจังหวัด / ต่อภูมิภาค · ใช้แข่งกัน "กทม. vs เชียงใหม่"
              · <strong>ไม่บังคับ</strong> · ข้ามได้ · เปลี่ยนใน Settings ภายหลัง
            </p>
            <select
              className="onboarding-name-input"
              value={province ?? ''}
              onChange={(e) => setProvince(e.target.value || null)}
              autoFocus
            >
              <option value="">— ไม่ระบุจังหวัด —</option>
              {(Object.keys(REGION_LABELS_TH) as Region[]).map((r) => (
                <optgroup key={r} label={REGION_LABELS_TH[r]}>
                  {PROVINCES_BY_REGION[r].map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.nameTh}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="onboarding-meta">
              👁️ ใช้แสดงในผลแข่งเท่านั้น · ไม่ใช่ข้อมูลส่วนตัว · ไม่ติด IP geolocation
            </p>
            <div className="onboarding-buttons">
              <button type="button" onClick={() => setStep('name')}>← ย้อนกลับ</button>
              <button type="submit" className="primary">ต่อไป →</button>
            </div>
          </form>
        )}

        {step === 'opponent' && (
          <form onSubmit={(e) => { e.preventDefault(); finish(); }}>
            <h2>เลือกคู่ต่อสู้คนแรก</h2>
            <p>เริ่มจาก bot ที่ไม่แรงเกินไป · เปลี่ยนได้ทุกเมื่อใน Settings</p>
            <div className="onboarding-opponents">
              {STARTING_OPPONENTS.map((opp) => (
                <button
                  key={opp.engineId}
                  type="button"
                  className={`onboarding-opponent ${engineId === opp.engineId ? 'selected' : ''}`}
                  onClick={() => setEngineId(opp.engineId)}
                >
                  <div className="onboarding-opponent-emoji">{opp.emoji}</div>
                  <div className="onboarding-opponent-body">
                    <strong>{opp.label}</strong>
                    <div className="onboarding-opponent-desc">{opp.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <p className="onboarding-meta">
              อยากท้าทายมากขึ้น? ดู personality bots ทั้งหมด ({PERSONALITIES.length} สไตล์) ใน Settings → Engine
            </p>
            <div className="onboarding-buttons">
              <button type="button" onClick={() => setStep('region')}>← ย้อนกลับ</button>
              <button type="submit" className="primary">เริ่มเล่น 🎮</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
