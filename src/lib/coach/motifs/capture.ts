// Capture — taking an enemy piece on the move's destination square.

import { attackedBy, letterToPiece, PIECE_VALUE, ROLE_TH } from '../../chessAttacks';
import { thaiSquare } from '../../thaiUci';
import { registerMotif } from '../registry';

registerMotif({
  kind: 'capture',
  priority: 4,
  detect: (ctx) => {
    const victimLetter = ctx.before[ctx.to];
    if (!victimLetter) return null;
    const victim = letterToPiece(victimLetter);
    if (!victim || victim.color === ctx.mover.color) return null;

    const enemyAttackers = attackedBy(ctx.after, ctx.to, victim.color);
    const ourDefenders = attackedBy(ctx.after, ctx.to, ctx.mover.color);
    const isFree = enemyAttackers.length === 0;
    const moverVal = PIECE_VALUE[ctx.mover.role];
    const victimVal = PIECE_VALUE[victim.role];
    const isEqualOrBetterTrade =
      victimVal >= moverVal ||
      (enemyAttackers.length > 0 && ourDefenders.length >= enemyAttackers.length);

    return {
      kind: 'capture',
      victim: victim.role,
      square: ctx.to,
      isFree,
      isEqualOrBetterTrade,
    };
  },
  format: (m) => {
    if (m.isFree) {
      return `💰 จับ${ROLE_TH[m.victim]}ที่ ${thaiSquare(m.square)} ฟรี — ไม่มีใครจับคืน`;
    }
    if (m.isEqualOrBetterTrade) {
      return `🔄 แลก${ROLE_TH[m.victim]}ที่ ${thaiSquare(m.square)} — คุ้มทุน`;
    }
    return `⚠️ จับ${ROLE_TH[m.victim]}ที่ ${thaiSquare(m.square)} แต่อาจถูกจับคืน — ระวัง`;
  },
  strengthHint: (m) => (m.isFree || m.isEqualOrBetterTrade ? 'great' : undefined),
});
