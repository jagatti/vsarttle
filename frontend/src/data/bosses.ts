import type { CharacterStats, CharacterType } from "@/types/game";

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

export const BOSSES: BossData[] = [
  boss(1, 1, "こうげき型", "attack",   355, 55, 199, 100, 7,  5,  "boss1.png"),
  boss(2, 1, "まほう型",   "magic",    500, 80, 125, 120, 9,  8,  "boss2.png"),
  boss(3, 1, "バリア型",   "defense",  256, 77, 150, 200, 1,  33, "boss3.png"),
  boss(4, 1, "まほう型",   "magic",    666, 88, 150, 150, 9,  9,  "boss4.png"),
  boss(5, 1, "？？？型",   "balanced", 444, 44, 144, 144, 4,  4,  "boss5-1.png"),
  boss(5, 2, "？？？型",   "balanced", 999, 99, 188, 177, 6,  6,  "boss5-2.png"),
];

export function getBossData(floor: number, phase: 1 | 2 = 1): BossData {
  const found = BOSSES.find((b) => b.floor === floor && b.phase === phase);
  if (!found) throw new Error(`Boss not found: floor=${floor} phase=${phase}`);
  return found;
}
