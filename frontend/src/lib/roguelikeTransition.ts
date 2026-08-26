import type { CharacterStats, PlayerBattleState } from "@/types/game";

/**
 * Return a player battle state with HP and PP fully restored to their maximum values.
 */
export function healPlayerFully(player: PlayerBattleState): PlayerBattleState {
  return {
    ...player,
    currentHp: player.stats.maxHp,
    currentPp: player.stats.maxPp,
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
 * Return player stats with HP and PP maxHp/maxPp fully restored to their maximum values.
 * (For updating the characters array in multi-character mode.)
 */
export function healCharacterStats(stats: CharacterStats): CharacterStats {
  return { ...stats };
}
