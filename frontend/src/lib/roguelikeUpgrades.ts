import { ALL_WEAK_MAGIC_EFFECTS } from "@/lib/battleLogic";
import { getUpgradeAddAmounts, type BossMultiplyKey, type UpgradeStatKey } from "@/lib/roguelikeEnemyStats";
import { ROGUELIKE_SKILLS, ROGUELIKE_SKILL_BALANCE, type AcquiredSkills, type SkillId } from "@/lib/roguelikeSkills";
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

export interface RoguelikeSkillUpgradeSlot {
  kind: "skill";
  skillId: SkillId;
  rarity: RoguelikeUpgradeRarity;
  label: string;
  description: string;
}

export type RoguelikeWeakFloorUpgradeSlot = RoguelikeStatUpgradeSlot | RoguelikeWeakMagicUpgradeSlot | RoguelikeSkillUpgradeSlot;

export interface RoguelikeUpgradeOptions {
  acquiredSkills?: AcquiredSkills;
  currentHp?: number;
  maxHp?: number;
}

export type RoguelikeBossUpgradeChoice =
  | { kind: "boss-multiply"; key: BossMultiplyKey; multiplier: number; healRatio?: number; label: string }
  | { kind: "full-heal"; label: string };

export function getRoguelikeBossUpgradeChoices(floor: number): RoguelikeBossUpgradeChoice[] {
  const fullHeal: RoguelikeBossUpgradeChoice = { kind: "full-heal", label: "HPとPP全回復" };
  const multiply = (
    key: BossMultiplyKey,
    multiplier: number,
    label: string,
    healRatio?: number,
  ): RoguelikeBossUpgradeChoice => ({
    kind: "boss-multiply",
    key,
    multiplier,
    ...(healRatio === undefined ? {} : { healRatio }),
    label,
  });
  if (floor === 17) {
    return [
      multiply("hp", 2, "HP ×2"),
      multiply("defense", 1.5, "防御 ×1.5＋HP/PP 50%回復", 0.5),
      fullHeal,
    ];
  }
  const rewards: Record<number, [BossMultiplyKey, string]> = {
    5: ["attack", "攻撃"],
    10: ["pp", "PP"],
    13: ["defense", "防御"],
    16: ["hp", "HP"],
  };
  const reward = rewards[floor];
  return reward
    ? [
        multiply(reward[0], 1.5, `${reward[1]} ×1.5`),
        multiply(reward[0], 1.2, `${reward[1]} ×1.2＋HP/PP 50%回復`, 0.5),
        fullHeal,
      ]
    : [];
}

export const ROGUELIKE_WEAK_MAGIC_EFFECTS = ALL_WEAK_MAGIC_EFFECTS.map((effect) => ({ kind: effect.kind, name: effect.name }));

const SLOT_RARITY_WEIGHTS: Record<1 | 2 | 3, Record<RoguelikeUpgradeRarity, number>> = {
   1: { 1: 65, 2: 35, 3: 0 },
   2: { 1: 55, 2: 33, 3: 12 },
   3: { 1: 55, 2: 30, 3: 15 },
};

function pickWeighted<T>(entries: { value: T; weight: number }[], random: () => number): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = random();
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (roll < cumulative / total) return entry.value;
  }
  return entries[entries.length - 1]!.value;
}

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
  slotNumber: number,
  availableRarities: readonly RoguelikeUpgradeRarity[],
  random?: () => number,
): RoguelikeUpgradeRarity;
export function rollRoguelikeUpgradeRarity(
  hasUnacquiredWeakMagic: boolean,
  random?: () => number,
): RoguelikeUpgradeRarity;
export function rollRoguelikeUpgradeRarity(
  slotNumberOrHasWeakMagic: number | boolean,
  availableRaritiesOrRandom: readonly RoguelikeUpgradeRarity[] | (() => number) = [1, 2, 3],
  random: () => number = Math.random,
): RoguelikeUpgradeRarity {
  if (typeof slotNumberOrHasWeakMagic === "boolean") {
    const legacyRandom = typeof availableRaritiesOrRandom === "function" ? availableRaritiesOrRandom : random;
    const weights = slotNumberOrHasWeakMagic
      ? [{ value: 1 as const, weight: 65 }, { value: 2 as const, weight: 25 }, { value: 3 as const, weight: 10 }]
      : [{ value: 1 as const, weight: 65 }, { value: 2 as const, weight: 25 }];
    return pickWeighted(weights, legacyRandom);
  }
  const slot = slotNumberOrHasWeakMagic === 1 ? 1 : slotNumberOrHasWeakMagic === 2 ? 2 : 3;
  const available = typeof availableRaritiesOrRandom === "function" ? [1, 2, 3] as const : availableRaritiesOrRandom;
  const weights = ([1, 2, 3] as const)
    .filter((rarity) => available.includes(rarity) && SLOT_RARITY_WEIGHTS[slot][rarity] > 0)
    .map((rarity) => ({ value: rarity, weight: SLOT_RARITY_WEIGHTS[slot][rarity] }));
  if (!weights.length) throw new Error("No available rarity for this reward slot");
  return pickWeighted(weights, random);
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
  options: RoguelikeUpgradeOptions = {},
): RoguelikeWeakFloorUpgradeSlot[] {
  const amountByRarity = getRoguelikeUpgradeAddAmountsByRarity(floor);
  const statKeys = Object.keys(amountByRarity[1]) as UpgradeStatKey[];
  const acquiredSkills = options.acquiredSkills ?? {};
  const availableSkills = Object.values(ROGUELIKE_SKILLS).filter((skill) => {
    const count = acquiredSkills[skill.id] ?? 0;
    return skill.consumable || !Number.isFinite(count) || count < skill.maxStacks;
  });
  const hpRatio = options.maxHp !== undefined && options.maxHp > 0 && options.currentHp !== undefined
    ? options.currentHp / options.maxHp : undefined;
  const slots: RoguelikeWeakFloorUpgradeSlot[] = [];
  const offeredStats = new Set<UpgradeStatKey>();
  const offeredSkills = new Set<SkillId>();
  const offeredWeakMagic = new Set(acquiredKinds);

  for (let i = 0; i < count; i += 1) {
    const stats: RoguelikeStatUpgradeSlot[] = statKeys.filter((key) => !offeredStats.has(key))
      .flatMap((key) => ([1, 2] as const).map((rarity) => ({ kind: "stat" as const, key, rarity, amount: amountByRarity[rarity][key] })));
    const skills: RoguelikeSkillUpgradeSlot[] = availableSkills.filter((skill) => !offeredSkills.has(skill.id))
      .map((skill) => ({ kind: "skill", skillId: skill.id, rarity: skill.rarity, label: skill.label, description: skill.description }));
    const weak: RoguelikeWeakMagicUpgradeSlot[] = ROGUELIKE_WEAK_MAGIC_EFFECTS.filter((effect) => !offeredWeakMagic.has(effect.kind))
      .map((effect) => ({ kind: "weak-magic", rarity: 3, effectKind: effect.kind, effectName: effect.name }));

    let pool: RoguelikeWeakFloorUpgradeSlot[];
    if (i === 0 && stats.length) {
      pool = stats;
    } else if (i === 1 && hpRatio !== undefined && hpRatio < ROGUELIKE_SKILL_BALANCE.lowHpRatio) {
      pool = skills.filter((skill) => ROGUELIKE_SKILLS[skill.skillId].consumable);
    } else if (i === 1 && (skills.length || weak.length)) {
      // Slot two shares a rarity pool between skills and weak magic.
      pool = [...skills, ...weak];
    } else {
      const categories = [
        { value: stats as RoguelikeWeakFloorUpgradeSlot[], weight: 45 },
        { value: skills as RoguelikeWeakFloorUpgradeSlot[], weight: 40 },
        { value: weak as RoguelikeWeakFloorUpgradeSlot[], weight: 15 },
      ].filter((entry) => entry.value.length > 0);
      if (!categories.length) break;
      pool = pickWeighted(categories, random);
    }
    if (!pool.length) break;
    const rarity = rollRoguelikeUpgradeRarity(i === 0 ? 1 : i === 1 ? 2 : 3, pool.map((slot) => slot.rarity), random);
    const candidates = pool.filter((slot) => slot.rarity === rarity).map((slot) => ({
      value: slot,
      weight: slot.kind === "skill" && ROGUELIKE_SKILLS[slot.skillId].consumable
        && hpRatio !== undefined && hpRatio >= ROGUELIKE_SKILL_BALANCE.healthyHpRatio
        ? ROGUELIKE_SKILL_BALANCE.healthyRecoveryWeight : 1,
    }));
    const selected = pickWeighted(candidates, random);
    slots.push(selected);
    if (selected.kind === "stat") offeredStats.add(selected.key);
    if (selected.kind === "skill") offeredSkills.add(selected.skillId);
    if (selected.kind === "weak-magic") offeredWeakMagic.add(selected.effectKind);
  }
  return slots;
}
