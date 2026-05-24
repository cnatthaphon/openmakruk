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

type Step = 'welcome' | 'name' | 'opponent';

type Props = {
  /** Called after the user finishes or skips. Parent unmounts the
   *  modal in response (typically via a useState boolean). */
  onClose: () => void;
};

// Curated starting opponents for new users — narrower than the full
// catalog so we don't overwhelm. Sorted from gentlest → spicier so
// the natural reading order is also the difficulty ramp.
const STARTING_OPPONENTS: { engineId: string; label: string; emoji: string; desc: string }[] = [
  {
    engineId: 'random-bot',
    label: 'Random Bot',
    emoji: '🎲',
    desc: 'อ่อนสุด · เดินสุ่ม · เหมาะลองสนามครั้งแรก',
  },
  {
    engineId: personalityEngineId('wanderer'),
    label: 'นักเดิน',
    emoji: '🍃',
    desc: 'มีจุดยุทธวิธีนิดหน่อย · ระดับเริ่มต้น',
  },
  {
    engineId: personalityEngineId('cautious'),
    label: 'ระวังตัว',
    emoji: '🐢',
    desc: 'เน้นป้องกัน · เกมยาว · ลองฝึกบุก',
  },
  {
    engineId: personalityEngineId('positional'),
    label: 'ตามตำแหน่ง',
    emoji: '🧭',
    desc: 'รักษากลาง · ระดับ club beginner',
  },
];

export function OnboardingModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState(() => loadStats().displayName);
  const [engineId, setEngineId] = useState(STARTING_OPPONENTS[0].engineId);

  const finish = () => {
    const stats = loadStats();
    saveStats({ ...stats, displayName: name.trim() || stats.displayName });
    saveSettings({ ...loadSettings(), engineId });
    markOnboarded();
    navigate({ tab: 'play', id: null });
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

        {step === 'welcome' && (
          <>
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
              ระบบฝึก รวบรวมปริศนา ฝึกเปิดเกม จบเกม · เล่นกับ bot หลายสไตล์ · ฟรี ไม่มี backend ทุกอย่างเก็บใน browser ของคุณ
            </p>
            <div className="onboarding-buttons">
              <button className="primary" onClick={() => setStep('name')}>ต่อไป →</button>
            </div>
          </>
        )}

        {step === 'name' && (
          <>
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
              <button onClick={() => setStep('welcome')}>← ย้อนกลับ</button>
              <button className="primary" onClick={() => setStep('opponent')}>ต่อไป →</button>
            </div>
          </>
        )}

        {step === 'opponent' && (
          <>
            <h2>เลือกคู่ต่อสู้คนแรก</h2>
            <p>เริ่มจาก bot ที่ไม่แรงเกินไป · เปลี่ยนได้ทุกเมื่อใน Settings</p>
            <div className="onboarding-opponents">
              {STARTING_OPPONENTS.map((opp) => (
                <button
                  key={opp.engineId}
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
              <button onClick={() => setStep('name')}>← ย้อนกลับ</button>
              <button className="primary" onClick={finish}>เริ่มเล่น 🎮</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
