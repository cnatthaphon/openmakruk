// Mate + mate-threat motifs.
//
// `mate` fires when the engine reports mateIn=0 (the move IS the
// mating move). `mateThreat` fires when |mateIn| > 0 — a forced
// continuation toward mate. They're modelled as two separate motifs
// because the UI wants distinct sentences ("เกมจบ" vs "M3"), but
// share a single detector since both are driven by `mateInAfter`.

import { registerMotif } from '../registry';

registerMotif({
  kind: 'mate',
  priority: 0,
  detect: (ctx) => {
    if (typeof ctx.mateInAfter !== 'number') return null;
    if (ctx.mateInAfter !== 0) return null;
    return { kind: 'mate' };
  },
  format: () => '🏆 รุกจน! เกมจบ',
  strengthHint: () => 'great',
});

registerMotif({
  kind: 'mateThreat',
  priority: 1,
  detect: (ctx) => {
    if (typeof ctx.mateInAfter !== 'number') return null;
    const n = Math.abs(ctx.mateInAfter);
    if (n === 0) return null;
    return { kind: 'mateThreat', inMoves: n };
  },
  format: (m) => `🎯 เปิดทางรุกจนใน ${m.inMoves} ตา`,
  strengthHint: () => 'great',
});
