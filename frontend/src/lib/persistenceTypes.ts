import { scoreRankToPoint, type ScoreRank } from "@/lib/scoreRank";
import type { CharacterStats, CharacterType, TurnResult } from "@/types/game";
import type { Difficulty } from "@/data/bosses";

export type MatchSource = "multiplayer" | "singleplay";

// Single-play best scores should only reflect a run that cleared every floor
// (i.e. the total score), not an individual floor's rank.
export const SINGLEPLAY_TOTAL_FLOORS = 5;

export interface MatchPlayerRecord {
  playerId: string | null;
  nickname: string;
  characterType: CharacterType;
  stats: CharacterStats;
  drawingThumbnail: string;
}

export interface SinglePlayResultRecord {
  floor: number;
  scoreRank: ScoreRank;
  difficulty: Difficulty;
}

export interface MatchRecord {
  matchId: string;
  playedAt: string;
  battleMode: "simple" | "custom";
  source: MatchSource;
  players: MatchPlayerRecord[];
  winnerId: string | null;
  turnCount: number;
  finalHpRatio: number;
  singlePlayResult: SinglePlayResultRecord | null;
  rating: number | null;
}

export interface MatchSubmissionPayload {
  match: MatchRecord;
  turnResults?: Pick<TurnResult, "turn" | "winnerId" | "nextStates">[];
}

export interface PlayerRecord {
  playerId: string;
  nickname: string;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  typeUsageCount: Record<CharacterType, number>;
  singlePlay: Record<Difficulty, {
    bestFloorCleared: number;
    bestScoreRank: ScoreRank | null;
  }>;
  rating: number | null;
  updatedAt: string;
}

export interface PlayerProfileResponse {
  player: PlayerRecord;
  recentMatches: MatchRecord[];
  storageBackend: StorageBackend;
}

export type StorageBackend = "vercel-kv" | "local-file";

export function createEmptyTypeUsageCount(): Record<CharacterType, number> {
  return {
    attack: 0,
    magic: 0,
    defense: 0,
    balanced: 0,
  };
}

export function normalizeNickname(nickname: string): string {
  const trimmed = nickname.trim().slice(0, 16);
  return trimmed || "プレイヤー";
}

export function isScoreRank(value: unknown): value is ScoreRank {
  return value === "SS" || value === "S" || value === "A" || value === "B" || value === "C";
}

export function compareScoreRank(a: ScoreRank | null, b: ScoreRank | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return scoreRankToPoint(a) - scoreRankToPoint(b);
}

export function createEmptyPlayerRecord(playerId: string, nickname: string, updatedAt: string): PlayerRecord {
  return {
    playerId,
    nickname: normalizeNickname(nickname),
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
    typeUsageCount: createEmptyTypeUsageCount(),
    singlePlay: {
      normal: {
        bestFloorCleared: 0,
        bestScoreRank: null,
      },
      hard: {
        bestFloorCleared: 0,
        bestScoreRank: null,
      },
    },
    rating: null,
    updatedAt,
  };
}
