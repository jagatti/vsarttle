/**
 * CPU戦マネージャー（SinglePlay / Roguelike / GhostMatch）用のターン解決ガード。
 *
 * finalizeTurn(N) から次ターン開始（setTurn(N+1) + startCountdown + scheduleAutoAction）
 * までの間は「解決中」とし、その間の技選択を無視する。また、同じターン番号を
 * 2回以上解決しないよう、最後に解決したターン番号を記録する。
 *
 * 新しいバトル / フロア / フェーズでターン番号が 1 から再開する場合は reset() を呼ぶ。
 */
export interface TurnResolutionGuard {
  /** finalizeTurn から次ターン開始までの間 true */
  readonly isResolving: boolean;
  /** 最後に解決を開始したターン番号（未解決なら 0） */
  readonly lastFinalizedTurn: number;
  /** tryBegin(turnNumber) が成功するかどうかを状態を変えずに判定する（技選択の受付判定用） */
  canBegin(turnNumber: number): boolean;
  /**
   * ターン解決を開始する。解決中、または既に解決済み（turnNumber <= lastFinalizedTurn）の
   * 場合は false を返し、何もしない。
   */
  tryBegin(turnNumber: number): boolean;
  /** 次ターンが開始した（またはバトルが終了した）ので解決中フラグを解除する */
  release(): void;
  /** 新しいバトル / フロア / フェーズ開始時に、解決中フラグと解決済みターン番号を初期化する */
  reset(): void;
}

export function createTurnResolutionGuard(): TurnResolutionGuard {
  let isResolving = false;
  let lastFinalizedTurn = 0;
  const canBegin = (turnNumber: number) => !isResolving && turnNumber > lastFinalizedTurn;

  return {
    get isResolving() {
      return isResolving;
    },
    get lastFinalizedTurn() {
      return lastFinalizedTurn;
    },
    canBegin,
    tryBegin(turnNumber: number) {
      if (!canBegin(turnNumber)) return false;
      isResolving = true;
      lastFinalizedTurn = turnNumber;
      return true;
    },
    release() {
      isResolving = false;
    },
    reset() {
      isResolving = false;
      lastFinalizedTurn = 0;
    },
  };
}
