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
  5:  { imageUrl: "/arttle_boss/boss1.png",   characterType: "attack",   name: "第5層のボス",  hp: 260,  pp: 50,  attack: 145, defense: 90,  speed: 5,  evasion: 0.02 },
  10: { imageUrl: "/arttle_boss/boss2.png",   characterType: "magic",    name: "第10層のボス", hp: 480,  pp: 88,  attack: 135, defense: 150, speed: 8,  evasion: 0.04 },
  13: { imageUrl: "/arttle_boss/boss3.png",   characterType: "defense",  name: "第13層のボス", hp: 410,  pp: 77,  attack: 135, defense: 246, speed: 1,  evasion: 0.22 },
  16: { imageUrl: "/arttle_boss/boss4.png",   characterType: "magic",    name: "第16層のボス", hp: 666,  pp: 128, attack: 220, defense: 220, speed: 9,  evasion: 0.06 },
  17: { imageUrl: "/arttle_boss/boss17.png",  characterType: "balanced", name: "第17層のボス", hp: 800,  pp: 150, attack: 280, defense: 280, speed: 10, evasion: 0 },
  18: { imageUrl: "/arttle_boss/boss5-1.png", characterType: "balanced", name: "第18層のボス", hp: 900,  pp: 130, attack: 260, defense: 260, speed: 10, evasion: 0 },
  19: { imageUrl: "/arttle_boss/boss5-2.png", characterType: "balanced", name: "第19層のボス", hp: 999,  pp: 160, attack: 380, defense: 300, speed: 14, evasion: 0 },
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
