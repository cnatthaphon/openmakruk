// Schemas for the "long tail" content types beyond lessons + puzzles.
//
// These are the content surfaces the platform plans to grow:
//   • openings        — common Makruk opening lines + theory
//   • endgames        — mate technique studies (K+R vs K, etc.)
//   • tactics-themes  — grouped tactic studies (fork families, pin
//                       families, mating-net patterns)
//   • annotations     — per-position commentary keyed by FEN, used
//                       to enrich the Library and Custom tabs with
//                       expert notes
//
// All four follow the same manifest-driven contract as lessons +
// puzzles: a JSON file under /content/<type>/all.json, version-keyed
// via the top-level manifest. Empty arrays in the file mean "no
// content yet" — UI shows a "🚧 coming soon" placeholder.

/** A named Makruk opening with the move sequence + an explanation. */
export type Opening = {
  id: string;
  name: string;
  /** UCI move sequence from the starting position. */
  moves: string[];
  /** Plain-Thai explanation, 1-3 sentences. */
  description: string;
  /** Themes for filtering: aggressive, positional, classical, etc. */
  themes: string[];
  /** Optional: rating range this opening is well-suited for. */
  ratingBand?: { min: number; max: number };
};

/** A K+X-K mate technique study. Same shape as a puzzle but with
 * an explicit "study" framing — the engine doesn't auto-grade,
 * the user watches the technique step-by-step instead. */
export type EndgameStudy = {
  id: string;
  title: string;
  /** Starting FEN. */
  fen: string;
  /** Forced sequence demonstrating the technique. */
  moves: string[];
  /** Per-ply commentary keyed by plyAfter (same shape as ReplayDemo). */
  commentary: { plyAfter: number; text: string }[];
  category: 'kr-vs-k' | 'km-vs-k' | 'kr-m-vs-k' | 'kn-vs-k' | 'other';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
};

/** A theme is a grouping of puzzles by tactical motif. Pages can
 * filter the main puzzle pool by these. */
export type TacticTheme = {
  id: string;
  name: string;
  description: string;
  /** Tag string that puzzles use for matching (e.g. "fork"). */
  matchTag: string;
  /** Example puzzle ids to show in the theme intro. */
  examplePuzzles: string[];
};

/** Free-form expert annotation keyed by FEN. Multiple annotations
 * for the same FEN are allowed; UI dedupes by id. */
export type Annotation = {
  id: string;
  fen: string;
  /** Short title shown above the explanation. */
  title: string;
  /** Long-form Thai prose — markdown not parsed in v1, paragraphs
   * are split on newline only. */
  text: string;
  /** Optional: who wrote this, for crediting. */
  author?: string;
};
