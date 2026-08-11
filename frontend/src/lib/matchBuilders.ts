import { createThumbnailFromImageSource } from "@/lib/imageThumbnail";
import type { MatchPlayerRecord } from "@/lib/persistenceTypes";
import type { PlayerBattleState } from "@/types/game";

export async function createMatchPlayerRecord(input: {
  playerId: string | null;
  nickname: string;
  characterType: PlayerBattleState["characterType"];
  stats: PlayerBattleState["stats"];
  drawingSource: string;
}): Promise<MatchPlayerRecord> {
  return {
    playerId: input.playerId,
    nickname: input.nickname,
    characterType: input.characterType,
    stats: input.stats,
    drawingThumbnail: await createThumbnailFromImageSource(input.drawingSource),
  };
}

/**
 * Remaps PeerJS session IDs to persistent player UUIDs inside TurnResult arrays.
 * Call this on a copy before submitting to /api/matches — never mutate the
 * original turnHistoryRef.
 */
export function remapTurnResultsToPersistentIds<
  T extends Pick<import("@/types/game").TurnResult, "winnerId" | "nextStates">,
>(turnResults: T[], idMap: Record<string, string>): T[] {
  return turnResults.map((turn) => {
    const remappedNextStates: typeof turn.nextStates = {};
    for (const [sessionId, state] of Object.entries(turn.nextStates)) {
      const persistentId = idMap[sessionId] ?? sessionId;
      remappedNextStates[persistentId] = state;
    }
    const remappedWinnerId =
      turn.winnerId !== null ? (idMap[turn.winnerId] ?? turn.winnerId) : null;
    return { ...turn, winnerId: remappedWinnerId, nextStates: remappedNextStates };
  });
}

export function calculateFinalHpRatio(
  winnerId: string | null,
  states: Record<string, Pick<PlayerBattleState, "currentHp" | "stats">>,
): number {
  if (!winnerId || !states[winnerId] || states[winnerId].stats.maxHp <= 0) return 0;
  return Number((states[winnerId].currentHp / states[winnerId].stats.maxHp).toFixed(4));
}
