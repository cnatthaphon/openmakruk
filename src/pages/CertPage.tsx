// Public certificate page. Anyone with the slug can view — no auth.
//
// Hash routing → /#/cert/<slug>. The slug carries the badge id +
// random bytes so it's unguessable but grep-able for production
// debugging (Phase 9H-3).

import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { getBackend } from '../lib/backend';
import type { CertView } from '../lib/backend';
import { findProvince } from '../lib/provinces';

type Props = {
  /** Route param — the shareable slug. */
  slug: string | null;
};

export function CertPage({ slug }: Props) {
  const [data, setData] = useState<CertView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const backend = getBackend();
    if (!backend.fetchCert) {
      setErr('cloud sync ปิดอยู่ — เปิดที่ Settings เพื่อโหลด cert');
      return;
    }
    let cancelled = false;
    backend.fetchCert(slug)
      .then((c) => {
        if (cancelled) return;
        if (!c) setErr('cert ไม่พบ · slug อาจถูกแก้ไขหรือลบ');
        else setData(c);
      })
      .catch((e: unknown) => !cancelled && setErr(String(e)));
    return () => { cancelled = true; };
  }, [slug]);

  if (!slug) {
    return (
      <Page variant="narrow" className="cert-page">
        <div className="cert-card">
          <p>ไม่มี slug · ใช้รูปแบบ <code>/#/cert/&lt;slug&gt;</code></p>
        </div>
      </Page>
    );
  }
  if (err) {
    return (
      <Page variant="narrow" className="cert-page">
        <div className="cert-card">
          <p>{err}</p>
        </div>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page variant="narrow" className="cert-page">
        <div className="cert-card">
          <p>กำลังโหลด…</p>
        </div>
      </Page>
    );
  }

  const province = findProvince(data.province);
  return (
    <Page variant="narrow" className="cert-page">
      <div className="cert-card">
        <div className="cert-icon-big" aria-hidden="true">{data.badge.icon}</div>
        <h2 className="cert-badge-name">{data.badge.nameTh}</h2>
        <span className={`cert-tier-tag tier-${data.badge.tier}`}>
          {data.badge.tier.toUpperCase()}
        </span>
        <p className="cert-desc">{data.badge.descTh}</p>
        <div className="cert-meta">
          <div>ปลดล็อกโดย</div>
          <div className="cert-name">{data.displayName}</div>
          {province && <div className="cert-province">📍 {province.nameTh}</div>}
          <div className="cert-date">
            🕐 {new Date(data.unlockedAt).toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>
        <a href="/#/play" className="cert-cta">▶ ลองเล่นเอง</a>
      </div>
    </Page>
  );
}
