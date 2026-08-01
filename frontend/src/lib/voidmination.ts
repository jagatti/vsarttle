import type { PlayerBattleState } from "@/types/game";

export interface VoidminationTrigger {
  kind: string; // e.g. "eva0-nickname"
}

/**
 * Checks whether the 空間支配（ヴォイドミネーション）should be triggered this turn.
 *
 * Currently implements the "EVA0 nickname" trigger only.
 * Additional triggers (e.g. boss-related conditions) can be added here in the future.
 *
 * @returns A VoidminationTrigger describing the matched condition, or null if no trigger.
 */
export function checkVoidminationTrigger(params: {
  players: PlayerBattleState[];
  turnHadAvoidance: boolean;
}): VoidminationTrigger | null {
  // Trigger: at least one player has "EVA0" (case-insensitive) in their nickname,
  // and this turn had at least one avoidance event.
  const hasEva0Nickname = params.players.some((p) =>
    p.nickname.toLowerCase().includes("eva0"),
  );
  if (hasEva0Nickname && params.turnHadAvoidance) {
    return { kind: "eva0-nickname" };
  }
  return null;
}
