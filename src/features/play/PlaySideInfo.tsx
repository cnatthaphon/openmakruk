// Sidebar lobby surface for the Play tab — challenge banner,
// quick-actions (draw / resign), and lobby-state widgets
// (DidYouKnow + TodayStrip).
//
// Extracted from App.tsx as the first step of issue #5 ("Split
// play orchestration out of App.tsx"). The boundary was chosen
// because this JSX block is pure presentation with a small,
// stable prop surface — no useEffects, no engine calls, no
// router writes. Future extractions (game-end recorder, sidebar
// tabs, review panel) can land separately under the same
// `src/features/play/` directory.

import type { ChallengeTarget } from '../../lib/challenge';
import { clearChallengeTarget } from '../../lib/challenge';
import { findNarrative } from '../../lib/personalities/narrative';
import { DidYouKnowCard } from '../../components/DidYouKnowCard';
import { TodayStrip } from '../../components/TodayStrip';
import { MAKRUK_START_FEN } from '../../lib/makruk';

type PlayMode = 'play-white' | 'play-black' | 'self-play' | 'manual';

type GameState = {
  fen?: string;
  isGameOver?: boolean;
};

type Props = {
  /** Active challenge target, or null when none is set. */
  challenge: ChallengeTarget | null;
  /** State setter so the "✕ จบ" close button can clear local state
   *  the same render that calls clearChallengeTarget(). */
  setChallenge: (next: ChallengeTarget | null) => void;
  /** Move history — length === 0 means lobby state. */
  history: readonly unknown[];
  /** Current play mode. Quick-actions only render in human-vs-CPU. */
  mode: PlayMode;
  /** Current game state (for fen + isGameOver checks). May be null
   *  during initial load. */
  state: GameState | null;
  /** Forced result (e.g. resignation) — quick-actions hide when set. */
  forcedResult: string | null;
  /** Review panel currently active — quick-actions + lobby cards hide. */
  reviewActive: boolean;
  /** Engine is currently thinking — disables quick-actions. */
  thinking: boolean;
  /** Draw offer in flight — keeps the button in "thinking" state. */
  drawOfferPending: boolean;
  /** Handlers wired to the engine + state machine in App.tsx. */
  handleOfferDraw: () => void;
  handleResign: () => void;
};

export function PlaySideInfo(props: Props) {
  const {
    challenge,
    setChallenge,
    history,
    mode,
    state,
    forcedResult,
    reviewActive,
    thinking,
    drawOfferPending,
    handleOfferDraw,
    handleResign,
  } = props;

  const showQuickActions =
    (mode === 'play-white' || mode === 'play-black') &&
    !state?.isGameOver &&
    !forcedResult &&
    !reviewActive;

  // DidYouKnow + TodayStrip only show in the canonical lobby state:
  // start position, no moves played, no active challenge or review.
  const piecePart = state?.fen?.split(' ')[0];
  const atStart = piecePart === MAKRUK_START_FEN.split(' ')[0];
  const showLobby =
    atStart &&
    history.length === 0 &&
    !challenge &&
    !state?.isGameOver &&
    !reviewActive;

  return (
    <div className="play-side-info">
      {challenge && (
        <div className="challenge-banner" role="status">
          <span className="challenge-banner-icon">⚔️</span>
          <div className="challenge-banner-body">
            <strong>
              {challenge.avatar} กำลังท้าดวล {challenge.displayName}
            </strong>
            <span className="label-aside">
              rating {challenge.rating} · ผลเกมจะนับใน Bot Hall of Fame
            </span>
            {(() => {
              const narr = findNarrative(challenge.personality);
              if (!narr || history.length > 0) return null;
              return (
                <span className="challenge-banner-quote">
                  💬 {narr.preGameQuote}
                </span>
              );
            })()}
          </div>
          <button
            className="challenge-banner-clear"
            onClick={() => {
              clearChallengeTarget();
              setChallenge(null);
            }}
            title="หยุดท้าดวลตัวนี้ — เกมต่อไปจะนับเป็น difficulty ปกติ"
          >
            ✕ จบ
          </button>
        </div>
      )}
      {showQuickActions && (
        <div className="play-quick-actions">
          <button
            className="play-quick-button"
            onClick={handleOfferDraw}
            disabled={thinking || drawOfferPending || history.length === 0}
            title={
              history.length === 0
                ? 'ขอเสมอ — เปิดให้กดหลังจากเดินตาแรก'
                : 'ขอเสมอ — คอมจะตัดสินจากค่า eval ปัจจุบัน'
            }
          >
            {drawOfferPending ? (
              <>
                <span className="spinner-sm" aria-hidden="true" />
                กำลังพิจารณา...
              </>
            ) : (
              <>🤝 ขอเสมอ</>
            )}
          </button>
          <button
            className="play-quick-button play-quick-resign"
            onClick={handleResign}
            disabled={thinking || history.length === 0}
            title={
              history.length === 0
                ? 'ยอมแพ้ — เปิดให้กดหลังจากเดินตาแรก'
                : 'ยอมแพ้ — บันทึกเป็น loss'
            }
          >
            🏳 ยอมแพ้
          </button>
        </div>
      )}
      {showLobby && (
        <>
          <DidYouKnowCard />
          <TodayStrip />
        </>
      )}
    </div>
  );
}
