import type { CharacterStats, CharacterType } from "@/types/game";

export const ROGUELIKE_TOTAL_FLOORS = 20;
export const ROGUELIKE_PLAYER_INITIAL_STATS: CharacterStats = {
  hp: 250,
  maxHp: 250,
  pp: 50,
  maxPp: 50,
  attack: 100,
  defense: 100,
  speed: 1,
  evasion: 0.01,
};

export interface RoguelikeFloorBand {
  floors: number[];
  base: { hp: number; pp: number; attack: number; defense: number; speed: number; evasion: number };
  upgradeAdd: { hp: number; pp: number; attack: number; defense: number; speed: number; evasion: number };
}

export const ROGUELIKE_FLOOR_BANDS: RoguelikeFloorBand[] = [
  { floors: [1, 2, 3, 4], base: { hp: 160, pp: 30, attack: 65, defense: 65, speed: 1, evasion: 0.01 }, upgradeAdd: { hp: 35, pp: 9, attack: 14, defense: 10, speed: 3, evasion: 0.01 } },
  { floors: [6, 7, 8, 9], base: { hp: 355, pp: 35, attack: 70, defense: 70, speed: 2, evasion: 0.01 }, upgradeAdd: { hp: 70, pp: 18, attack: 21, defense: 15, speed: 3, evasion: 0.01 } },
  { floors: [11, 12], base: { hp: 385, pp: 44, attack: 160, defense: 75, speed: 3, evasion: 0.01 }, upgradeAdd: { hp: 120, pp: 28, attack: 30, defense: 35, speed: 5, evasion: 0.02 } },
  { floors: [14, 15], base: { hp: 411, pp: 47, attack: 174, defense: 84, speed: 5, evasion: 0.01 }, upgradeAdd: { hp: 125, pp: 30, attack: 35, defense: 35, speed: 5, evasion: 0.02 } },
];

export function getFloorBand(floor: number): RoguelikeFloorBand | null {
  return ROGUELIKE_FLOOR_BANDS.find((band) => band.floors.includes(floor)) ?? null;
}

export function applyTypeCorrection(
  base: { pp: number; attack: number; defense: number },
  characterType: CharacterType,
): { pp: number; attack: number; defense: number } {
  const ceil = Math.ceil;
  if (characterType === "attack") return { ...base, attack: ceil(base.attack * 1.5) };
  if (characterType === "magic") return { ...base, pp: ceil(base.pp * 1.5) };
  if (characterType === "defense") return { ...base, defense: ceil(base.defense * 1.5) };
  if (characterType === "balanced") {
    return {
      pp: ceil(base.pp * 1.2),
      attack: ceil(base.attack * 1.2),
      defense: ceil(base.defense * 1.2),
    };
  }
  return base;
}

export function buildWeakEnemyStats(floor: number, characterType: CharacterType): CharacterStats {
  const band = getFloorBand(floor);
  if (!band) throw new Error(`Floor ${floor} is not a weak enemy floor`);

  const corrected = applyTypeCorrection(
    { pp: band.base.pp, attack: band.base.attack, defense: band.base.defense },
    characterType,
  );
  const hp = band.base.hp;

  return {
    hp,
    maxHp: hp,
    pp: corrected.pp,
    maxPp: corrected.pp,
    attack: corrected.attack,
    defense: corrected.defense,
    speed: band.base.speed,
    evasion: band.base.evasion,
  };
}

export type UpgradeStatKey = "hp" | "pp" | "attack" | "defense" | "speed" | "evasion";

export function getUpgradeAddAmounts(floor: number): Record<UpgradeStatKey, number> {
  const band = getFloorBand(floor);
  if (!band) throw new Error(`Floor ${floor} is not a weak enemy floor`);
  return band.upgradeAdd as Record<UpgradeStatKey, number>;
}

export function pickRandomUpgradeSlots(
  floor: number,
  count = 3,
  random: () => number = Math.random,
): UpgradeStatKey[] {
  const band = getFloorBand(floor);
  if (!band) throw new Error(`Floor ${floor} is not a weak enemy floor`);

  const arr: UpgradeStatKey[] = ["hp", "pp", "attack", "defense", "speed", "evasion"];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.slice(0, count);
}

export function applyUpgrade(stats: CharacterStats, key: UpgradeStatKey, amount: number): CharacterStats {
  if (key === "hp") {
    return { ...stats, hp: stats.hp + amount, maxHp: stats.maxHp + amount };
  }
  if (key === "pp") {
    return { ...stats, pp: stats.pp + amount, maxPp: stats.maxPp + amount };
  }
  if (key === "evasion") {
    return { ...stats, evasion: Math.min(0.95, stats.evasion + amount) };
  }
  return { ...stats, [key]: stats[key] + amount };
}

export function applyBossUpgrade(stats: CharacterStats, floor: number): CharacterStats {
  if (floor === 5) return { ...stats, attack: stats.attack * 2 };
  if (floor === 10) return { ...stats, pp: stats.pp * 2, maxPp: stats.maxPp * 2 };
  if (floor === 13) return { ...stats, defense: stats.defense * 2 };
  if (floor === 16) return { ...stats, hp: stats.hp * 2, maxHp: stats.maxHp * 2 };
  if (floor === 17) return { ...stats, hp: stats.hp * 2, maxHp: stats.maxHp * 2, defense: stats.defense * 2 };
  return stats;
}

export function isWeakFloor(floor: number): boolean {
  return getFloorBand(floor) !== null;
}

export function isBossFloor(floor: number): boolean {
  return [5, 10, 13, 16, 17, 18, 19, 20].includes(floor);
}
