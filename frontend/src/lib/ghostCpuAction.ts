import { getAvailableActions } from "@/lib/battleLogic";
import type { ActionType, PlayerBattleState } from "@/types/game";

export const FLOOR5_BOSS_CHARGE_HP_THRESHOLD = 0.3;
export type GhostCpuActionWeights = Partial<Record<ActionType, number>>;

export function getGhostCpuActionWeights(characterType: PlayerBattleState["characterType"]): GhostCpuActionWeights {
  if (characterType === "attack") return { attack: 4, magicWeak: 1, magicStrong: 1, barrier: 1, charge: 1 };
  if (characterType === "magic") return { attack: 1, magicWeak: 4, magicStrong: 2, barrier: 1, charge: 1 };
  if (characterType === "defense") return { attack: 1, magicWeak: 1, magicStrong: 1, barrier: 4, charge: 2 };
  return { attack: 1, magicWeak: 1, magicStrong: 1, barrier: 1, charge: 1 };
}

export function pickGhostCpuAction(
  enemy: PlayerBattleState,
  turn: number,
  options: {
    chargeAllowedHpRatio?: number;
    weights?: GhostCpuActionWeights;
    random?: () => number;
  } = {},
): ActionType {
  if (enemy.forceMagicStrongAction) return "magicStrong";

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
  const weights = options.weights;
  if (!weights) return available[Math.floor(random() * available.length)] ?? "paralysis";
  const weightedAvailable = available.map((action) => ({ action, weight: Math.max(0, weights[action] ?? 0) })).filter((entry) => entry.weight > 0);
  const totalWeight = weightedAvailable.reduce((total, entry) => total + entry.weight, 0);
  if (totalWeight <= 0) return available[Math.floor(random() * available.length)] ?? "paralysis";
  let target = random() * totalWeight;
  for (const entry of weightedAvailable) {
    target -= entry.weight;
    if (target < 0) return entry.action;
  }
  return weightedAvailable[weightedAvailable.length - 1]?.action ?? "paralysis";
}
