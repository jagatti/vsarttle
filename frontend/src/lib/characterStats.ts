import type { CharacterStats, PlayerBattleState } from "@/types/game";

/**
 * Returns the effective stats for a player at the current moment in battle.
 *
 * Currently this simply returns `player.stats`, which already incorporates any
 * permanent bonuses applied at character-creation time (e.g. enhancementSlot).
 *
 * This function exists as an extension point: when temporary in-battle stat
 * modifiers (buffs, debuffs, etc.) are added to `PlayerBattleState`, update
 * this function to apply them on top of `player.stats` so that all UI surfaces
 * automatically reflect the true effective values.
 */
export function getEffectiveStats(player: PlayerBattleState): CharacterStats {
  return player.stats;
}
