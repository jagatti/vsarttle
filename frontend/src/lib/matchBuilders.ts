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

export function calculateFinalHpRatio(
  winnerId: string | null,
  states: Record<string, Pick<PlayerBattleState, "currentHp" | "stats">>,
): number {
  if (!winnerId || !states[winnerId] || states[winnerId].stats.maxHp <= 0) return 0;
  return Number((states[winnerId].currentHp / states[winnerId].stats.maxHp).toFixed(4));
}
