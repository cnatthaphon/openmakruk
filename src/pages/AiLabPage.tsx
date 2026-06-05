// 🧪 AI Lab — engine-vs-engine match runner.
//
// The visible payoff of the contract-driven engine layer: every engine
// (random / minimax / MCTS / Fairy-Stockfish / personalities) implements
// MakrukEngine, so you can pit ANY two against each other and watch the
// win/loss/draw tally. Reachable at /#/ailab.
//
// v1 is results-only (no live board playback). The match runs entirely
// client-side via adhoc engine instances, so it never disturbs the
// engine you picked for normal play.

import { useMemo, useRef, useState } from 'react';
import { Page } from '../components/Page';
import { BackButton } from '../components/BackButton';
import { listEngines } from '../lib/engine';
import { playMatch, type MatchProgress, type MatchResult } from '../lib/ailab/match';

const DEFAULT_GAMES = 6;
// Keep Lab matches snappy: bounded budget + ply cap. Stochastic engines
// stay reproducible because playMatch derives a per-move seed.
const LAB_SEARCH = { depth: 2, nodes: 200 } as const;
const LAB_PLY_CAP = 80;

export function AiLabPage() {
  const engines = useMemo(() => listEngines(), []);
  // Default to a clear contrast: MCTS vs Random if both exist.
  const [aId, setAId] = useState(
    () => engines.find((e) => e.id === 'lab-mcts')?.id ?? engines[0]?.id ?? '',
  );
  const [bId, setBId] = useState(
    () => engines.find((e) => e.id === 'lab-random')?.id ?? engines[1]?.id ?? '',
  );
  const [games, setGames] = useState(DEFAULT_GAMES);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<MatchProgress | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const cancelRef = useRef(false);

  const nameOf = (id: string) => engines.find((e) => e.id === id)?.name ?? id;

  const run = async () => {
    if (running || !aId || !bId) return;
    setRunning(true);
    setResult(null);
    setProgress({ game: 0, totalGames: games, ply: 0 });
    cancelRef.current = false;
    try {
      const r = await playMatch({
        aId,
        bId,
        games,
        search: LAB_SEARCH,
        plyCap: LAB_PLY_CAP,
        seed: `ailab:${aId}:${bId}:${games}`,
        onProgress: (p) => setProgress(p),
        shouldStop: () => cancelRef.current,
      });
      setResult(r);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <Page variant="medium" className="ailab-page">
      <BackButton to="play">เล่น</BackButton>
      <header className="ailab-header">
        <h2>🧪 AI Lab · Engine Arena</h2>
        <p className="label-aside">
          จับ engine สองตัวมาเล่นกันเอง แล้วดูผล — random / minimax / MCTS /
          Fairy-Stockfish ใช้ contract เดียวกัน จึงจับคู่ไหนก็ได้. การแข่งรันบนเครื่องคุณ
          และไม่กระทบ engine ที่คุณเลือกเล่นปกติ.
        </p>
      </header>

      <section className="ailab-controls">
        <label className="ailab-field">
          <span>ฝั่ง A</span>
          <select value={aId} onChange={(e) => setAId(e.target.value)} disabled={running}>
            {engines.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <span className="ailab-vs">vs</span>
        <label className="ailab-field">
          <span>ฝั่ง B</span>
          <select value={bId} onChange={(e) => setBId(e.target.value)} disabled={running}>
            {engines.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className="ailab-field">
          <span>จำนวนเกม</span>
          <select
            value={games}
            onChange={(e) => setGames(Number(e.target.value))}
            disabled={running}
          >
            {[2, 4, 6, 10, 20].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        {running ? (
          <button className="ailab-run" onClick={() => { cancelRef.current = true; }}>
            ⏹ หยุด
          </button>
        ) : (
          <button className="ailab-run" onClick={run} disabled={aId === bId}>
            ▶ เริ่มแข่ง
          </button>
        )}
      </section>

      {aId === bId && !running && (
        <p className="ailab-note label-aside">เลือก engine คนละตัวก่อนเริ่มแข่ง</p>
      )}

      {progress && (
        <p className="ailab-progress" aria-live="polite">
          กำลังแข่ง · เกม {progress.game}/{progress.totalGames} · ตา {progress.ply}
        </p>
      )}

      {result && <ResultCard result={result} nameOf={nameOf} />}
    </Page>
  );
}

function ResultCard({
  result,
  nameOf,
}: {
  result: MatchResult;
  nameOf: (id: string) => string;
}) {
  const total = result.games.length;
  const aPct = Math.round(result.aScore * 100);
  return (
    <section className="ailab-result">
      <h3>ผลการแข่ง · {total} เกม</h3>
      <div className="ailab-scorebar" role="img" aria-label={`คะแนน A ${aPct}%`}>
        <div className="ailab-scorebar-fill" style={{ width: `${aPct}%` }} />
        <span className="ailab-scorebar-label">{aPct}% · {nameOf(result.aId)}</span>
      </div>
      <table className="ailab-table">
        <thead>
          <tr><th>Engine</th><th>ชนะ</th><th>แพ้</th><th>เสมอ</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>{nameOf(result.aId)}</td>
            <td>{result.a.wins}</td><td>{result.a.losses}</td><td>{result.a.draws}</td>
          </tr>
          <tr>
            <td>{nameOf(result.bId)}</td>
            <td>{result.b.wins}</td><td>{result.b.losses}</td><td>{result.b.draws}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
