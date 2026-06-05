// MCTS baseline — third rung of the AI Lab ladder. Classic UCT
// Monte-Carlo Tree Search with random rollouts, capped by a material
// eval. No neural net (that's the AlphaZero rung above); the policy is
// "uniform random" and the value is "random playout + material at the
// cap". Stronger than the random floor, weaker + slower than
// Fairy-Stockfish — exactly the middle rung the Lab wants to show.
//
// Exercises the MCTS-specific SearchOpts the contract reserved:
//   • nodes       — simulation budget (default 400)
//   • temperature — 0 = pick the most-visited move (argmax); >0 =
//                   softmax-sample over visit counts (variety)
//   • seed        — ALL randomness (rollouts, sampling) runs through
//                   one seeded stream, so seed + position + budget →
//                   identical move (challenge / leaderboard determinism)
//
// Registers research:true (grouped under 🧪 AI Lab), after
// Fairy-Stockfish (default unchanged). Never feeds analysis.
//
// Readability over speed: each node holds its FEN and we spin up a
// throwaway ffish board per rollout. Fine for a Lab baseline at a few
// hundred sims; a perf pass (single board + push/pop) is a later
// concern, not the point here.

import { loadFfish } from '../makruk';
import { rngFromSeed } from '../seededRng';
import { staticEval } from './baselineEval';
import { registerEngine } from './registry';
import {
  DEFAULT_DIFFICULTY_PRESETS,
  type EngineCapabilities,
  type MakrukEngine,
  type SearchOpts,
  type SearchResult,
} from './types';

const DEFAULT_NODES = 400;
const ROLLOUT_CAP = 24; // plies before we cut a playout and eval material
const UCB_C = 1.41; // ~sqrt(2)
/** Squash a white-POV material score into [-1, 1] for backprop. */
const SQUASH = 600;

type FfishBoard = {
  legalMoves: () => string;
  push: (uci: string) => boolean;
  fen: () => string;
  isGameOver: (countRules?: boolean) => boolean;
  result: (countRules?: boolean) => string;
  delete: () => void;
};
type Ffish = { Board: new (variant: string, fen: string) => FfishBoard };

type Node = {
  fen: string;
  /** Move (UCI) that led from the parent to this node; null at root. */
  move: string | null;
  parent: Node | null;
  children: Node[];
  /** Legal moves not yet expanded into children. */
  untried: string[];
  visits: number;
  /** Total value from the POV of the side TO MOVE at this node's parent
   *  (i.e. the player who chose `move`). Negamax-style. */
  value: number;
  /** Side to move at this node ('w' | 'b'). */
  turn: string;
  terminal: boolean;
  /** If terminal, the value from this node's side-to-move POV
   *  (−1 = mated, 0 = draw). Undefined for non-terminal nodes. */
  terminalVal?: number;
};

function legalOf(ffish: Ffish, fen: string): string[] {
  const b = new ffish.Board('makruk', fen);
  try {
    return b.legalMoves().split(' ').filter(Boolean);
  } finally {
    b.delete();
  }
}

function makeNode(ffish: Ffish, fen: string, move: string | null, parent: Node | null): Node {
  const b = new ffish.Board('makruk', fen);
  let terminal = false;
  let untried: string[] = [];
  let terminalVal: number | undefined;
  try {
    if (b.isGameOver(true)) {
      terminal = true;
      // result() is white-POV. In a finished game the side to move is
      // the one with no move (mated) → loss from their POV; draws → 0.
      terminalVal = b.result(true) === '1/2-1/2' ? 0 : -1;
    } else {
      untried = b.legalMoves().split(' ').filter(Boolean);
    }
  } finally {
    b.delete();
  }
  return {
    fen,
    move,
    parent,
    children: [],
    untried,
    visits: 0,
    value: 0,
    turn: fen.split(' ')[1] ?? 'w',
    terminal,
    terminalVal,
  };
}

/** Apply a UCI move to a FEN, returning the resulting FEN (or null if
 *  illegal). */
function applyMove(ffish: Ffish, fen: string, uci: string): string | null {
  const b = new ffish.Board('makruk', fen);
  try {
    if (!b.push(uci)) return null;
    return b.fen();
  } finally {
    b.delete();
  }
}

/** UCB1 child selection from the parent's POV. */
function selectChild(node: Node): Node {
  let best: Node | null = null;
  let bestScore = -Infinity;
  for (const c of node.children) {
    // c.value is from the POV of the player who chose c (= node's mover),
    // so exploitation is just c.value / c.visits.
    const exploit = c.value / c.visits;
    const explore = UCB_C * Math.sqrt(Math.log(node.visits) / c.visits);
    const ucb = exploit + explore;
    if (ucb > bestScore) {
      bestScore = ucb;
      best = c;
    }
  }
  return best ?? node.children[0];
}

/** Random playout from `fen` to terminal or the ply cap, returning a
 *  value in [-1, 1] from the POV of the side TO MOVE at `fen`. */
function rollout(ffish: Ffish, fen: string, rng: () => number): number {
  const startTurn = fen.split(' ')[1] ?? 'w';
  const board = new ffish.Board('makruk', fen);
  try {
    let plies = 0;
    while (plies < ROLLOUT_CAP) {
      if (board.isGameOver(true)) break;
      const moves = board.legalMoves().split(' ').filter(Boolean);
      if (moves.length === 0) break;
      board.push(moves[Math.floor(rng() * moves.length)]);
      plies++;
    }
    let whitePov: number;
    if (board.isGameOver(true)) {
      const res = board.result(true);
      whitePov = res === '1-0' ? 1 : res === '0-1' ? -1 : 0;
    } else {
      // Cut short — judge by material, squashed to [-1, 1].
      whitePov = Math.tanh(staticEval(board.fen()) / SQUASH);
    }
    // Convert white-POV → POV of the side to move at `fen`.
    return startTurn === 'w' ? whitePov : -whitePov;
  } finally {
    board.delete();
  }
}

function runMcts(ffish: Ffish, rootFen: string, budget: number, rng: () => number): Node {
  const root = makeNode(ffish, rootFen, null, null);
  for (let i = 0; i < budget; i++) {
    // ── 1. Selection ──────────────────────────────────────────────
    let node = root;
    while (node.untried.length === 0 && node.children.length > 0 && !node.terminal) {
      node = selectChild(node);
    }
    // ── 2. Expansion ──────────────────────────────────────────────
    if (!node.terminal && node.untried.length > 0) {
      const idx = Math.floor(rng() * node.untried.length);
      const move = node.untried.splice(idx, 1)[0];
      const childFen = applyMove(ffish, node.fen, move);
      if (childFen) {
        const child = makeNode(ffish, childFen, move, node);
        node.children.push(child);
        node = child;
      }
    }
    // ── 3. Simulation ─────────────────────────────────────────────
    // value is from the POV of the side to move at `node`.
    const value = node.terminal
      ? (node.terminalVal ?? -1)
      : rollout(ffish, node.fen, rng);
    // ── 4. Backpropagation (negamax) ──────────────────────────────
    // `value` is from node's side-to-move POV. As we walk UP, each
    // edge flips perspective: a node's stored value is from the POV of
    // the player who chose the move INTO it (= the parent's mover).
    let cur: Node | null = node;
    let v = value;
    while (cur) {
      cur.visits++;
      // cur.value is credited from cur's parent's-mover POV. The `v` we
      // hold is from cur's side-to-move POV; the parent's mover is the
      // opponent of cur's side to move, so negate when crediting cur.
      cur.value += -v;
      v = -v;
      cur = cur.parent;
    }
  }
  return root;
}

const CAPABILITIES: EngineCapabilities = {
  multiPV: false,
  network: null,
  difficulty: DEFAULT_DIFFICULTY_PRESETS,
  analysisDefaults: { nodes: DEFAULT_NODES },
};

export class MctsEngine implements MakrukEngine {
  readonly id = 'lab-mcts';
  readonly name = '🌳 MCTS (baseline)';
  readonly capabilities = CAPABILITIES;

  async init(): Promise<void> {
    await loadFfish();
  }

  async destroy(): Promise<void> {
    // Stateless.
  }

  async search(fen: string, opts: SearchOpts = {}): Promise<SearchResult> {
    const budget = Math.max(1, opts.nodes ?? DEFAULT_NODES);
    const temperature = opts.temperature ?? 0;
    const rng = opts.seed ? rngFromSeed(opts.seed) : Math.random;
    const ffish = (await loadFfish()) as unknown as Ffish;

    const legal = legalOf(ffish, fen);
    if (legal.length === 0) return { bestMove: '(none)' };
    if (legal.length === 1) return { bestMove: legal[0] };

    const root = runMcts(ffish, fen, budget, rng);
    if (root.children.length === 0) {
      // Budget too small to expand — fall back to a random legal move.
      return { bestMove: legal[Math.floor(rng() * legal.length)] };
    }

    const move = pickMove(root.children, temperature, rng);
    // Root child value is from the root mover's POV (negamax). Report it
    // as a side-to-move-POV centipawn-ish hint for the eval surface.
    const chosen = root.children.find((c) => c.move === move) ?? root.children[0];
    const scoreCp = Math.round((chosen.value / Math.max(1, chosen.visits)) * SQUASH);
    return { bestMove: move, scoreCp };
  }
}

/** temperature 0 → most-visited (argmax); >0 → softmax-sample over
 *  visit counts (higher temp = flatter / more variety). */
function pickMove(children: Node[], temperature: number, rng: () => number): string {
  if (temperature <= 0) {
    let best = children[0];
    for (const c of children) if (c.visits > best.visits) best = c;
    return best.move ?? children[0].move ?? '(none)';
  }
  const inv = 1 / temperature;
  const weights = children.map((c) => Math.pow(c.visits, inv));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < children.length; i++) {
    r -= weights[i];
    if (r <= 0) return children[i].move ?? '(none)';
  }
  return children[children.length - 1].move ?? '(none)';
}

registerEngine({
  id: 'lab-mcts',
  name: '🌳 MCTS (baseline)',
  factory: () => new MctsEngine(),
  research: true,
});
