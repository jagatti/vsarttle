import type { PlayerBattleState } from "@/types/game";

export const TURN_SECONDS = 30;
export const PARALYSIS_TURN_SECONDS = 3;
export const POST_TURN_DELAY_MS = 4200;

export function getRoguelikeTurnSeconds(player: PlayerBattleState | undefined): number {
  return player?.paralyzedNextTurn ? PARALYSIS_TURN_SECONDS : TURN_SECONDS;
}
