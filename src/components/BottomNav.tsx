// Mobile bottom navigation. Visual audit Phase 9K-2 finding: the
// 9-tab header strip wraps to 4 rows on phone widths, eating
// ~180px of viewport before the user sees any content. Fix:
//   - Hide the top tab strip on mobile (CSS media query).
//   - Render a fixed-position bottom nav with 5 primary tabs +
//     "เพิ่มเติม" that opens a sheet with the rest.
//
// The desktop experience is unchanged — the bottom nav is hidden
// via the same media query.

import { useEffect, useRef, useState } from 'react';
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
  { id: 'ailab',      label: 'AI Lab',   icon: '🧪' },
  { id: 'settings',   label: 'ตั้งค่า',   icon: '⚙️' },
  { id: 'about',      label: 'เกี่ยวกับ', icon: 'ℹ️' },
];

export function BottomNav({ currentTab }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Keyboard a11y for the overflow menu: remember the trigger so focus
  // returns there on close, and move focus into the sheet on open.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes the sheet (standard menu behavior).
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  // Move focus into the sheet when it opens; restore it to the trigger
  // when it closes so keyboard users aren't dumped at the top of the
  // page. The `wasOpen` guard skips the initial mount (sheetOpen=false)
  // so we don't steal focus to the trigger on first paint.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (sheetOpen) firstItemRef.current?.focus();
    else if (wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = sheetOpen;
  }, [sheetOpen]);

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
          ref={triggerRef}
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
          <div className="bottom-nav-sheet" role="menu" aria-label="More navigation">
            {OVERFLOW.map((t, i) => (
              <button
                key={t.id}
                ref={i === 0 ? firstItemRef : undefined}
                role="menuitem"
                className={`bottom-nav-sheet-item ${currentTab === t.id ? 'is-active' : ''}`}
                aria-current={currentTab === t.id ? 'page' : undefined}
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
