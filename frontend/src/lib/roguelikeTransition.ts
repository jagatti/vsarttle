import type { CharacterStats, PlayerBattleState } from "@/types/game";

export function applyPlayerStats(player: PlayerBattleState, stats: CharacterStats): PlayerBattleState {
  return {
    ...player,
    stats,
    currentHp: Math.min(stats.maxHp, player.currentHp + Math.max(0, stats.maxHp - player.stats.maxHp)),
    currentPp: Math.min(stats.maxPp, player.currentPp + Math.max(0, stats.maxPp - player.stats.maxPp)),
  };
}

export function carryOverPlayerState(
  player: PlayerBattleState,
  stats: CharacterStats = player.stats,
): PlayerBattleState {
  return {
    ...applyPlayerStats(player, stats),
    chargeMultiplier: 1,
    lastActionCategory: null,
    chargedPreviousTurn: false,
    paralyzedNextTurn: false,
    tieBanActive: false,
    attackBanTurns: 0,
    barrierBanTurns: 0,
    chargeBanTurns: 0,
    magicBanTurns: 0,
  };
}

/**
 * Return a player battle state with HP and PP fully restored to their maximum values.
 */
export function healPlayerFully(player: PlayerBattleState): PlayerBattleState {
  return {
    ...carryOverPlayerState(player),
    currentHp: player.stats.maxHp,
    currentPp: player.stats.maxPp,
  };
}

/**
 * Return player stats with HP and PP maxHp/maxPp fully restored to their maximum values.
 * (For updating the characters array in multi-character mode.)
 */
export function healCharacterStats(stats: CharacterStats): CharacterStats {
  return { ...stats };
}
