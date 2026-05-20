// Parse UCI engine `info` lines into structured evaluation data.
//
// Fairy-Stockfish (and every Stockfish-derived engine) emits search
// progress as text lines like:
//
//   info depth 12 seldepth 18 multipv 1 score cp 35 nodes 25430 ...
//        time 412 pv e3e4 e6e5 d3d4 d6d5
//
// or with a forced mate:
//
//   info depth 8 seldepth 12 multipv 1 score mate 3 nodes ... pv ...
//
// We pluck out depth, multipv index, score (cp or mate), pv moves,
// and timing fields. The result feeds the EvalBar component and
// Multi-PV display.

export type EvalScore =
  | { type: 'cp'; cp: number }       // centipawns — positive = white advantage
  | { type: 'mate'; mate: number };  // mate in N — positive = white delivers it

export type EvalInfo = {
  depth: number;
  multipv: number;          // 1 = main line, 2/3 = alternates
  score: EvalScore;
  pv: string[];              // principal variation in UCI
  nodes?: number;
  nps?: number;
  timeMs?: number;
};

/**
 * Parse a single UCI info line. Returns null if the line is not a
 * usable evaluation (e.g. `info string ...` debug lines).
 */
export function parseEvalLine(line: string): EvalInfo | null {
  if (!line.startsWith('info ')) return null;
  if (line.includes('string')) return null;
  const tokens = line.trim().split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let score: EvalScore | null = null;
  let pv: string[] = [];
  let nodes: number | undefined;
  let nps: number | undefined;
  let timeMs: number | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case 'depth':
        depth = parseInt(tokens[++i], 10);
        break;
      case 'multipv':
        multipv = parseInt(tokens[++i], 10);
        break;
      case 'score': {
        const kind = tokens[++i];
        const value = parseInt(tokens[++i], 10);
        if (kind === 'cp') score = { type: 'cp', cp: value };
        else if (kind === 'mate') score = { type: 'mate', mate: value };
        break;
      }
      case 'nodes': nodes = parseInt(tokens[++i], 10); break;
      case 'nps':   nps   = parseInt(tokens[++i], 10); break;
      case 'time':  timeMs = parseInt(tokens[++i], 10); break;
      case 'pv':
        pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
    }
  }

  if (!score) return null;
  return { depth, multipv, score, pv, nodes, nps, timeMs };
}

/**
 * Squash an EvalScore into a [-1, 1] number for an EvalBar:
 *   +1 = white winning, -1 = black winning, 0 = equal.
 * Centipawn evals are squashed with a sigmoid so the bar saturates
 * gradually rather than running off the screen at ±10 pawns.
 */
export function scoreToBarValue(score: EvalScore): number {
  if (score.type === 'mate') {
    return score.mate > 0 ? 1 : -1;
  }
  // Sigmoid centred on 0, saturating around ±500 cp.
  const k = 0.004;
  return (2 / (1 + Math.exp(-k * score.cp))) - 1;
}

/**
 * Pretty-print a score for the user. "+0.35" / "-1.20" / "M3" / "M-2".
 */
export function formatScore(score: EvalScore): string {
  if (score.type === 'mate') {
    return score.mate > 0 ? `M${score.mate}` : `M${score.mate}`;
  }
  const pawns = score.cp / 100;
  const sign = pawns >= 0 ? '+' : '';
  return `${sign}${pawns.toFixed(2)}`;
}
