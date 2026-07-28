import type { CharacterStats, CharacterType } from "@/types/game";

export type Difficulty = "normal" | "hard";

export interface BossData {
  floor: number;
  phase: 1 | 2;
  name: string;
  typeName: string;
  imageUrl: string;
  characterType: CharacterType;
  stats: CharacterStats;
}

const boss = (
  floor: number,
  phase: 1 | 2,
  typeName: string,
  characterType: CharacterType,
  hp: number,
  pp: number,
  attack: number,
  defense: number,
  speed: number,
  evasionPct: number,
  imageName: string,
): BossData => ({
  floor,
  phase,
  name: `${floor === 5 ? "ボス" : `第${floor}層のボス`}`,
  typeName,
  imageUrl: `/arttle_boss/${imageName}`,
  characterType,
  stats: {
    hp,
    maxHp: hp,
    pp,
    maxPp: pp,
    attack,
    defense,
    speed,
    evasion: evasionPct / 100,
  },
});

const NORMAL_BOSSES: BossData[] = [
  boss(1, 1, "こうげき型", "attack",   315, 55, 170, 100, 6,  1,  "boss1.png"),
  boss(2, 1, "まほう型",   "magic",    456, 80, 110, 100, 7,  3,  "boss2.png"),
  boss(3, 1, "バリア型",   "defense",  256, 77, 128, 160, 1,  20, "boss3.png"),
  boss(4, 1, "まほう型",   "magic",    666, 88, 128, 128, 7,  6,  "boss4.png"),
  boss(5, 1, "？？？型",   "balanced", 444, 44, 144, 144, 4,  4,  "boss5-1.png"),
  boss(5, 2, "？？？型",   "balanced", 777, 77, 166, 166, 5,  5,  "boss5-2.png"),
];

const HARD_BOSSES: BossData[] = [
  boss(1, 1, "こうげき型", "attack",   355, 55, 199, 100, 7,  3,  "boss1.png"),
  boss(2, 1, "まほう型",   "magic",    499, 80, 125, 115, 9,  5,  "boss2.png"),
  boss(3, 1, "バリア型",   "defense",  256, 77, 128, 200, 1,  25, "boss3.png"),
  boss(4, 1, "まほう型",   "magic",    666, 88, 140, 130, 9,  6,  "boss4.png"),
  boss(5, 1, "？？？型",   "balanced", 444, 44, 144, 144, 4,  4,  "boss5-1.png"),
  boss(5, 2, "？？？型",   "balanced", 999, 99, 177, 177, 6,  5,  "boss5-2.png"),
];

const BOSS_DATA: Record<Difficulty, BossData[]> = {
  normal: NORMAL_BOSSES,
  hard: HARD_BOSSES,
};

export function getBossData(
  floor: number,
  phase: 1 | 2 = 1,
  difficulty: Difficulty = "normal",
): BossData {
  const found = BOSS_DATA[difficulty].find((b) => b.floor === floor && b.phase === phase);
  if (!found) throw new Error(`Boss not found: floor=${floor} phase=${phase} difficulty=${difficulty}`);
  return found;
}
