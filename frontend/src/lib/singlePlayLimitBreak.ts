import type { PlayerBattleState } from "@/types/game";

export const LIMIT_BREAK_BGM_PATH = "/sounds/bgm/boss5-3_loop.mp3";
export const LIMIT_BREAK_MAX_STAT = 999;
export const LIMIT_BREAK_STAT_REVEAL_INTERVAL_MS = 2000;
export const LIMIT_BREAK_POST_REVEAL_DELAY_MS = 3000;

// When the floor 5 phase 2 boss would otherwise be defeated for the first
// time, it instead visibly survives with 1 HP left, glowing (reusing the
// existing チャージ aura effect) for this long before the limit break
// stat-reveal overlay takes over.
export const LIMIT_BREAK_SURVIVE_HP = 1;
export const LIMIT_BREAK_SURVIVE_GLOW_MS = 2000;
// Any value greater than 1 triggers the チャージ glow visual around the
// portrait; this matches the multiplier used elsewhere for a real charge.
export const LIMIT_BREAK_SURVIVE_CHARGE_MULTIPLIER = 1.5;

// Returns a version of the boss that visually endures the killing blow with
// 1 HP remaining and the チャージ glow active, instead of being defeated.
export function applySinglePlayLimitBreakSurvive(enemy: PlayerBattleState): PlayerBattleState {
  return {
    ...enemy,
    currentHp: LIMIT_BREAK_SURVIVE_HP,
    chargeMultiplier: LIMIT_BREAK_SURVIVE_CHARGE_MULTIPLIER,
  };
}

export function applySinglePlayLimitBreak(enemy: PlayerBattleState): PlayerBattleState {
  return {
    ...enemy,
    currentHp: LIMIT_BREAK_MAX_STAT,
    currentPp: LIMIT_BREAK_MAX_STAT,
    stats: {
      ...enemy.stats,
      hp: LIMIT_BREAK_MAX_STAT,
      maxHp: LIMIT_BREAK_MAX_STAT,
      pp: LIMIT_BREAK_MAX_STAT,
      maxPp: LIMIT_BREAK_MAX_STAT,
      attack: LIMIT_BREAK_MAX_STAT,
      defense: LIMIT_BREAK_MAX_STAT,
      speed: LIMIT_BREAK_MAX_STAT,
      evasion: 0,
    },
    limitBreakUsed: true,
    limitBreakActive: true,
  };
}

export function getSinglePlayLimitBreakStatusLines(enemy: Pick<PlayerBattleState, "currentHp" | "currentPp" | "stats">): string[] {
  return [
    `HP ${enemy.currentHp}/${enemy.stats.maxHp}`,
    `PP ${enemy.currentPp}/${enemy.stats.maxPp}`,
    `攻撃力 ${enemy.stats.attack}`,
    `防御力 ${enemy.stats.defense}`,
    `速度 ${enemy.stats.speed}`,
  ];
}

export function getSinglePlayLimitBreakDisplayDurationMs(statusCount: number): number {
  return Math.max(statusCount - 1, 0) * LIMIT_BREAK_STAT_REVEAL_INTERVAL_MS + LIMIT_BREAK_POST_REVEAL_DELAY_MS;
}
