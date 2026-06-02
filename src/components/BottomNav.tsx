// Mobile bottom navigation. Visual audit Phase 9K-2 finding: the
// 9-tab header strip wraps to 4 rows on phone widths, eating
// ~180px of viewport before the user sees any content. Fix:
//   - Hide the top tab strip on mobile (CSS media query).
//   - Render a fixed-position bottom nav with 5 primary tabs +
//     "เพิ่มเติม" that opens a sheet with the rest.
//
// The desktop experience is unchanged — the bottom nav is hidden
// via the same media query.

import { useState } from 'react';
import { navigate, type Tab } from '../lib/router';

type Props = {
  currentTab: Tab;
};

const PRIMARY: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'play',    label: 'เล่น',     icon: '♔' },
  { id: 'puzzles', label: 'ปริศนา',   icon: '🧩' },
  { id: 'learn',   label: 'บทเรียน',  icon: '🎓' },
  { id: 'study',   label: 'ทฤษฎี',    icon: '📖' },
  { id: 'profile', label: 'โปรไฟล์',  icon: '👤' },
];

// Everything navigable that isn't a PRIMARY tab. Must stay in sync
// with the desktop NavBar's set (play/puzzles/learn/study/profile are
// reachable as primaries; the rest live here) — otherwise a surface
// the desktop nav exposes becomes unreachable on mobile. Issue #9
// audit: stats / challenge / exhibition were missing here, so mobile
// users had no way to reach them at all.
const OVERFLOW: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'custom',     label: 'ออกแบบ',   icon: '🎨' },
  { id: 'library',    label: 'คลัง',     icon: '📚' },
  { id: 'stats',      label: 'สถิติรวม', icon: '📊' },
  { id: 'challenge',  label: 'ท้าดวล',   icon: '⚔️' },
  { id: 'exhibition', label: 'โชว์บอท',  icon: '🎬' },
  { id: 'settings',   label: 'ตั้งค่า',   icon: '⚙️' },
  { id: 'about',      label: 'เกี่ยวกับ', icon: 'ℹ️' },
];

export function BottomNav({ currentTab }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const go = (id: Tab) => {
    navigate({ tab: id });
    setSheetOpen(false);
  };

  // If the user is on an overflow tab, highlight "เพิ่มเติม" so
  // they're not staring at a nav with no active item.
  const overflowActive = OVERFLOW.some((t) => t.id === currentTab);

  return (
    <>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {PRIMARY.map((t) => (
          <button
            key={t.id}
            className={`bottom-nav-tab ${currentTab === t.id ? 'is-active' : ''}`}
            onClick={() => go(t.id)}
            aria-current={currentTab === t.id ? 'page' : undefined}
          >
            <span className="bottom-nav-icon" aria-hidden="true">{t.icon}</span>
            <span className="bottom-nav-label">{t.label}</span>
          </button>
        ))}
        <button
          className={`bottom-nav-tab ${overflowActive || sheetOpen ? 'is-active' : ''}`}
          onClick={() => setSheetOpen((o) => !o)}
          aria-expanded={sheetOpen}
          aria-haspopup="menu"
        >
          <span className="bottom-nav-icon" aria-hidden="true">⋯</span>
          <span className="bottom-nav-label">เพิ่มเติม</span>
        </button>
      </nav>

      {sheetOpen && (
        <>
          <div
            className="bottom-nav-sheet-backdrop"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div className="bottom-nav-sheet" role="menu">
            {OVERFLOW.map((t) => (
              <button
                key={t.id}
                role="menuitem"
                className={`bottom-nav-sheet-item ${currentTab === t.id ? 'is-active' : ''}`}
                onClick={() => go(t.id)}
              >
                <span className="bottom-nav-sheet-icon">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
