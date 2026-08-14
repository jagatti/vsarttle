import type { MatchRecord } from "@/lib/persistenceTypes";
import type { PlayerBattleState, TurnResult } from "@/types/game";

const MAX_THUMBNAIL_LENGTH = 250_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isThumbnail(value: string): boolean {
  return value.startsWith("data:image/") && value.length <= MAX_THUMBNAIL_LENGTH;
}

function isGhostThumbnail(value: string): boolean {
  return isThumbnail(value) || value.startsWith("/");
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

export function validateMatchReasonString(
  match: MatchRecord,
  turnResults?: Pick<TurnResult, "turn" | "winnerId" | "nextStates">[],
): string {
  if (!match.matchId || !match.playedAt) return "missing_match_id_or_played_at";
  if (match.source !== "multiplayer" && match.source !== "singleplay" && match.source !== "ghostmatch" && match.source !== "roguelike")
    return "invalid_source";
  if (match.battleMode !== "simple" && match.battleMode !== "custom") return "invalid_battle_mode";
  if (!Number.isInteger(match.turnCount) || match.turnCount < 1) return "invalid_turn_count";
  if (!isFiniteNumber(match.finalHpRatio) || match.finalHpRatio < 0 || match.finalHpRatio > 1)
    return "invalid_final_hp_ratio";
  if (!Array.isArray(match.players) || match.players.length === 0 || match.players.length > 2)
    return "invalid_players_array";
  if (!match.players.every((player) => player.nickname.trim().length > 0)) return "blank_nickname";
  if (match.source === "ghostmatch") {
    if (!match.players.every((player) => isGhostThumbnail(player.drawingThumbnail)))
      return "thumbnail_too_large_or_invalid";
  } else if (!match.players.every((player) => isThumbnail(player.drawingThumbnail)))
    return "thumbnail_too_large_or_invalid";
  if (match.source === "singleplay" && !match.singlePlayResult) return "missing_singleplay_result";
  if (match.source === "roguelike" && !match.roguelikeResult) return "missing_roguelike_result";
  if ((match.source === "ghostmatch" || match.source === "multiplayer" || match.source === "roguelike") && match.singlePlayResult !== null) return "unexpected_singleplay_result";
  if ((match.source === "ghostmatch" || match.source === "multiplayer" || match.source === "singleplay") && match.roguelikeResult !== null) return "unexpected_roguelike_result";
  if (match.singlePlayResult && (match.singlePlayResult.floor < 1 || match.singlePlayResult.floor > 5))
    return "invalid_singleplay_floor";
  if (
    match.singlePlayResult &&
    match.singlePlayResult.difficulty !== "normal" &&
    match.singlePlayResult.difficulty !== "hard"
  )
    return "invalid_singleplay_difficulty";
  if (match.roguelikeResult && (match.roguelikeResult.floorReached < 1 || match.roguelikeResult.floorReached > 20))
    return "invalid_roguelike_floor";
  if (match.roguelikeResult && typeof match.roguelikeResult.cleared !== "boolean")
    return "invalid_roguelike_clear_flag";
  if (
    match.source === "ghostmatch" &&
    match.ghostOpponentPlayerId &&
    !match.players.some((player) => player.playerId === match.ghostOpponentPlayerId)
  )
    return "ghost_opponent_id_not_in_players";

  // Beyond shape validation
  if (match.source === "singleplay") {
    if (!match.players.some((player) => player.playerId !== null)) return "singleplay_missing_real_player";
    return "ok";
  }
  if (match.source === "roguelike") {
    if (!match.players.some((player) => player.playerId !== null)) return "roguelike_missing_real_player";
    return "ok";
  }
  if (match.source === "ghostmatch") {
    const playerIds = match.players
      .map((player) => player.playerId)
      .filter((playerId): playerId is string => !!playerId);
    if (playerIds.length === 0) return "ghostmatch_no_real_player";
    if (match.winnerId !== null && !playerIds.includes(match.winnerId)) return "winner_not_in_players";
    return "ok";
  }

  if (!turnResults || turnResults.length !== match.turnCount) return "invalid_turn_sequence";
  if (!isSequentialTurns(turnResults)) return "invalid_turn_sequence";
  const lastTurn = getLastTurnState(turnResults);
  if (!lastTurn) return "invalid_turn_sequence";
  if (lastTurn.winnerId !== match.winnerId) return "winner_mismatch";
  if (match.winnerId === null) {
    if (match.finalHpRatio !== 0) return "draw_final_hp_ratio_nonzero";
    return "ok";
  }
  const winnerState = lastTurn.nextStates[match.winnerId];
  if (!hasValidHp(winnerState)) return "invalid_winner_hp";
  const expectedRatio = winnerState.currentHp / winnerState.stats.maxHp;
  if (Math.abs(expectedRatio - match.finalHpRatio) > 0.005) return "final_hp_ratio_mismatch";
  const playerIds = match.players
    .map((player) => player.playerId)
    .filter((playerId): playerId is string => !!playerId);
  if (!playerIds.includes(match.winnerId)) return "winner_not_in_players";
  if (!playerIds.every((playerId) => hasValidHp(lastTurn.nextStates[playerId]))) return "invalid_player_hp";
  return "ok";
}

export function validateMatchRecordShape(match: MatchRecord): boolean {
  if (!match.matchId || !match.playedAt) return false;
  if (match.source !== "multiplayer" && match.source !== "singleplay" && match.source !== "ghostmatch" && match.source !== "roguelike") return false;
  if (match.battleMode !== "simple" && match.battleMode !== "custom") return false;
  if (!Number.isInteger(match.turnCount) || match.turnCount < 1) return false;
  if (!isFiniteNumber(match.finalHpRatio) || match.finalHpRatio < 0 || match.finalHpRatio > 1) return false;
  if (!Array.isArray(match.players) || match.players.length === 0 || match.players.length > 2) return false;
  if (!match.players.every((player) => player.nickname.trim().length > 0)) return false;
  if (match.source === "ghostmatch") {
    if (!match.players.every((player) => isGhostThumbnail(player.drawingThumbnail))) return false;
  } else if (!match.players.every((player) => isThumbnail(player.drawingThumbnail))) return false;
  if (match.source === "singleplay" && !match.singlePlayResult) return false;
  if (match.source === "roguelike" && !match.roguelikeResult) return false;
  if ((match.source === "ghostmatch" || match.source === "multiplayer" || match.source === "roguelike") && match.singlePlayResult !== null) return false;
  if ((match.source === "ghostmatch" || match.source === "multiplayer" || match.source === "singleplay") && match.roguelikeResult !== null) return false;
  if (match.singlePlayResult && (match.singlePlayResult.floor < 1 || match.singlePlayResult.floor > 5)) return false;
  if (match.singlePlayResult && match.singlePlayResult.difficulty !== "normal" && match.singlePlayResult.difficulty !== "hard") return false;
  if (match.roguelikeResult && (match.roguelikeResult.floorReached < 1 || match.roguelikeResult.floorReached > 20)) return false;
  if (
    match.source === "ghostmatch" &&
    match.ghostOpponentPlayerId &&
    !match.players.some((player) => player.playerId === match.ghostOpponentPlayerId)
  ) {
    return false;
  }
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

  if (match.source === "roguelike") {
    return match.players.some((player) => player.playerId !== null);
  }

  if (match.source === "ghostmatch") {
    const playerIds = match.players.map((player) => player.playerId).filter((playerId): playerId is string => !!playerId);
    if (playerIds.length === 0) return false;
    if (match.winnerId === null) return true;
    return playerIds.includes(match.winnerId);
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
