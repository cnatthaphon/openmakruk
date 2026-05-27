// Hash-based router.
//
// All app navigation uses URL hashes so the app can be served as a
// static SPA from any host without server rewrites. Routes:
//
//   #/play                          tab=play
//   #/play?fen=...&autoanalyze=1    tab=play with params
//   #/learn                         tab=learn (index)
//   #/learn/<lessonId>              tab=learn, open lessonId
//   #/puzzles                       tab=puzzles (index)
//   #/puzzles/<puzzleId>            tab=puzzles, open puzzleId
//   #/library                       tab=library (index)
//   #/library/<positionId>          tab=library, open positionId
//   #/custom, #/profile, #/settings, #/about — single-screen tabs
//
// Adding a new sub-route ("daily puzzle"): just add the tab id + an
// optional second segment. The router stays generic; each page is
// responsible for reading `route.id` and opening the matching item.
// This is the same plug-in story as the engine / content modules:
// deep links are pure JSON-shaped data, no caller code needs to
// change to support a new entity type as long as it lives under an
// existing tab.

import { useEffect, useState } from 'react';

export const TAB_IDS = [
  'play',
  'learn',
  'study',
  'puzzles',
  'custom',
  'library',
  'profile',
  'settings',
  'about',
  // Public cert page — not in the tab nav but a valid route id so
  // `/#/cert/<slug>` resolves cleanly.
  'cert',
  // Bot character detail — `/#/bots/<bot-id>`. Deep-linkable from Bot
  // Hall of Fame cards + sharable. Hidden from nav like cert.
  'bots',
  // Counting Trainer drill — `/#/counting` (level picker) or
  // `/#/counting/<level-id>` (active drill).
  'counting',
  // Puzzle Rush — `/#/rush`. Timed back-to-back puzzle solving.
  'rush',
  // Bot Exhibition — `/#/exhibition` (feed) or `/#/exhibition/<id>` (replay).
  'exhibition',
  // Move Trainer — `/#/movetrainer` (picker) or `/#/movetrainer/<openId>` (drill).
  'movetrainer',
  // Boss Rush — `/#/bossrush` (picker + active progress).
  'bossrush',
  // Pattern Recognition — `/#/pattern` (visualization drill).
  'pattern',
  // Survive the attack — `/#/survive` (defensive challenge).
  'survive',
  // Population stats — `/#/stats`. Total / online / region rollup.
  'stats',
  // Async challenge — `/#/challenge` (create) or `/#/challenge/<code>` (accept).
  'challenge',
] as const;

export type Tab = (typeof TAB_IDS)[number];

// Content tabs — hidden from top nav (no label) AND represent
// specific user-intent content (a puzzle, a bot, a drill). When a
// first-time visitor lands on one of these via a share link, the
// onboarding modal must NOT block them — they came here for a reason
// and the tutorial can wait. Adding a new content tab here = onboarding
// skip auto-syncs. Phase 21 refactor: previously a separate hard-coded
// Set in App.tsx that fell out of sync with each new route (Phase 17
// pattern + Phase 18 survive both missed the array).
export const CONTENT_TABS: ReadonlySet<Tab> = new Set<Tab>([
  'cert',
  'bots',
  'exhibition',
  'counting',
  'rush',
  'movetrainer',
  'bossrush',
  'pattern',
  'survive',
  'stats',
  'challenge',
]);

export type Route = {
  /** Top-level tab. Always present (falls back to 'play'). */
  tab: Tab;
  /** Optional sub-resource id — what's after `#/<tab>/`. */
  id: string | null;
  /** Parsed `?key=value` pairs after the path. */
  params: Record<string, string>;
};

const DEFAULT_ROUTE: Route = { tab: 'play', id: null, params: {} };

function isTab(s: string): s is Tab {
  return (TAB_IDS as readonly string[]).includes(s);
}

/** Resolve a path slug to a canonical Tab, accepting common variants
 *  someone might guess from the feature name:
 *    boss-rush  → bossrush
 *    move-trainer → movetrainer
 *    bossRush    → bossrush  (camelCase)
 *  Returns null if nothing matches — caller falls back to 'play'.
 *  Convention rationale: we ship the canonical single-word form
 *  (lowercase, no separator) but multi-word features are easier to
 *  type with a dash, so we accept both. */
function resolveTabAlias(raw: string): Tab | null {
  if (isTab(raw)) return raw;
  const noDash = raw.replace(/-/g, '').toLowerCase();
  if (isTab(noDash)) return noDash;
  return null;
}

/** Parse a hash string of the form `#/tab[/id][?k=v&...]` into a Route. */
export function parseRoute(hash: string): Route {
  if (!hash || !hash.startsWith('#/')) return { ...DEFAULT_ROUTE };
  // Strip leading "#/" and split off the query string first.
  const [pathPart, queryPart = ''] = hash.slice(2).split('?', 2);
  const segments = pathPart.split('/').filter(Boolean);
  const rawTab = segments[0] ?? 'play';
  const tab: Tab = resolveTabAlias(rawTab) ?? 'play';
  // Decode the id segment — buildHash encodes characters like ':' that
  // are valid in our id format but get %-escaped per URI spec. Without
  // this mirror-decode, ids like `bot:wanderer-rookie` round-trip as
  // `bot%3Awanderer-rookie` and downstream lookups 404. The try/catch
  // guards against malformed inputs (e.g. a hand-typed URL with a
  // stray %); decodeURIComponent throws on those and we'd rather pass
  // the literal through than crash the router.
  let id: string | null = segments[1] ?? null;
  if (id !== null) {
    try { id = decodeURIComponent(id); } catch { /* keep literal */ }
  }
  const params: Record<string, string> = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      if (!pair) continue;
      const [k, v = ''] = pair.split('=', 2);
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return { tab, id, params };
}

/** Build a hash string for the given route shape. */
export function buildHash(route: Partial<Route> & { tab: Tab }): string {
  const id = route.id ? `/${encodeURIComponent(route.id)}` : '';
  const params = route.params ?? {};
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `#/${route.tab}${id}${query ? `?${query}` : ''}`;
}

/** Imperative navigation. Triggers a hashchange so listeners react. */
export function navigate(route: Partial<Route> & { tab: Tab }): void {
  if (typeof window === 'undefined') return;
  const next = buildHash(route);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

/** React hook: subscribe to the current parsed route. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined'
      ? DEFAULT_ROUTE
      : parseRoute(window.location.hash),
  );
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
