import { getBossData } from "@/data/bosses";
import { applySinglePlayLimitBreak } from "@/lib/singlePlayLimitBreak";
import type { PlayerBattleState } from "@/types/game";

export interface RoguelikeBossInfo {
  id: string;
  name: string;
  imageDataUrl: string;
  state: PlayerBattleState;
}

export function buildRoguelikeBossState(floor: number): PlayerBattleState {
  if (floor === 5) return bossFromData(floor, getBossData(1, 1, "normal"));
  if (floor === 10) return bossFromData(floor, getBossData(2, 1, "normal"));
  if (floor === 13) return bossFromData(floor, getBossData(3, 1, "normal"));
  if (floor === 16) return bossFromData(floor, getBossData(4, 1, "normal"));
  if (floor === 17) return buildBoss17();
  if (floor === 18) return withZeroEvasion(bossFromData(floor, getBossData(5, 1, "normal")));
  if (floor === 19) return withZeroEvasion(bossFromData(floor, getBossData(5, 2, "normal")));
  if (floor === 20) {
    const base = withZeroEvasion(bossFromData(19, getBossData(5, 2, "normal")));
    const limitBroken = applySinglePlayLimitBreak(base);
    return { ...limitBroken, id: "rl-boss-20", nickname: "第20層のボス", stats: { ...limitBroken.stats, evasion: 0 } };
  }
  throw new Error(`No boss for roguelike floor ${floor}`);
}

function bossFromData(floor: number, boss: ReturnType<typeof getBossData>): PlayerBattleState {
  return {
    id: `rl-boss-${floor}`,
    nickname: `第${floor}層のボス`,
    imageDataUrl: boss.imageUrl,
    stats: boss.stats,
    characterType: boss.characterType,
    currentHp: boss.stats.maxHp,
    currentPp: boss.stats.maxPp,
    chargeMultiplier: 1,
    lastActionCategory: null,
  };
}

function buildBoss17(): PlayerBattleState {
  const hp = 700;
  const pp = 150;
  return {
    id: "rl-boss-17",
    nickname: "第17層のボス",
    imageDataUrl: "/arttle_boss/boss17.png",
    characterType: "balanced",
    stats: { hp, maxHp: hp, pp, maxPp: pp, attack: 300, defense: 200, speed: 6, evasion: 0 },
    currentHp: hp,
    currentPp: pp,
    chargeMultiplier: 1,
    lastActionCategory: null,
  };
}

function withZeroEvasion(state: PlayerBattleState): PlayerBattleState {
  return { ...state, stats: { ...state.stats, evasion: 0 } };
}
