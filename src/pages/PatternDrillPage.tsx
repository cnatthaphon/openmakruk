// 🧠 Pattern Recognition drill — visualization trainer.
//
// Loop:
//   1. Show position for PATTERN_FLASH_MS (~3 seconds)
//   2. Hide position + reveal question with 4 choices
//   3. User picks → correct/wrong + advance
//   4. After PATTERN_DRILL_ROUNDS rounds, record best score
//
// All questions come from the existing puzzle FEN pool. No new content
// curation — variety scales with the puzzle catalog automatically.

import { useEffect, useMemo, useState } from 'react';
import { Board } from '../components/Board';
import { loadPuzzles } from '../lib/content';
import type { Puzzle } from '../lib/puzzleSchema';
import { MAKRUK_START_FEN } from '../lib/makruk';
import {
  PATTERN_DRILL_ROUNDS,
  PATTERN_FLASH_MS,
  buildQuestion,
  loadPatternBest,
  recordPatternRun,
  type DrillQuestion,
} from '../lib/patternDrill';
import { navigate } from '../lib/router';

type Phase = 'intro' | 'flash' | 'quiz' | 'done';

export function PatternDrillPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [question, setQuestion] = useState<DrillQuestion | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const best = useMemo(() => loadPatternBest(), [phase === 'done']);

  useEffect(() => {
    let cancelled = false;
    loadPuzzles().then((p) => {
      if (!cancelled) setPuzzles(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Flash → quiz transition timer.
  useEffect(() => {
    if (phase !== 'flash') return;
    const t = window.setTimeout(() => setPhase('quiz'), PATTERN_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const startRun = () => {
    if (!puzzles || puzzles.length === 0) return;
    setRound(0);
    setScore(0);
    setPicked(null);
    const q = buildQuestion(puzzles);
    if (!q) return;
    setQuestion(q);
    setPhase('flash');
  };

  const nextRound = () => {
    const nextIdx = round + 1;
    if (nextIdx >= PATTERN_DRILL_ROUNDS) {
      // Finished — record + show summary
      recordPatternRun(score);
      setPhase('done');
      return;
    }
    setRound(nextIdx);
    setPicked(null);
    const q = buildQuestion(puzzles!);
    if (!q) {
      setPhase('done');
      return;
    }
    setQuestion(q);
    setPhase('flash');
  };

  const pick = (choice: string) => {
    if (picked !== null || !question) return;
    setPicked(choice);
    if (choice === question.answer) {
      setScore((s) => s + 1);
    }
  };

  if (phase === 'intro') {
    return (
      <main className="pattern-page">
        <button className="pattern-back" onClick={() => navigate({ tab: 'study' })}>
          ← กลับ ทฤษฎี
        </button>
        <header className="pattern-intro">
          <div className="pattern-intro-icon" aria-hidden="true">🧠</div>
          <h2>Pattern Recognition</h2>
          <p className="label-aside">
            ดูตำแหน่ง 3 วินาที → ปิด → ตอบคำถาม · ฝึก visualization · {PATTERN_DRILL_ROUNDS} รอบ
          </p>
          <div className="pattern-best">
            {best.bestScore > 0
              ? `🏆 personal best: ${best.bestScore} / ${PATTERN_DRILL_ROUNDS}`
              : 'ยังไม่เคยทำ — ลองได้เลย'}
          </div>
          <button
            className="pattern-start"
            disabled={!puzzles || puzzles.length === 0}
            onClick={startRun}
          >
            ⚡ เริ่ม
          </button>
        </header>
      </main>
    );
  }

  if (phase === 'done') {
    return (
      <main className="pattern-page">
        <div className="pattern-result">
          <div className="pattern-result-icon">🧠</div>
          <h2>จบรอบ</h2>
          <div className="pattern-result-score">
            {score} / {PATTERN_DRILL_ROUNDS}
          </div>
          {score > best.bestScore && (
            <div className="pattern-result-meta">🎉 ทำลายสถิติเดิม ({best.bestScore})</div>
          )}
          <div className="pattern-result-actions">
            <button className="pattern-start" onClick={startRun}>↻ ลองอีกครั้ง</button>
            <button
              className="pattern-secondary"
              onClick={() => navigate({ tab: 'study' })}
            >
              ← กลับ ทฤษฎี
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!question) {
    return (
      <main className="pattern-page">
        <p className="label-aside">กำลังโหลด…</p>
      </main>
    );
  }

  return (
    <main className="pattern-page pattern-active">
      <header className="pattern-hud">
        <span>รอบ {round + 1} / {PATTERN_DRILL_ROUNDS}</span>
        <span>✅ {score}</span>
      </header>

      <div className="pattern-board">
        <Board
          fen={phase === 'flash' ? question.fen : MAKRUK_START_FEN}
          legalMoves={[]}
          flipped={false}
          disabled
          turn="white"
          isCheck={false}
          lastMove={null}
          hint={null}
          onMove={() => undefined}
        />
        {phase !== 'flash' && (
          <div className="pattern-board-overlay" aria-hidden="true">
            <div className="pattern-board-overlay-text">🎯 จำตำแหน่งได้ไหม</div>
          </div>
        )}
      </div>

      {phase === 'quiz' && (
        <section className="pattern-quiz">
          <div className="pattern-prompt">{question.prompt}</div>
          <div className="pattern-choices">
            {question.choices.map((c) => {
              const isPicked = picked === c;
              const isCorrect = c === question.answer;
              const cls = picked === null
                ? ''
                : isCorrect
                  ? 'is-correct'
                  : isPicked
                    ? 'is-wrong'
                    : '';
              return (
                <button
                  key={c}
                  className={`pattern-choice ${cls}`}
                  disabled={picked !== null}
                  onClick={() => pick(c)}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <div className="pattern-next">
              <button onClick={nextRound} className="pattern-start">
                {round + 1 >= PATTERN_DRILL_ROUNDS ? 'ดูคะแนน →' : 'รอบถัดไป →'}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
