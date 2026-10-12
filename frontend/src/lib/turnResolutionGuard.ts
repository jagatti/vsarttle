/**
 * Guards the "turn is being resolved" window of the CPU-opponent battle modes
 * (SinglePlay / Roguelike / GhostMatch).
 *
 * A turn is "resolving" from the moment finalizeTurn(N) runs until the next
 * turn actually starts (setTurn(N + 1) + startCountdown + scheduleAutoAction),
 * which happens after the post-turn delay. During that window action
 * selections must be ignored, otherwise turn N would be re-resolved on top of
 * the already-advanced battle state.
 */
export type TurnResolutionGuard = {
  /** True while a turn is being resolved (or a new battle is being prepared). */
  isResolving: () => boolean;
  /** Highest turn number finalized in the current battle (0 = none yet). */
  lastFinalizedTurn: () => number;
  /** Whether a player action for `turnNumber` may be accepted right now. */
  canSelectAction: (turnNumber: number) => boolean;
  /**
   * Starts resolving `turnNumber`. Returns false (and changes nothing) when the
   * turn is already finalized or another resolution is in progress, so
   * finalizeTurn is idempotent per turn number.
   */
  beginResolution: (turnNumber: number) => boolean;
  /**
   * A new battle / floor / phase is being set up and its turn counter may
   * restart. Keeps actions blocked until `startTurn` is called.
   */
  prepareBattle: () => void;
  /** The next turn has really started: accept actions again. */
  startTurn: () => void;
  /** Battle finished / left / unmounted: clear everything. */
  reset: () => void;
};

export function createTurnResolutionGuard(): TurnResolutionGuard {
  let resolving = false;
  let lastFinalized = 0;

  return {
    isResolving: () => resolving,
    lastFinalizedTurn: () => lastFinalized,
    canSelectAction: (turnNumber) => !resolving && turnNumber > lastFinalized,
    beginResolution: (turnNumber) => {
      if (resolving || turnNumber <= lastFinalized) return false;
      lastFinalized = turnNumber;
      resolving = true;
      return true;
    },
    prepareBattle: () => {
      lastFinalized = 0;
      resolving = true;
    },
    startTurn: () => {
      resolving = false;
    },
    reset: () => {
      lastFinalized = 0;
      resolving = false;
    },
  };
}
