// Top navigation bar — primary tabs + grouped dropdowns.
//
// Before (Phase 28): 9 flat tabs across the top — Play, บทเรียน,
// ทฤษฎี, ปริศนา, ออกแบบ, คลัง, โปรไฟล์, ตั้งค่า, เกี่ยวกับ. On
// narrower viewports they wrapped to 2-3 rows and looked cluttered.
// User feedback (Phase 29): 'tab ด้านบนเกะกะ', compared unfavourably
// to lichess.org's 5-primary + dropdowns layout.
//
// After: 4 primary tabs + a "More" dropdown.
//   • เล่น                — direct route
//   • เรียน ↓             — บทเรียน · ทฤษฎี · ปริศนา (the three learn surfaces)
//   • เครื่องมือ ↓        — ออกแบบ · คลัง (board composer + saved positions)
//   • โปรไฟล์             — direct route
//   • ⋯ More ↓            — ตั้งค่า · เกี่ยวกับ · Stats · Challenge · Exhibition
//
// Dropdowns open on click (NOT hover — hover menus are inaccessible
// for keyboard + touch users). Click outside or Escape closes them.
// Each dropdown item routes to its existing hash route, so every
// pre-existing deep link still works without redirect.

import { useEffect, useRef, useState } from 'react';
import { navigate, type Tab } from '../lib/router';

type NavItem = {
  tab: Tab;
  label: string;
  /** Optional badge text — e.g. "NEW" for recently shipped surfaces. */
  badge?: string;
};

type NavEntry =
  | { kind: 'tab'; item: NavItem }
  | { kind: 'group'; label: string; items: NavItem[] };

// Single source of truth for the menu layout. Re-order or rename here
// and the rest of the navbar (mobile bottom bar reads its own subset)
// follows.
const NAV: NavEntry[] = [
  { kind: 'tab', item: { tab: 'play', label: '♔ เล่น' } },
  {
    kind: 'group',
    label: '🎓 เรียน',
    items: [
      { tab: 'learn',   label: '🎓 บทเรียน' },
      { tab: 'study',   label: '📖 ทฤษฎี' },
      { tab: 'puzzles', label: '🧩 ปริศนา' },
    ],
  },
  {
    kind: 'group',
    label: '🛠 เครื่องมือ',
    items: [
      { tab: 'custom',  label: '🎨 ออกแบบกระดาน' },
      { tab: 'library', label: '📚 คลังตำแหน่ง' },
    ],
  },
  { kind: 'tab', item: { tab: 'profile', label: '👤 โปรไฟล์' } },
  {
    kind: 'group',
    label: '⋯ เพิ่มเติม',
    items: [
      { tab: 'stats',     label: '📊 Stats สาธารณะ' },
      { tab: 'challenge', label: '⚔️ Async Challenge' },
      { tab: 'exhibition', label: '🎬 Bot Exhibition' },
      { tab: 'settings',  label: '⚙️ ตั้งค่า' },
      { tab: 'about',     label: 'ℹ️ เกี่ยวกับ' },
    ],
  },
];

type Props = {
  currentTab: Tab;
};

export function NavBar({ currentTab }: Props) {
  // `openGroup` tracks which dropdown index is open (null = none).
  // Single-open semantics: opening one closes any other.
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside + Escape. Keeps the dropdown from sticking
  // open after the user navigates away via keyboard or tap-elsewhere.
  useEffect(() => {
    if (openGroup === null) return;
    const onDocClick = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenGroup(null);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openGroup]);

  const handleTabClick = (tab: Tab) => {
    setOpenGroup(null);
    navigate({ tab });
  };

  return (
    <nav className="nav-bar" aria-label="หน้าหลัก" ref={navRef}>
      {NAV.map((entry, idx) => {
        if (entry.kind === 'tab') {
          const isActive = currentTab === entry.item.tab;
          return (
            <button
              key={entry.item.tab}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              className={`nav-tab${isActive ? ' is-active' : ''}`}
              onClick={() => handleTabClick(entry.item.tab)}
            >
              {entry.item.label}
            </button>
          );
        }
        // Group dropdown
        const isOpen = openGroup === idx;
        const childActive = entry.items.some((i) => i.tab === currentTab);
        // Show the active child label inline so users see WHICH item
        // is current even before opening the dropdown — e.g.
        // "🎓 เรียน · บทเรียน".
        const activeChild = entry.items.find((i) => i.tab === currentTab);
        return (
          <div key={entry.label} className="nav-group">
            <button
              className={`nav-tab nav-group-trigger${childActive ? ' has-active' : ''}${isOpen ? ' is-open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => setOpenGroup(isOpen ? null : idx)}
            >
              {activeChild ? (
                <>
                  <span className="nav-group-label">{entry.label}</span>
                  <span className="nav-group-active-child">· {activeChild.label.replace(/^[^\s]+\s/, '')}</span>
                </>
              ) : (
                entry.label
              )}
              <span className="nav-group-caret" aria-hidden="true">▾</span>
            </button>
            {isOpen && (
              <div className="nav-dropdown" role="menu">
                {entry.items.map((it) => (
                  <button
                    key={it.tab}
                    role="menuitem"
                    className={`nav-dropdown-item${currentTab === it.tab ? ' is-active' : ''}`}
                    onClick={() => handleTabClick(it.tab)}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
