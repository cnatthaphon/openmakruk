// Celebration overlay — full-screen cinematic moment triggered when
// the user crosses a meaningful threshold (rating tier, streak
// milestone). Stays on screen for ~3.5s OR until the user dismisses,
// then fades out.
//
// Why an overlay vs a toast: the goal here is to ACKNOWLEDGE, not
// inform. Toasts are noise — they pile up, they scroll, they don't
// stop the user. A modal-style overlay says "this is significant
// enough that I want you to notice it" — which is the whole point
// of marking the user's progress.
//
// Animation: simple CSS keyframes (no third-party lib). Confetti
// would require a runtime dep + canvas; the gold border-pulse +
// scale-in is enough for the moment.

import { useEffect } from 'react';
import { type CelebrationKind, markCelebrationSeen } from '../lib/celebrations';

const AUTO_DISMISS_MS = 3500;

type Props = {
  celebration: CelebrationKind | null;
  onDismiss: () => void;
};

export function CelebrationOverlay({ celebration, onDismiss }: Props) {
  // Auto-dismiss + mark-seen on mount of a new celebration.
  useEffect(() => {
    if (!celebration) return;
    markCelebrationSeen(celebration);
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [celebration, onDismiss]);

  if (!celebration) return null;

  const { title, subtitle, glyph, accentColor } = describe(celebration);

  return (
    <div
      className="celebration-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
      aria-describedby="celebration-subtitle"
      aria-live="polite"
    >
      <button
        className="celebration-card"
        type="button"
        onClick={onDismiss}
        style={{ borderColor: accentColor, boxShadow: `0 0 40px ${accentColor}66` }}
        aria-label={`${title} — กดเพื่อปิด`}
      >
        <div className="celebration-glyph" aria-hidden="true">{glyph}</div>
        <div id="celebration-title" className="celebration-title" style={{ color: accentColor }}>
          {title}
        </div>
        <div id="celebration-subtitle" className="celebration-subtitle">{subtitle}</div>
        <div className="celebration-dismiss-hint">กดที่ใดก็ได้เพื่อปิด</div>
      </button>
    </div>
  );
}

function describe(c: CelebrationKind): {
  title: string;
  subtitle: string;
  glyph: string;
  accentColor: string;
} {
  if (c.kind === 'tier') {
    return {
      title: `🎉 คุณเป็น ${c.tier.th} แล้ว!`,
      subtitle: c.tier.descTh,
      glyph: c.tier.icon ?? '👑',
      accentColor: c.tier.color,
    };
  }
  // streak
  const dayLabel = c.days === 100
    ? '💯 100 วันติด!'
    : c.days >= 30
      ? `🏆 ${c.days} วันติด!`
      : c.days >= 7
        ? `🔥 ${c.days} วันติด!`
        : `✨ ${c.days} วันติด`;
  return {
    title: dayLabel,
    subtitle: `เข้ามาเล่นต่อเนื่อง ${c.days} วันแล้ว · keep it up`,
    glyph: '🔥',
    accentColor: c.days >= 30 ? '#e85a4a' : c.days >= 7 ? '#d4a23c' : '#7aba7f',
  };
}
