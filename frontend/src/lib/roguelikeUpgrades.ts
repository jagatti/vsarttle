import { ALL_WEAK_MAGIC_EFFECTS } from "@/lib/battleLogic";
import { getUpgradeAddAmounts, pickRandomUpgradeSlots, type UpgradeStatKey } from "@/lib/roguelikeEnemyStats";
import type { WeakMagicEffectKind } from "@/types/game";

export type RoguelikeUpgradeRarity = 1 | 2 | 3;

export interface RoguelikeStatUpgradeSlot {
  kind: "stat";
  rarity: 1 | 2;
  key: UpgradeStatKey;
  amount: number;
}

export interface RoguelikeWeakMagicUpgradeSlot {
  kind: "weak-magic";
  rarity: 3;
  effectKind: WeakMagicEffectKind;
  effectName: string;
}

export type RoguelikeWeakFloorUpgradeSlot = RoguelikeStatUpgradeSlot | RoguelikeWeakMagicUpgradeSlot;

export const ROGUELIKE_WEAK_MAGIC_EFFECTS = ALL_WEAK_MAGIC_EFFECTS.map((effect) => ({ kind: effect.kind, name: effect.name }));

const ROGUELIKE_STAR1_RATE = 0.65;
const ROGUELIKE_STAR2_RATE = 0.25;
const ROGUELIKE_STAR3_RATE = 0.1;

const isIntegerAmount = (value: number) => Number.isInteger(value);

const star1Amount = (value: number) => (isIntegerAmount(value) ? Math.ceil(value / 2) : value / 2);

export function getRoguelikeUpgradeAddAmountsByRarity(
  floor: number,
): Record<1 | 2, Record<UpgradeStatKey, number>> {
  const base = getUpgradeAddAmounts(floor);
  return {
    1: {
      hp: star1Amount(base.hp),
      pp: star1Amount(base.pp),
      attack: star1Amount(base.attack),
      defense: star1Amount(base.defense),
      speed: star1Amount(base.speed),
      evasion: star1Amount(base.evasion),
    },
    2: base,
  };
}

export function rollRoguelikeUpgradeRarity(
  hasUnacquiredWeakMagic: boolean,
  random: () => number = Math.random,
): RoguelikeUpgradeRarity {
  const roll = random();
  if (hasUnacquiredWeakMagic) {
    if (roll < ROGUELIKE_STAR1_RATE) return 1;
    if (roll < 1 - ROGUELIKE_STAR3_RATE) return 2;
    return 3;
  }
  const normalizedStar1 = ROGUELIKE_STAR1_RATE / (ROGUELIKE_STAR1_RATE + ROGUELIKE_STAR2_RATE);
  return roll < normalizedStar1 ? 1 : 2;
}

export function pickRandomAvailableWeakMagicEffect(
  acquiredKinds: WeakMagicEffectKind[],
  random: () => number = Math.random,
): { kind: WeakMagicEffectKind; name: string } | null {
  const acquired = new Set(acquiredKinds);
  const available = ROGUELIKE_WEAK_MAGIC_EFFECTS.filter((effect) => !acquired.has(effect.kind));
  if (available.length === 0) return null;
  return available[Math.floor(random() * available.length)] ?? null;
}

export function getWeakMagicEffectName(kind: WeakMagicEffectKind): string {
  return ROGUELIKE_WEAK_MAGIC_EFFECTS.find((effect) => effect.kind === kind)?.name ?? kind;
}

export function buildWeakMagicTooltip(acquiredKinds: WeakMagicEffectKind[]): string {
  if (acquiredKinds.length === 0) return "まだ効果を習得していません";
  const names = acquiredKinds.map((kind) => getWeakMagicEffectName(kind));
  return `現在習得済みの効果: ${names.join("、")}`;
}

export function pickRoguelikeWeakFloorUpgradeSlots(
  floor: number,
  acquiredKinds: WeakMagicEffectKind[],
  count = 3,
  random: () => number = Math.random,
): RoguelikeWeakFloorUpgradeSlot[] {
  const amountByRarity = getRoguelikeUpgradeAddAmountsByRarity(floor);
  const statKeys = pickRandomUpgradeSlots(floor, count, random);
  let statIndex = 0;
  const slots: RoguelikeWeakFloorUpgradeSlot[] = [];
  const offeredWeakMagicKinds: WeakMagicEffectKind[] = [];

  for (let i = 0; i < count; i += 1) {
    const weakEffect = pickRandomAvailableWeakMagicEffect([...acquiredKinds, ...offeredWeakMagicKinds], random);
    const rarity = rollRoguelikeUpgradeRarity(!!weakEffect, random);
    if (rarity === 3 && weakEffect) {
      slots.push({
        kind: "weak-magic",
        rarity: 3,
        effectKind: weakEffect.kind,
        effectName: weakEffect.name,
      });
      offeredWeakMagicKinds.push(weakEffect.kind);
      continue;
    }

    const statRarity: 1 | 2 = rarity === 1 ? 1 : 2;
    const key = statKeys[statIndex] ?? pickRandomUpgradeSlots(floor, 1, random)[0]!;
    statIndex += 1;
    slots.push({
      kind: "stat",
      rarity: statRarity,
      key,
      amount: amountByRarity[statRarity][key],
    });
  }

  return slots;
}
