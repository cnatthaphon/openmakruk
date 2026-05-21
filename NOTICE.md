# NOTICE

OpenMakruk uses several open-source components. This file lists every
direct dependency that ships into the production build along with its
license, source URL, and how it's used. Runtime use is "unmodified,
loaded via npm or as a static asset" for every entry — OpenMakruk does
not statically link, fork, or modify any GPL-licensed code.

The user-facing About page (`/#/about` in the running app) shows the
same attribution to satisfy the CC BY-SA 4.0 visible-credit
requirement.

---

## Engine + rules (GPL-3.0)

### ffish-es6
- **Source:** https://github.com/ianfab/ffish-es6
- **npm:** https://www.npmjs.com/package/ffish-es6
- **Version:** ^0.7.9
- **License:** GPL-3.0
- **Use:** WebAssembly Fairy-Stockfish bindings for rules
  (legal-move generation, FEN parsing, isCheck, isGameOver, position
  push/pop). Used unmodified — loaded directly from `node_modules`
  via Vite import. `ffish.wasm` is copied to `/public/` by
  `scripts/copy-wasm.mjs` as a `postinstall` step.

### fairy-stockfish-nnue.wasm
- **Source:** https://github.com/fairy-stockfish/Fairy-Stockfish
- **npm:** https://www.npmjs.com/package/fairy-stockfish-nnue.wasm
- **Version:** ^1.1.11
- **License:** GPL-3.0
- **Use:** Full Fairy-Stockfish engine WASM build with UCI search,
  Skill Level configuration, and NNUE network support. Loaded at
  runtime as a regular `<script>` from `/public/engine/` (vendored
  by the postinstall step). Optimized for WASM SIMD where available.

## Board UI (GPL-3.0)

### chessground
- **Source:** https://github.com/lichess-org/chessground
- **npm:** https://www.npmjs.com/package/chessground
- **Version:** ^9.2.1
- **License:** GPL-3.0
- **Use:** Lichess's production board UI library — drag-and-drop,
  square highlighting, animation, premoves. Used unmodified via
  npm import. Custom Makruk piece artwork is applied via CSS
  `background-image` overrides on the `piece` elements chessground
  renders; the library is not patched.

## Piece artwork (CC BY-SA 4.0)

### Fulmene's Makruk pieces (default / active set)
- **Source:** https://github.com/Fulmene/makruk-pieces-image
- **Author:** Fulmene
- **License:** CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/
- **Use:** Turned-wood-style SVG pieces with linear gradients for
  highlight/shadow — the "3D" look that resembles physical Makruk
  sets. Drawn in Inkscape. Files were renamed to match chessground's
  chess role slots (king/queen/bishop/knight/rook/pawn × white/black).
  Originals plus the upstream LICENSE file live in
  `public/pieces/fulmene/`. The renamed copies in
  `public/pieces/makruk/` are unmodified beyond the rename.

### Yevrowl's Makruk silhouettes (optional alternate set)
- **Source:** https://commons.wikimedia.org/wiki/Category:Makruk_pieces
- **Author:** Yevrowl
- **License:** CC BY-SA 4.0
- **Use:** Flat-silhouette minimalist piece set, selectable from the
  Settings panel. Originals in `public/pieces/` at the top level,
  capitalised filenames (`Khun_white.svg`, `Met_white.svg`, …).
  Unmodified.

## NNUE network (CC BY-SA 4.0)

### Makruk NNUE — makruk-a8c621e24a8c
- **Source:** https://fairy-stockfish.github.io/nnue/
- **Author:** belzedar_
- **License:** CC BY-SA 4.0
- **Use:** Optional neural-network evaluation for Fairy-Stockfish
  Makruk variant. Provides roughly +248 Elo over classical eval.
  Distributed via jsDelivr CDN
  (`https://cdn.jsdelivr.net/gh/cnatthaphon/openmakruk@nnue-v1/nnue/makruk.nnue`)
  rather than bundled — the file is 46 MB and cached in the user's
  IndexedDB after first download.

## Framework + build (MIT / Apache 2.0)

### React + ReactDOM
- **Version:** ^18.3.1
- **License:** MIT
- **Author:** Meta and contributors

### TypeScript
- **Version:** ^5.5.3
- **License:** Apache 2.0
- **Author:** Microsoft

### Vite
- **Version:** ^5.4.1
- **License:** MIT
- **Author:** Evan You and contributors

### @vitejs/plugin-react
- **Version:** ^4.3.1
- **License:** MIT

### Type definitions (@types/react, @types/react-dom)
- **License:** MIT
- **DefinitelyTyped**

## Testing (devDep — NOT shipped to users)

### @playwright/test
- **Version:** ^1.60.0
- **License:** Apache 2.0
- **Author:** Microsoft
- **Use:** End-to-end test runner. Browser binaries (Chromium) cached
  in `~/.cache/ms-playwright/`. Tests live in `tests/e2e/`. Run via
  `npm run test:e2e`. NOT included in the production bundle —
  installation footprint exists only in `node_modules/` and the
  bundled `dist/` is untouched.

---

## License obligations summary

| Component | What we must do |
|-----------|-----------------|
| GPL-3.0 deps (chessground, ffish-es6, fairy-stockfish) | Used unmodified, loaded via npm — no GPL contamination of our own code. Attribution preserved in this NOTICE and the About page. Source of these components is freely available at the linked repositories. |
| CC BY-SA 4.0 assets (Fulmene, Yevrowl, NNUE network) | **Attribution visible to end users** — provided on `/#/about` in the running app and in this NOTICE. Anyone forking OpenMakruk + redistributing these assets must keep them under CC BY-SA 4.0 and continue to credit the original authors. |
| MIT / Apache 2.0 deps | License notices retained in `node_modules` per npm's standard practice. |

OpenMakruk's own source code (`src/`, `public/content/`, `scripts/`,
`tests/`, `index.html`, configuration files) is licensed under MIT —
see `LICENSE`.

---

## Changes from upstream

OpenMakruk does NOT fork or modify any of the GPL-3.0 components above.
The only "modification" to a third-party asset is the **rename** of
Fulmene's piece SVGs from their Thai-named originals (`khun_w.svg`)
to the chessground role-slot convention (`white_king.svg`) — file
contents are byte-identical. The upstream LICENSE file is preserved
verbatim alongside in `public/pieces/fulmene/LICENSE.txt`.
