import { LIMIT_BREAK_MAX_STAT } from "@/lib/singlePlayLimitBreak";
import type { CharacterStats, CharacterType, PlayerBattleState } from "@/types/game";

export interface RoguelikeBossInfo {
  id: string;
  name: string;
  imageDataUrl: string;
  state: PlayerBattleState;
}

interface RoguelikeBossSpec {
  imageUrl: string;
  characterType: CharacterType;
  name: string;
  hp: number;
  pp: number;
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
}

const ROGUELIKE_BOSS_SPECS: Record<number, RoguelikeBossSpec> = {
  5:  { imageUrl: "/arttle_boss/boss1.png",   characterType: "attack",   name: "第5層のボス",  hp: 355,  pp: 55,  attack: 199, defense: 100, speed: 7,   evasion: 0.03 },
  10: { imageUrl: "/arttle_boss/boss2.png",   characterType: "magic",    name: "第10層のボス", hp: 499,  pp: 80,  attack: 125, defense: 115, speed: 9,   evasion: 0.05 },
  13: { imageUrl: "/arttle_boss/boss3.png",   characterType: "defense",  name: "第13層のボス", hp: 394,  pp: 77,  attack: 128, defense: 200, speed: 1,   evasion: 0.25 },
  16: { imageUrl: "/arttle_boss/boss4.png",   characterType: "magic",    name: "第16層のボス", hp: 666,  pp: 99,  attack: 160, defense: 150, speed: 9,   evasion: 0.06 },
  17: { imageUrl: "/arttle_boss/boss17.png",  characterType: "balanced", name: "第17層のボス", hp: 800,  pp: 150, attack: 250, defense: 300, speed: 9,   evasion: 0 },
  18: { imageUrl: "/arttle_boss/boss5-1.png", characterType: "balanced", name: "第18層のボス", hp: 777,  pp: 77,  attack: 177, defense: 177, speed: 7,   evasion: 0 },
  19: { imageUrl: "/arttle_boss/boss5-2.png", characterType: "balanced", name: "第19層のボス", hp: 999,  pp: 122, attack: 222, defense: 222, speed: 22,  evasion: 0 },
};

export function buildRoguelikeBossState(floor: number): PlayerBattleState {
  if (floor === 20) {
    return {
      id: "rl-boss-20",
      nickname: "第20層のボス",
      imageDataUrl: "/arttle_boss/boss5-2.png",
      characterType: "balanced",
      stats: {
        hp: LIMIT_BREAK_MAX_STAT, maxHp: LIMIT_BREAK_MAX_STAT,
        pp: LIMIT_BREAK_MAX_STAT, maxPp: LIMIT_BREAK_MAX_STAT,
        attack: LIMIT_BREAK_MAX_STAT,
        defense: LIMIT_BREAK_MAX_STAT,
        speed: LIMIT_BREAK_MAX_STAT,
        evasion: 0,
      } satisfies CharacterStats,
      currentHp: LIMIT_BREAK_MAX_STAT,
      currentPp: LIMIT_BREAK_MAX_STAT,
      chargeMultiplier: 1,
      lastActionCategory: null,
      limitBreakUsed: true,
      limitBreakActive: true,
      forceMagicStrongAction: false,
    };
  }

  const spec = ROGUELIKE_BOSS_SPECS[floor];
  if (!spec) throw new Error(`No roguelike boss spec for floor ${floor}`);
  return specToState(floor, spec);
}

function specToState(floor: number, spec: RoguelikeBossSpec): PlayerBattleState {
  const stats: CharacterStats = {
    hp: spec.hp, maxHp: spec.hp,
    pp: spec.pp, maxPp: spec.pp,
    attack: spec.attack,
    defense: spec.defense,
    speed: spec.speed,
    evasion: spec.evasion,
  };
  return {
    id: `rl-boss-${floor}`,
    nickname: spec.name,
    imageDataUrl: spec.imageUrl,
    characterType: spec.characterType,
    stats,
    currentHp: spec.hp,
    currentPp: spec.pp,
    chargeMultiplier: 1,
    lastActionCategory: null,
  };
}
