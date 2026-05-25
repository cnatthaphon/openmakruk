// Fork — the moving piece attacks 2+ enemy targets simultaneously.

import { enemyTargetsFrom, PIECE_VALUE, ROLE_TH } from '../../chessAttacks';
import { thaiSquare } from '../../thaiUci';
import { registerMotif } from '../registry';

registerMotif({
  kind: 'fork',
  priority: 3,
  detect: (ctx) => {
    const targets = enemyTargetsFrom(ctx.after, ctx.to, ctx.mover);
    if (targets.length < 2) return null;
    return {
      kind: 'fork',
      attackerSquare: ctx.to,
      attackerRole: ctx.mover.role,
      targets: targets.map((t) => ({
        square: t.square,
        role: t.piece.role,
        value: PIECE_VALUE[t.piece.role],
      })),
    };
  },
  format: (m) => {
    const labels = m.targets
      .map((t) => `${ROLE_TH[t.role]}ที่ ${thaiSquare(t.square)}`)
      .join(' กับ ');
    return `🪤 ${ROLE_TH[m.attackerRole]}ขู่ ${labels} พร้อมกัน (fork)`;
  },
  strengthHint: () => 'great',
});
