// Hanging target — enemy piece left undefended that we now attack.
// Skips the just-captured square (the capture motif already handles
// that case) and the king (already covered by check).

import { attackerIndex, attackedBy, letterToPiece, ROLE_TH } from '../../chessAttacks';
import { thaiSquare } from '../../thaiUci';
import { registerMotif } from '../registry';

registerMotif({
  kind: 'hangingTarget',
  priority: 5,
  detect: (ctx) => {
    const ourAttacks = attackerIndex(ctx.after, ctx.mover.color);
    const victimLetter = ctx.before[ctx.to];
    for (const [targetSq] of ourAttacks) {
      const occupant = ctx.after[targetSq];
      if (!occupant) continue;
      const target = letterToPiece(occupant);
      if (!target || target.color === ctx.mover.color) continue;
      if (target.role === 'king') continue;
      // Skip the just-captured square — already handled by the capture motif.
      if (targetSq === ctx.to && victimLetter) continue;
      const defenders = attackedBy(ctx.after, targetSq, target.color);
      if (defenders.length === 0) {
        return {
          kind: 'hangingTarget',
          square: targetSq,
          role: target.role,
          defendersCount: defenders.length,
        };
      }
    }
    return null;
  },
  format: (m) =>
    `👀 ${ROLE_TH[m.role]}ของฝ่ายตรงข้ามที่ ${thaiSquare(m.square)} ` +
    `ไม่มีใครป้องกัน — เก็บไว้รอจับ`,
});
