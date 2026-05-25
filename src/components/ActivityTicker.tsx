// Thin under-header strip that surfaces honest engagement signals
// to every visitor (Phase 9I).
//
// Strategy goal — "no fake online users, no seed bots; instead show
// real activity that proves the platform is alive." Numbers come
// from the public /api/signals endpoint (no auth required) so even
// a first-time anonymous visitor sees the world.
//
// Polls every 60s — cheap (one D1 read), low priority. Failure is
// silent: the strip just stays empty rather than showing an error
// (the rest of the page works fine).

import { useEffect, useState } from 'react';
import { getBackend } from '../lib/backend';
import type { ActivitySignals } from '../lib/backend';

const POLL_MS = 60_000;

export function ActivityTicker() {
  const [data, setData] = useState<ActivitySignals | null>(null);

  useEffect(() => {
    const backend = getBackend();
    if (!backend.fetchSignals) return;
    let cancelled = false;

    const tick = () => {
      backend.fetchSignals!()
        .then((s) => { if (!cancelled) setData(s); })
        .catch(() => undefined);
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data) return null;
  // Only render if there's something interesting to report — empty
  // strip below the header is worse than nothing.
  if (data.gamesToday === 0 && data.puzzlesToday === 0 && !data.lastGame && !data.lastPuzzle) {
    return null;
  }

  return (
    <div className="activity-ticker" role="status" aria-live="off">
      {data.gamesToday > 0 && (
        <span className="activity-ticker-item">
          🎮 {data.gamesToday} เกมวันนี้
        </span>
      )}
      {data.puzzlesToday > 0 && (
        <span className="activity-ticker-item">
          🧩 {data.puzzlesToday} ปริศนาแก้แล้ว
        </span>
      )}
      {data.lastGame && (
        <span className="activity-ticker-item">
          ⏱️ {data.lastGame.displayName} เพิ่งเล่นจบ · {timeAgo(data.lastGame.at)}
        </span>
      )}
    </div>
  );
}

function timeAgo(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60_000);
  if (mins < 1) return 'เมื่อกี้นี้';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(at).toLocaleDateString('th-TH');
}
