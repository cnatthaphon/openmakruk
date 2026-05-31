# src/features/play/

Play-tab orchestration extracted from `src/App.tsx`. Issue #5 ("Split play orchestration out of App.tsx") tracks the full split; this directory holds the pieces that have already moved.

## What lives here today

| File | Purpose |
|---|---|
| `PlaySideInfo.tsx` | Sidebar lobby surface: challenge banner, quick-actions (draw / resign), DidYouKnow + TodayStrip lobby cards. |

## The split plan

Today `App.tsx` is one ~3.5 kloc file owning every concern of every tab. Issue #5's acceptance is to leave it as route-level composition only — sub-feature logic should move under `src/features/{feature}/`.

The split moves bottom-up — extract the most isolated, prop-stable pieces first, then iterate:

1. **PlaySideInfo** *(this PR)* — pure JSX, no useEffects, 5–10 stable props. Lowest risk.
2. **GameEndRecorder** — the `useEffect` that records vs-CPU stats + cloud-sync + async-challenge result on game completion. Self-contained, no JSX.
3. **ResumeFlow** — banner + handlers that restore the most recent unfinished game. Isolated localStorage + state.
4. **ReviewPanelHost** — sidebar branch that swaps the regular tabs for the post-game review widget. Lives near `ReviewTabbedPanel`.
5. **PlayPage** — the route-level composition that glues the above + the board. App.tsx becomes router glue only.

Each step is its own PR. Each must:

- preserve every existing e2e test
- pass the same lint / typecheck / build / e2e gates
- introduce no new state stores; existing localStorage shapes are stable
- include `screenshot diff` or e2e proof that the moved surface looks identical

## Rules for new code under `src/features/play/`

- No direct `engine.ts` calls — call through `useEngine()` or the same hooks App.tsx uses.
- No direct router writes — receive callbacks via props or wrap the existing `navigate()` helper.
- Components stay presentational where possible. State that has to live higher (e.g. `challenge`) gets passed via props until the consuming UI also moves down.
- Imports follow the same depth convention as the rest of the codebase: `from '../../lib/...'`, `from '../../components/...'`.

## What does NOT belong here

- Engine adapters (`src/lib/engines/`).
- Pure Makruk rules (`src/core/`).
- Cross-tab UI primitives (`src/components/`).

If a piece extracted from App.tsx turns out to be useful for another tab, promote it back to `src/components/` rather than leaving it in `features/play/`.
