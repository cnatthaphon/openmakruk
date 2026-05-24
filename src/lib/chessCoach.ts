// Chess Coach — rule-based, Thai-language move explainer.
//
// For each move the engine recommends, we explain WHY it's a good
// move using detected board-geometry motifs:
//
//   • capture        — what's being taken, defended?
//   • check          — what's checking what
//   • fork           — N targets attacked simultaneously
//   • hangingTarget  — undefended enemy piece up for grabs
//   • mateThreat     — engine reports mate in N
//   • develop        — moving a backrank piece into play
//   • promotion      — bia reaches the 6th / 3rd rank
//
// No LLM. No vector DB. Just chess rules + Thai sentence templates.
// Adding a new motif = new detector function + new template entry.
//
// Output is one OR more sentences in Thai joined with " · ". The
// hint UI renders the first sentence prominently and the rest as
// secondary annotations.

import {
  attackedBy,
  attackerIndex,
  enemyTargetsFrom,
  letterToPiece,
  piecesFromFen,
  PIECE_VALUE,
  ROLE_TH,
} from './chessAttacks';
import type { Color, Role } from './lessonRules';
import { thaiSquare } from './thaiUci';
import { parseUci } from './makruk';

export type CoachInput = {
  fenBefore: string;
  fenAfter: string;
  /** UCI move like "e3e4" or "d5d6m" for promotion. */
  moveUci: string;
  /** Engine's centipawn eval AFTER the move, from side-to-move POV. */
  scoreCpAfter?: number;
  /** Engine's mate-in count AFTER the move (positive = side delivering). */
  mateInAfter?: number;
  /** Depth the engine reached. For surface display only. */
  depth?: number;
};

export type CoachMotif =
  | { kind: 'capture'; victim: Role; square: string; isFree: boolean; isEqualOrBetterTrade: boolean }
  | { kind: 'check'; attackerSquare: string; attackerRole: Role }
  | { kind: 'mate' }
  | { kind: 'mateThreat'; inMoves: number }
  | { kind: 'fork'; attackerSquare: string; attackerRole: Role; targets: { square: string; role: Role; value: number }[] }
  | { kind: 'hangingTarget'; square: string; role: Role; defendersCount: number }
  | { kind: 'develop'; role: Role; from: string; to: string }
  | { kind: 'promotion'; from: string; to: string };

export type CoachOutput = {
  motifs: CoachMotif[];
  /** First sentence — the headline. */
  headline: string;
  /** Optional follow-on details, max 2-3 sentences. */
  details: string[];
  /** Eval string ("+0.35" / "M3") for surface. */
  evalLabel?: string;
  /** Recommendation strength inferred from eval + motifs. */
  strength: 'great' | 'good' | 'neutral';
};

/** Build a complete explanation given a recommended move. */
export function explain(input: CoachInput): CoachOutput {
  const motifs = detect(input);
  const evalLabel = formatEval(input);
  const strength = inferStrength(input, motifs);
  const [headline, ...details] = composeSentences(motifs, evalLabel);
  return {
    motifs,
    headline: headline ?? 'ตาเดินที่ดี',
    details,
    evalLabel,
    strength,
  };
}

// ---- Motif detection --------------------------------------------------

function detect(input: CoachInput): CoachMotif[] {
  const before = piecesFromFen(input.fenBefore);
  const after = piecesFromFen(input.fenAfter);
  const { from, to } = parseUci(input.moveUci);
  const motifs: CoachMotif[] = [];

  const moverLetter = before[from];
  const moverPiece = moverLetter ? letterToPiece(moverLetter) : null;
  if (!moverPiece) return motifs;

  // Mate detection: engine reports mate=0 or mate=1 → terminal / forced
  if (typeof input.mateInAfter === 'number') {
    if (input.mateInAfter === 0) {
      motifs.push({ kind: 'mate' });
    } else if (Math.abs(input.mateInAfter) > 0) {
      motifs.push({ kind: 'mateThreat', inMoves: Math.abs(input.mateInAfter) });
    }
  }

  // Promotion: bia moves onto rank 6 (white) or rank 3 (black).
  if (moverPiece.role === 'bia') {
    const toRank = parseInt(to[1], 10);
    if ((moverPiece.color === 'white' && toRank === 6) || (moverPiece.color === 'black' && toRank === 3)) {
      motifs.push({ kind: 'promotion', from, to });
    }
  }

  // Capture: there was an enemy piece on `to` before, and the count
  // of that enemy role decreased.
  const victimLetter = before[to];
  if (victimLetter) {
    const victim = letterToPiece(victimLetter);
    if (victim && victim.color !== moverPiece.color) {
      // After the move, is the moving piece defended on `to`?
      const enemyAttackers = attackedBy(after, to, victim.color);
      const ourDefenders  = attackedBy(after, to, moverPiece.color);
      const isFree = enemyAttackers.length === 0;
      // Equal trade or better if we get more value than we risk
      const moverVal = PIECE_VALUE[moverPiece.role];
      const victimVal = PIECE_VALUE[victim.role];
      const isEqualOrBetterTrade =
        victimVal >= moverVal ||
        (enemyAttackers.length > 0 && ourDefenders.length >= enemyAttackers.length);
      motifs.push({
        kind: 'capture',
        victim: victim.role,
        square: to,
        isFree,
        isEqualOrBetterTrade,
      });
    }
  }

  // Check: was the new position putting the enemy king in check? We
  // detect by finding the enemy king on `after` and checking if any of
  // our pieces attack it. The piece that delivers check is most often
  // the just-moved one or one revealed by it (discovered check).
  const enemyKingSq = findKing(after, moverPiece.color === 'white' ? 'black' : 'white');
  if (enemyKingSq) {
    const attackers = attackedBy(after, enemyKingSq, moverPiece.color);
    if (attackers.length > 0) {
      const checkerSq = attackers[0];
      const checkerLetter = after[checkerSq];
      const checkerPiece = checkerLetter ? letterToPiece(checkerLetter) : null;
      if (checkerPiece) {
        motifs.push({
          kind: 'check',
          attackerSquare: checkerSq,
          attackerRole: checkerPiece.role,
        });
      }
    }
  }

  // Fork: from the new square, our piece attacks 2+ enemy targets
  // (king counts double for emphasis but we cap weight).
  const targets = enemyTargetsFrom(after, to, moverPiece);
  if (targets.length >= 2) {
    motifs.push({
      kind: 'fork',
      attackerSquare: to,
      attackerRole: moverPiece.role,
      targets: targets.map((t) => ({
        square: t.square,
        role: t.piece.role,
        value: PIECE_VALUE[t.piece.role],
      })),
    });
  }

  // Hanging piece: after the move, any enemy piece is attacked by us
  // with 0 defenders. Surfaces "free piece coming up next turn".
  const ourAttacks = attackerIndex(after, moverPiece.color);
  for (const [targetSq] of ourAttacks) {
    const occupant = after[targetSq];
    if (!occupant) continue;
    const target = letterToPiece(occupant);
    if (!target || target.color === moverPiece.color) continue;
    if (target.role === 'king') continue; // already covered by check motif
    // Skip the just-captured square — already in capture motif
    if (targetSq === to && victimLetter) continue;
    const defenders = attackedBy(after, targetSq, target.color);
    if (defenders.length === 0) {
      motifs.push({
        kind: 'hangingTarget',
        square: targetSq,
        role: target.role,
        defendersCount: defenders.length,
      });
      // Cap at one hanging piece per explanation to keep it concise
      break;
    }
  }

  // Develop: a back-rank piece moves into play (only relevant in opening).
  const fromRank = parseInt(from[1], 10);
  const isBackRank =
    (moverPiece.color === 'white' && fromRank === 1) ||
    (moverPiece.color === 'black' && fromRank === 8);
  if (isBackRank && (moverPiece.role === 'knight' || moverPiece.role === 'khon' || moverPiece.role === 'rook')) {
    motifs.push({ kind: 'develop', role: moverPiece.role, from, to });
  }

  return motifs;
}

function findKing(pieces: Record<string, string>, side: Color): string | null {
  for (const [sq, letter] of Object.entries(pieces)) {
    const p = letterToPiece(letter);
    if (p && p.role === 'king' && p.color === side) return sq;
  }
  return null;
}

// ---- Templates → Thai sentences --------------------------------------

function composeSentences(motifs: CoachMotif[], evalLabel?: string): string[] {
  const out: string[] = [];
  // Order matters — mate > check > fork > capture > hanging > develop > promotion
  const priorityOrder: CoachMotif['kind'][] = [
    'mate',
    'mateThreat',
    'check',
    'fork',
    'capture',
    'hangingTarget',
    'promotion',
    'develop',
  ];
  const sorted = motifs.slice().sort(
    (a, b) => priorityOrder.indexOf(a.kind) - priorityOrder.indexOf(b.kind),
  );

  for (const m of sorted) {
    const s = sentence(m);
    if (s) out.push(s);
  }
  if (out.length === 0 && evalLabel) {
    out.push(`ตาเดินนี้ทำให้สถานการณ์ดีขึ้น (${evalLabel})`);
  }
  return out;
}

function sentence(m: CoachMotif): string {
  switch (m.kind) {
    case 'mate':
      return '🏆 รุกจน! เกมจบ';
    case 'mateThreat':
      return `🎯 เปิดทางรุกจนใน ${m.inMoves} ตา`;
    case 'check':
      return `⚔️ รุก! ${ROLE_TH[m.attackerRole]}ที่ ${thaiSquare(m.attackerSquare)} ขู่ขุน — ฝ่ายตรงข้ามต้องป้องกัน`;
    case 'fork': {
      const labels = m.targets
        .map((t) => `${ROLE_TH[t.role]}ที่ ${thaiSquare(t.square)}`)
        .join(' กับ ');
      return `🪤 ${ROLE_TH[m.attackerRole]}ขู่ ${labels} พร้อมกัน (fork)`;
    }
    case 'capture': {
      if (m.isFree) {
        return `💰 จับ${ROLE_TH[m.victim]}ที่ ${thaiSquare(m.square)} ฟรี — ไม่มีใครจับคืน`;
      }
      if (m.isEqualOrBetterTrade) {
        return `🔄 แลก${ROLE_TH[m.victim]}ที่ ${thaiSquare(m.square)} — คุ้มทุน`;
      }
      return `⚠️ จับ${ROLE_TH[m.victim]}ที่ ${thaiSquare(m.square)} แต่อาจถูกจับคืน — ระวัง`;
    }
    case 'hangingTarget':
      return `👀 ${ROLE_TH[m.role]}ของฝ่ายตรงข้ามที่ ${thaiSquare(m.square)} ไม่มีใครป้องกัน — เก็บไว้รอจับ`;
    case 'promotion':
      return `✨ เบี้ยถึงแถวโปรโมต กลายเป็นเม็ดที่ ${thaiSquare(m.to)}`;
    case 'develop':
      return `🏃 นำ${ROLE_TH[m.role]}ออกมาเล่น (${thaiSquare(m.from)} → ${thaiSquare(m.to)})`;
  }
}

// ---- Eval surface -----------------------------------------------------

function formatEval(input: CoachInput): string | undefined {
  if (typeof input.mateInAfter === 'number' && input.mateInAfter !== 0) {
    return `M${Math.abs(input.mateInAfter)}`;
  }
  if (typeof input.scoreCpAfter === 'number') {
    const pawns = input.scoreCpAfter / 100;
    return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
  }
  return undefined;
}

function inferStrength(input: CoachInput, motifs: CoachMotif[]): CoachOutput['strength'] {
  if (motifs.some((m) => m.kind === 'mate')) return 'great';
  if (motifs.some((m) => m.kind === 'mateThreat')) return 'great';
  if (motifs.some((m) => m.kind === 'fork')) return 'great';
  if (motifs.some((m) => m.kind === 'capture' && (m.isFree || m.isEqualOrBetterTrade))) return 'great';
  if (typeof input.scoreCpAfter === 'number' && input.scoreCpAfter > 50) return 'good';
  return 'neutral';
}
