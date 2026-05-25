// Promotion — bia reaches its promotion rank (6 for white, 3 for black).

import { thaiSquare } from '../../thaiUci';
import { registerMotif } from '../registry';

registerMotif({
  kind: 'promotion',
  priority: 6,
  detect: (ctx) => {
    if (ctx.mover.role !== 'bia') return null;
    const toRank = parseInt(ctx.to[1], 10);
    const promotes =
      (ctx.mover.color === 'white' && toRank === 6) ||
      (ctx.mover.color === 'black' && toRank === 3);
    if (!promotes) return null;
    return { kind: 'promotion', from: ctx.from, to: ctx.to };
  },
  format: (m) => `✨ เบี้ยถึงแถวโปรโมต กลายเป็นเม็ดที่ ${thaiSquare(m.to)}`,
});
