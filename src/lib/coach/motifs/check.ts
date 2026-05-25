// Check — the moving side just put the enemy king in check.

import { attackedBy, letterToPiece } from '../../chessAttacks';
import type { Color } from '../../lessonRules';
import { thaiSquare } from '../../thaiUci';
import { ROLE_TH } from '../../chessAttacks';
import { registerMotif } from '../registry';
import type { PieceMap } from '../../makruk';

function findKing(pieces: PieceMap, side: Color): string | null {
  for (const [sq, letter] of Object.entries(pieces)) {
    const p = letterToPiece(letter);
    if (p && p.role === 'king' && p.color === side) return sq;
  }
  return null;
}

registerMotif({
  kind: 'check',
  priority: 2,
  detect: (ctx) => {
    const enemyColor: Color = ctx.mover.color === 'white' ? 'black' : 'white';
    const enemyKingSq = findKing(ctx.after, enemyColor);
    if (!enemyKingSq) return null;
    const attackers = attackedBy(ctx.after, enemyKingSq, ctx.mover.color);
    if (attackers.length === 0) return null;
    const checkerSq = attackers[0];
    const piece = letterToPiece(ctx.after[checkerSq]);
    if (!piece) return null;
    return {
      kind: 'check',
      attackerSquare: checkerSq,
      attackerRole: piece.role,
    };
  },
  format: (m) =>
    `⚔️ รุก! ${ROLE_TH[m.attackerRole]}ที่ ${thaiSquare(m.attackerSquare)} ` +
    `ขู่ขุน — ฝ่ายตรงข้ามต้องป้องกัน`,
});
