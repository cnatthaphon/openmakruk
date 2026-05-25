// Develop — back-rank minor/major piece moves into play. Opening
// hint, not a tactical motif, so priority is the lowest.

import { ROLE_TH } from '../../chessAttacks';
import { thaiSquare } from '../../thaiUci';
import { registerMotif } from '../registry';

registerMotif({
  kind: 'develop',
  priority: 7,
  detect: (ctx) => {
    const fromRank = parseInt(ctx.from[1], 10);
    const isBackRank =
      (ctx.mover.color === 'white' && fromRank === 1) ||
      (ctx.mover.color === 'black' && fromRank === 8);
    if (!isBackRank) return null;
    if (
      ctx.mover.role !== 'knight' &&
      ctx.mover.role !== 'khon' &&
      ctx.mover.role !== 'rook'
    ) {
      return null;
    }
    return { kind: 'develop', role: ctx.mover.role, from: ctx.from, to: ctx.to };
  },
  format: (m) =>
    `🏃 นำ${ROLE_TH[m.role]}ออกมาเล่น (${thaiSquare(m.from)} → ${thaiSquare(m.to)})`,
});
