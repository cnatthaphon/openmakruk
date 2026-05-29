// "💡 รู้หรือไม่?" card — surfaces one hidden feature per visit.
//
// Sits below TodayStrip on the Play tab. Renders nothing when every
// feature has been dismissed or visited (the user has seen them all).
//
// Why a card not a chip: each entry needs a one-line body + two
// actions (try + dismiss). A chip can't fit that without looking
// crammed; a card has the room and visually signals "this is a tip,
// not a daily task" so it doesn't compete with TodayStrip for
// attention.

import { useEffect, useState } from 'react';
import { navigate } from '../lib/router';
import {
  markFeatureVisited,
  pickFeature,
  permanentDismissFeature,
  softDismissFeature,
  type DiscoverableFeature,
} from '../lib/discoverableFeatures';

export function DidYouKnowCard() {
  const [feature, setFeature] = useState<DiscoverableFeature | null>(() =>
    pickFeature(),
  );

  // Re-pick on tab refocus — if the user came back the next day, an
  // expired soft-dismissal may now be eligible.
  useEffect(() => {
    const onFocus = () => setFeature(pickFeature());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (!feature) return null;

  const handleTry = () => {
    markFeatureVisited(feature.id);
    navigate({
      tab: feature.tab,
      id: feature.id_segment ?? null,
    });
  };

  const handleSoftDismiss = () => {
    softDismissFeature(feature.id);
    setFeature(pickFeature());
  };

  const handleHardDismiss = () => {
    permanentDismissFeature(feature.id);
    setFeature(pickFeature());
  };

  return (
    <aside
      className="dyk-card"
      aria-labelledby={`dyk-title-${feature.id}`}
    >
      <div className="dyk-header">
        <span className="dyk-prefix" aria-hidden="true">💡</span>
        <span className="dyk-tag">รู้หรือไม่?</span>
      </div>
      <div className="dyk-body">
        <div className="dyk-icon" aria-hidden="true">{feature.icon}</div>
        <div className="dyk-text">
          <div className="dyk-title" id={`dyk-title-${feature.id}`}>
            {feature.title}
          </div>
          <div className="dyk-subtitle">{feature.body}</div>
        </div>
      </div>
      <div className="dyk-actions">
        <button
          type="button"
          className="dyk-action dyk-action-primary"
          onClick={handleTry}
        >
          {feature.ctaLabel}
        </button>
        <button
          type="button"
          className="dyk-action dyk-action-secondary"
          onClick={handleSoftDismiss}
          title="ดูอันถัดไปวันพรุ่งนี้"
        >
          ✕ พรุ่งนี้
        </button>
        <button
          type="button"
          className="dyk-action dyk-action-tertiary"
          onClick={handleHardDismiss}
          title="ไม่สนใจฟีเจอร์นี้ — จะไม่แสดงอีก"
        >
          ⊘ ไม่สนใจ
        </button>
      </div>
    </aside>
  );
}
