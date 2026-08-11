import {
  compareScoreRank,
  createEmptyPlayerRecord,
  normalizeNickname,
  SINGLEPLAY_TOTAL_FLOORS,
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
      const { floor, scoreRank, difficulty } = match.singlePlayResult;
      const existingDifficultyBest = existing.singlePlay[difficulty];
      next.singlePlay = {
        ...existing.singlePlay,
        [difficulty]: {
          bestFloorCleared: Math.max(existingDifficultyBest.bestFloorCleared, floor),
          // Only a run that cleared every floor represents the total score,
          // so per-floor clears must not overwrite the best total rank.
          bestScoreRank:
            floor === SINGLEPLAY_TOTAL_FLOORS && compareScoreRank(scoreRank, existingDifficultyBest.bestScoreRank) > 0
              ? scoreRank
              : existingDifficultyBest.bestScoreRank,
        },
      };
    }

    nextPlayers[player.playerId] = next;
  }

  return nextPlayers;
}
