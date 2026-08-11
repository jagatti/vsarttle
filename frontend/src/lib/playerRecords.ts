import {
  compareScoreRank,
  createEmptyPlayerRecord,
  normalizeNickname,
  type MatchRecord,
  type PlayerRecord,
} from "@/lib/persistenceTypes";

export function applyMatchToPlayerRecords(
  currentPlayers: Record<string, PlayerRecord>,
  match: MatchRecord,
): Record<string, PlayerRecord> {
  const nextPlayers = { ...currentPlayers };

  for (const player of match.players) {
    if (!player.playerId) continue;
    const existing = nextPlayers[player.playerId] ?? createEmptyPlayerRecord(player.playerId, player.nickname, match.playedAt);
    const next: PlayerRecord = {
      ...existing,
      nickname: normalizeNickname(player.nickname),
      typeUsageCount: {
        ...existing.typeUsageCount,
        [player.characterType]: existing.typeUsageCount[player.characterType] + 1,
      },
      updatedAt: match.playedAt,
    };

    if (match.source === "multiplayer") {
      if (match.winnerId === null) {
        next.draws += 1;
        next.currentStreak = 0;
      } else if (match.winnerId === player.playerId) {
        next.wins += 1;
        next.currentStreak += 1;
        next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
      } else {
        next.losses += 1;
        next.currentStreak = 0;
      }
    }

    if (match.source === "singleplay" && match.singlePlayResult) {
      next.singlePlay = {
        bestFloorCleared: Math.max(next.singlePlay.bestFloorCleared, match.singlePlayResult.floor),
        bestScoreRank:
          compareScoreRank(match.singlePlayResult.scoreRank, next.singlePlay.bestScoreRank) > 0
            ? match.singlePlayResult.scoreRank
            : next.singlePlay.bestScoreRank,
      };
    }

    nextPlayers[player.playerId] = next;
  }

  return nextPlayers;
}
