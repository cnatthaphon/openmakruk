# Makruk NNUE network

`makruk.nnue` is the Fairy-Stockfish NNUE network for the Makruk variant,
identical to the official release `makruk-a8c621e24a8c.nnue` published
at https://fairy-stockfish.github.io/nnue/.

- **Network:** `makruk-a8c621e24a8c.nnue`
- **Author:** belzedar_ (community), published 2022-09-19
- **Strength:** ~+248 Elo over Fairy-Stockfish's classical Makruk evaluation
- **Size:** ~46 MB raw, ~24 MB gzipped on the wire
- **Trained with:** [ianfab/variant-nnue-pytorch](https://github.com/ianfab/variant-nnue-pytorch)

## Why it lives here (not in `public/`)

Cloudflare Pages enforces a 25 MB per-file limit. Putting the NNUE in
`public/` would either break the Pages deploy or force us to gzip-tweak
right at the boundary. Instead the file sits at the repo root in `nnue/`
and the browser fetches it via **jsDelivr** at runtime:

```
https://cdn.jsdelivr.net/gh/cnatthaphon/openmakruk@<tag>/nnue/makruk.nnue
```

jsDelivr caches aggressively at the tag/commit boundary, serves CORS
headers (so `fetch()` from the browser works), and is free.

On the client we cache the downloaded blob in IndexedDB so the second
page load is instant — no re-fetch even after a year offline.

## How to update

1. Replace `makruk.nnue` with a new network from the official downloads
   page or the Fairy-Stockfish-NNUE GitHub releases.
2. Commit + tag (`git tag nnue-vN; git push --tags`).
3. Bump the tag in `src/lib/engine.ts` `NNUE_URL` so the client switches
   to the new build (forces re-download for everyone).

## License

The network weights are CC BY-SA 4.0 by belzedar_, distributed by the
Fairy-Stockfish project. OpenMakruk redistributes the file unmodified
under the same license — see [the NNUE page](https://fairy-stockfish.github.io/nnue/)
for the original.
