import type { MatchRecord } from "@/lib/persistenceTypes";
import type { PlayerBattleState, TurnResult } from "@/types/game";

const MAX_THUMBNAIL_LENGTH = 250_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isThumbnail(value: string): boolean {
  return value.startsWith("data:image/") && value.length <= MAX_THUMBNAIL_LENGTH;
}

function getLastTurnState(
  turnResults: Pick<TurnResult, "turn" | "winnerId" | "nextStates">[] | undefined,
): Pick<TurnResult, "turn" | "winnerId" | "nextStates"> | null {
  if (!turnResults || turnResults.length === 0) return null;
  return turnResults[turnResults.length - 1] ?? null;
}

function isSequentialTurns(turnResults: Pick<TurnResult, "turn">[]): boolean {
  return turnResults.every((turnResult, index) => turnResult.turn === index + 1);
}

function hasValidHp(state: PlayerBattleState | undefined): boolean {
  if (!state) return false;
  return state.currentHp >= 0 && state.currentHp <= state.stats.maxHp && state.stats.maxHp > 0;
}

export function validateMatchRecordShape(match: MatchRecord): boolean {
  if (!match.matchId || !match.playedAt) return false;
  if (match.source !== "multiplayer" && match.source !== "singleplay") return false;
  if (match.battleMode !== "simple" && match.battleMode !== "custom") return false;
  if (!Number.isInteger(match.turnCount) || match.turnCount < 1) return false;
  if (!isFiniteNumber(match.finalHpRatio) || match.finalHpRatio < 0 || match.finalHpRatio > 1) return false;
  if (!Array.isArray(match.players) || match.players.length === 0 || match.players.length > 2) return false;
  if (!match.players.every((player) => player.nickname.trim().length > 0 && isThumbnail(player.drawingThumbnail))) return false;
  if (match.source === "singleplay" && !match.singlePlayResult) return false;
  if (match.source === "multiplayer" && match.singlePlayResult !== null) return false;
  if (match.singlePlayResult && (match.singlePlayResult.floor < 1 || match.singlePlayResult.floor > 5)) return false;
  return true;
}

export function passesMatchSanity(
  match: MatchRecord,
  turnResults?: Pick<TurnResult, "turn" | "winnerId" | "nextStates">[],
): boolean {
  if (!validateMatchRecordShape(match)) return false;

  if (match.source === "singleplay") {
    return match.players.some((player) => player.playerId !== null);
  }

  if (!turnResults || turnResults.length !== match.turnCount || !isSequentialTurns(turnResults)) return false;
  const lastTurn = getLastTurnState(turnResults);
  if (!lastTurn) return false;
  if (lastTurn.winnerId !== match.winnerId) return false;

  if (match.winnerId === null) {
    return match.finalHpRatio === 0;
  }

  const winnerState = lastTurn.nextStates[match.winnerId];
  if (!hasValidHp(winnerState)) return false;
  const expectedRatio = winnerState.currentHp / winnerState.stats.maxHp;
  if (Math.abs(expectedRatio - match.finalHpRatio) > 0.005) return false;

  const playerIds = match.players.map((player) => player.playerId).filter((playerId): playerId is string => !!playerId);
  if (!playerIds.includes(match.winnerId)) return false;

  return playerIds.every((playerId) => hasValidHp(lastTurn.nextStates[playerId]));
}
