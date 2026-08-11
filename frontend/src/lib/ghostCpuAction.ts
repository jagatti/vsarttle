import { getAvailableActions } from "@/lib/battleLogic";
import type { ActionType, PlayerBattleState } from "@/types/game";

export const FLOOR5_BOSS_CHARGE_HP_THRESHOLD = 0.3;

export function pickGhostCpuAction(
  enemy: PlayerBattleState,
  turn: number,
  options: {
    chargeAllowedHpRatio?: number;
    random?: () => number;
  } = {},
): ActionType {
  if (enemy.limitBreakActive) return "magicStrong";

  let available = getAvailableActions(enemy, turn);
  if (options.chargeAllowedHpRatio !== undefined) {
    const hpRatio = enemy.stats.maxHp > 0 ? enemy.currentHp / enemy.stats.maxHp : 0;
    if (hpRatio > options.chargeAllowedHpRatio) {
      const withoutCharge = available.filter((action) => action !== "charge");
      if (withoutCharge.length > 0) available = withoutCharge;
    }
  }

  if (available.length === 0) return "paralysis";
  const random = options.random ?? Math.random;
  return available[Math.floor(random() * available.length)] ?? "paralysis";
}
