// 🏆 Boss Rush page — picker + active-run progress for the
// personality-tier gauntlet. The actual matches happen on the Play
// tab via the existing Challenge-target mechanism; this page sets
// the first bot's challenge target and shows progress as each game
// completes.

import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { navigate } from '../lib/router';
import {
  TIER_LABELS,
  TIER_DESCRIPTIONS,
  loadActiveRush,
  loadRushProgress,
  rushSequence,
  startRush,
  abandonRush,
  type RushTier,
  type ActiveRush,
} from '../lib/bossRush';
import { PERSONALITIES } from '../lib/personalities/personalities';
import { setChallengeTarget } from '../lib/challenge';
import { loadSettings, saveSettings } from '../lib/settings';
import { getBackend } from '../lib/backend';
import type { BotCharacter } from '../lib/backend/types';

export function BossRushPage() {
  const [active, setActive] = useState<ActiveRush | null>(null);
  const [bots, setBots] = useState<BotCharacter[] | null>(null);

  useEffect(() => {
    setActive(loadActiveRush());
    const backend = getBackend();
    if (backend.fetchBots) {
      backend.fetchBots().then(setBots).catch(() => undefined);
    }
  }, []);

  const startTier = (tier: RushTier) => {
    const run = startRush(tier);
    const firstBotId = rushSequence(tier)[0];
    const firstBot = bots?.find((b) => b.id === firstBotId);
    if (!firstBot) return;
    setChallengeTarget({
      botId: firstBot.id,
      displayName: firstBot.displayName,
      avatar: firstBot.avatar,
      personality: firstBot.personality,
      tier: firstBot.tier,
      rating: firstBot.rating,
    });
    saveSettings({
      ...loadSettings(),
      engineId: `personality:${firstBot.personality}`,
    });
    setActive(run);
    navigate({ tab: 'play' });
  };

  const cancelRun = () => {
    abandonRush('cancel');
    setActive(null);
  };

  return (
    <Page variant="medium" className="rush-mode-page">
      <button className="rush-mode-back" onClick={() => navigate({ tab: 'profile' })}>
        ← กลับโปรไฟล์
      </button>
      <header className="rush-mode-header">
        <h2>🏆 Boss Rush</h2>
        <p className="label-aside">
          ผ่าน 7 บอตของ tier เดียวกันติดต่อกัน · แพ้หรือเสมอครั้งเดียว = จบรอบ
        </p>
      </header>

      {active && (
        <ActiveRushPanel
          active={active}
          bots={bots}
          onCancel={cancelRun}
          onResume={() => navigate({ tab: 'play' })}
        />
      )}

      <h3 className="rush-mode-subheader">
        {active ? 'หรือเริ่มรอบใหม่' : 'เลือก tier'}
      </h3>
      <div className="rush-mode-tiers">
        {(['rookie', 'veteran', 'master'] as const).map((tier) => (
          <TierCard key={tier} tier={tier} onStart={startTier} />
        ))}
      </div>
    </Page>
  );
}

function TierCard({ tier, onStart }: { tier: RushTier; onStart: (t: RushTier) => void }) {
  const progress = loadRushProgress();
  const best = progress.bestByTier[tier];
  return (
    <button className="rush-mode-tier-card" onClick={() => onStart(tier)}>
      <div className="rush-mode-tier-head">
        <strong>{TIER_LABELS[tier]}</strong>
        {best && (
          <span className="rush-mode-tier-best">
            ดีที่สุด: {best.beatenCount}/{PERSONALITIES.length}
            {best.beatenCount === PERSONALITIES.length && ' ⭐'}
          </span>
        )}
      </div>
      <p className="rush-mode-tier-desc">{TIER_DESCRIPTIONS[tier]}</p>
      <div className="label-aside">
        ลำดับ: {PERSONALITIES.map((p) => p.emoji).join(' → ')}
      </div>
    </button>
  );
}

function ActiveRushPanel({
  active,
  bots,
  onCancel,
  onResume,
}: {
  active: ActiveRush;
  bots: BotCharacter[] | null;
  onCancel: () => void;
  onResume: () => void;
}) {
  const sequence = rushSequence(active.tier);
  const currentBotId = sequence[active.index];
  const currentBot = bots?.find((b) => b.id === currentBotId);
  return (
    <section className="rush-mode-active">
      <div className="rush-mode-active-head">
        <strong>กำลังเล่น: {TIER_LABELS[active.tier]}</strong>
        <span className="label-aside">
          ผ่าน {active.index} / {PERSONALITIES.length}
        </span>
      </div>
      <div className="rush-mode-active-current">
        ตอนนี้: {currentBot ? `${currentBot.avatar} ${currentBot.displayName}` : currentBotId}
      </div>
      <div className="rush-mode-active-actions">
        <button className="rush-mode-resume" onClick={onResume}>
          ▶ ไปสู้ต่อ
        </button>
        <button className="rush-mode-cancel" onClick={onCancel}>
          ✕ ยกเลิกรอบ
        </button>
      </div>
    </section>
  );
}
