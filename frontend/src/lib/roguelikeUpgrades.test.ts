import assert from "node:assert/strict";
import test from "node:test";
import {
  getRoguelikeUpgradeAddAmountsByRarity,
  getRoguelikeBossUpgradeChoices,
  pickRandomAvailableWeakMagicEffect,
  pickRoguelikeWeakFloorUpgradeSlots,
  rollRoguelikeUpgradeRarity,
  ROGUELIKE_WEAK_MAGIC_EFFECTS,
} from "@/lib/roguelikeUpgrades";
import { ROGUELIKE_SKILLS, type AcquiredSkills, type SkillId } from "@/lib/roguelikeSkills";
import type { WeakMagicEffectKind } from "@/types/game";

test("boss floors offer their original upgrade and full HP/PP recovery", () => {
  for (const [floor, label] of [[5, "攻撃 ×2"], [10, "PP ×2"], [13, "防御 ×2"], [16, "HP ×2"]] as const) {
    assert.deepEqual(getRoguelikeBossUpgradeChoices(floor), [
      { kind: "boss", floor, label },
      { kind: "full-heal", label: "HPとPP全回復" },
    ]);
  }
});

test("floor 17 offers HP, defense, and full recovery instead of evasion", () => {
  assert.deepEqual(getRoguelikeBossUpgradeChoices(17), [
    { kind: "boss-multiply", key: "hp", label: "HP ×2" },
    { kind: "boss-multiply", key: "defense", label: "防御 ×2" },
    { kind: "full-heal", label: "HPとPP全回復" },
  ]);
});

test("floors without boss rewards still offer no boss upgrades", () => {
  for (const floor of [1, 18, 19, 20]) {
    assert.deepEqual(getRoguelikeBossUpgradeChoices(floor), []);
  }
});

test("getRoguelikeUpgradeAddAmountsByRarity halves ★1 values with ceil for integers", () => {
  const amounts = getRoguelikeUpgradeAddAmountsByRarity(1);
  assert.deepEqual(amounts[1], { hp: 18, pp: 5, attack: 7, defense: 5, speed: 2, evasion: 0.005 });
  assert.deepEqual(amounts[2], { hp: 35, pp: 9, attack: 14, defense: 10, speed: 3, evasion: 0.01 });
});

test("rollRoguelikeUpgradeRarity uses normal rates while ★3 is available", () => {
  assert.equal(rollRoguelikeUpgradeRarity(true, () => 0.64), 1);
  assert.equal(rollRoguelikeUpgradeRarity(true, () => 0.89), 2);
  assert.equal(rollRoguelikeUpgradeRarity(true, () => 0.95), 3);
});

test("rollRoguelikeUpgradeRarity redistributes to ★1/★2 when all weak-magic effects are acquired", () => {
  assert.equal(rollRoguelikeUpgradeRarity(false, () => 0.7), 1);
  assert.equal(rollRoguelikeUpgradeRarity(false, () => 0.8), 2);
});

test("pickRandomAvailableWeakMagicEffect excludes already-acquired effects", () => {
  const acquired: WeakMagicEffectKind[] = ["paralysis", "tieBan", "attackBan", "barrierBan", "magicBan"];
  const picked = pickRandomAvailableWeakMagicEffect(acquired, () => 0.5);
  assert.equal(picked?.kind, "chargeBan");
});

test("acquiring all weak magic leaves skill rewards available including ★3", () => {
  const acquired: WeakMagicEffectKind[] = ["paralysis", "tieBan", "attackBan", "barrierBan", "magicBan", "chargeBan"];
  const slots = pickRoguelikeWeakFloorUpgradeSlots(1, acquired, 3, () => 0.99);
  assert.equal(slots.length, 3);
  assert.equal(slots[0].kind, "stat");
  assert.equal(slots[0].rarity, 2);
  assert.equal(slots[1].kind, "skill");
  assert.equal(slots[1].rarity, 3);
  assert.equal(slots[2].kind, "skill");
  assert.equal(slots[2].rarity, 3);
});

test("the first slot is a stat and later slots do not duplicate weak magic", () => {
  const slots = pickRoguelikeWeakFloorUpgradeSlots(1, [], 3, () => 0.99);
  const weakMagicSlots = slots.filter((slot) => slot.kind === "weak-magic");
  assert.equal(slots[0].kind, "stat");
  assert.equal(weakMagicSlots.length, 2);
  assert.equal(new Set(weakMagicSlots.map((slot) => slot.effectKind)).size, 2);
});

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => {
    assert.ok(index < values.length, "unexpected random draw");
    return values[index++];
  };
}

function cappedSkills(): AcquiredSkills {
  return Object.fromEntries(Object.values(ROGUELIKE_SKILLS)
    .filter((skill) => !skill.consumable)
    .map((skill) => [skill.id, skill.maxStacks])) as AcquiredSkills;
}

test("slot-specific rarity boundaries are 65/35, 55/33/12 and 55/30/15", () => {
  for (const [slot, boundaries] of [
    [1, [[0, 1], [0.649999, 1], [0.65, 2], [0.999999, 2]]],
    [2, [[0.549999, 1], [0.55, 2], [0.879999, 2], [0.88, 3], [0.999999, 3]]],
    [3, [[0.549999, 1], [0.55, 2], [0.849999, 2], [0.85, 3], [0.999999, 3]]],
  ] as const) {
    for (const [roll, rarity] of boundaries) {
      assert.equal(rollRoguelikeUpgradeRarity(slot, [1, 2, 3], () => roll), rarity);
    }
  }
});

test("rarity weights renormalize over available rarities, with zero-weight and empty pools rejected", () => {
  const boundary = 55 / 85;
  assert.equal(rollRoguelikeUpgradeRarity(3, [1, 2], () => boundary - 0.00001), 1);
  assert.equal(rollRoguelikeUpgradeRarity(3, [1, 2], () => boundary), 2);
  assert.equal(rollRoguelikeUpgradeRarity(2, [1, 3], () => 55 / 67), 3);
  assert.equal(rollRoguelikeUpgradeRarity(3, [2, 3], () => 30 / 45), 3);
  assert.equal(rollRoguelikeUpgradeRarity(3, [3, 3], () => 0), 3);
  assert.equal(rollRoguelikeUpgradeRarity(1, [2], () => 0), 2);
  assert.throws(() => rollRoguelikeUpgradeRarity(1, [3], () => 0), /No available rarity/);
  assert.throws(() => rollRoguelikeUpgradeRarity(3, [], () => 0), /No available rarity/);
});

test("slot one is always a unique stat with the right floor-scaled amount", () => {
  for (const floor of [1, 6, 11, 14]) {
    for (const roll of [0, 0.649999, 0.65, 0.999999]) {
      const slot = pickRoguelikeWeakFloorUpgradeSlots(floor, [], 1, sequence(roll, 0))[0];
      assert.equal(slot.kind, "stat");
      if (slot.kind !== "stat") throw new Error("expected stat");
      assert.equal(slot.rarity, roll < 0.65 ? 1 : 2);
      assert.equal(slot.amount, getRoguelikeUpgradeAddAmountsByRarity(floor)[slot.rarity][slot.key]);
    }
  }
});

test("slot two draws from the combined skill/weak-magic pool by rarity", () => {
  for (const [roll, rarity] of [[0.549999, 1], [0.55, 2], [0.88, 3]] as const) {
    const slot = pickRoguelikeWeakFloorUpgradeSlots(1, [], 2, sequence(0, 0, roll, 0))[1];
    assert.equal(slot.kind, "skill");
    assert.equal(slot.rarity, rarity);
  }
  const weak = pickRoguelikeWeakFloorUpgradeSlots(1, [], 2, sequence(0, 0, 0.99, 0.99))[1];
  assert.equal(weak.kind, "weak-magic");
  assert.equal(weak.rarity, 3);
});

test("slot three category boundaries use 45% stat, 40% skill, 15% weak magic", () => {
  for (const [categoryRoll, expected] of [
    [0, "stat"], [0.449999, "stat"], [0.45, "skill"], [0.849999, "skill"], [0.85, "weak-magic"], [0.999999, "weak-magic"],
  ] as const) {
    const slot = pickRoguelikeWeakFloorUpgradeSlots(1, [], 3, sequence(0, 0, 0, 0, categoryRoll, 0, 0))[2];
    assert.equal(slot.kind, expected);
    assert.equal(slot.rarity, expected === "weak-magic" ? 3 : 1);
  }
});

test("deterministic grids reproduce slot rarity and category rates", () => {
  for (const [slot, expected] of [[1, [650, 350, 0]], [2, [550, 330, 120]], [3, [550, 300, 150]]] as const) {
    const counts = [0, 0, 0];
    for (let i = 0; i < 1000; i++) counts[rollRoguelikeUpgradeRarity(slot, [1, 2, 3], () => (i + 0.5) / 1000) - 1]++;
    assert.deepEqual(counts, expected);
  }
  const categories = { stat: 0, skill: 0, "weak-magic": 0 };
  for (let i = 0; i < 1000; i++) {
    const third = pickRoguelikeWeakFloorUpgradeSlots(1, [], 3, sequence(0, 0, 0, 0, (i + 0.5) / 1000, 0, 0))[2];
    categories[third.kind]++;
  }
  assert.deepEqual(categories, { stat: 450, skill: 400, "weak-magic": 150 });
});

test("slot three renormalizes rarity within stats and not across categories", () => {
  const boundary = 55 / 85;
  for (const [roll, expected] of [[boundary - 0.00001, 1], [boundary, 2]] as const) {
    const third = pickRoguelikeWeakFloorUpgradeSlots(1, [], 3, sequence(0, 0, 0, 0, 0, roll, 0))[2];
    assert.equal(third.kind, "stat");
    assert.equal(third.rarity, expected);
  }
});

test("skill category renormalizes missing rarities after capped passives and offered healing", () => {
  for (const [roll, expected] of [[0, "mediumHeal"], [30 / 45, "largeHeal"]] as const) {
    const third = pickRoguelikeWeakFloorUpgradeSlots(
      1, [], 3, sequence(0, 0, 0, 0, 0.5, roll, 0),
      { acquiredSkills: cappedSkills() },
    )[2];
    if (third.kind !== "skill") throw new Error("expected skill");
    assert.equal(third.skillId, expected);
  }
});

test("empty weak-magic categories redistribute to stat and skill proportionally", () => {
  const acquired = ROGUELIKE_WEAK_MAGIC_EFFECTS.map((effect) => effect.kind);
  for (const [roll, kind] of [[45 / 85 - 0.00001, "stat"], [45 / 85, "skill"], [0.99, "skill"]] as const) {
    const third = pickRoguelikeWeakFloorUpgradeSlots(1, acquired, 3, sequence(0, 0, 0, 0, roll, 0, 0))[2];
    assert.equal(third.kind, kind);
  }
});

test("below 40% HP slot two guarantees a heal of any rarity and 40% does not", () => {
  for (const [roll, id] of [[0, "smallHeal"], [0.55, "mediumHeal"], [0.88, "largeHeal"]] as const) {
    const slot = pickRoguelikeWeakFloorUpgradeSlots(1, [], 2, sequence(0, 0, roll, 0.99), { currentHp: 39, maxHp: 100 })[1];
    assert.equal(slot.kind, "skill");
    if (slot.kind === "skill") assert.equal(slot.skillId, id);
  }
  const slot = pickRoguelikeWeakFloorUpgradeSlots(1, [], 2, sequence(0, 0, 0, 0.99), { currentHp: 40, maxHp: 100 })[1];
  assert.equal(slot.kind, "skill");
  if (slot.kind === "skill") assert.equal(slot.skillId, "tieBoost");
});

test("at 90% HP consumable candidate weights fall to 0.3, but below 90% they are unchanged", () => {
  for (const [hp, expected] of [[89, "smallHeal"], [90, "attackResistance"], [100, "attackResistance"]] as const) {
    const slot = pickRoguelikeWeakFloorUpgradeSlots(1, [], 2, sequence(0, 0, 0, 0.1), { currentHp: hp, maxHp: 100 })[1];
    assert.equal(slot.kind, "skill");
    if (slot.kind === "skill") assert.equal(slot.skillId, expected);
  }
  const reducedBoundary = 0.3 / 4.3;
  const slot = pickRoguelikeWeakFloorUpgradeSlots(1, [], 2, sequence(0, 0, 0, reducedBoundary - 0.00001), { currentHp: 90, maxHp: 100 })[1];
  if (slot.kind !== "skill") throw new Error("expected skill");
  assert.equal(slot.skillId, "smallHeal");
});

test("healthy HP also lowers consumable weights in the third slot skill category", () => {
  for (const [currentHp, expected] of [[89, "smallHeal"], [90, "attackResistance"]] as const) {
    const third = pickRoguelikeWeakFloorUpgradeSlots(
      1, [], 3, sequence(0, 0, 0.55, 0.5, 0.5, 0, 0.1),
      { currentHp, maxHp: 100 },
    )[2];
    if (third.kind !== "skill") throw new Error("expected skill");
    assert.equal(third.skillId, expected);
  }
});

test("invalid or absent HP context does not force healing or reduce heal weights", () => {
  for (const options of [{}, { currentHp: 0 }, { maxHp: 100 }, { currentHp: 1, maxHp: 0 }]) {
    const slot = pickRoguelikeWeakFloorUpgradeSlots(1, [], 2, sequence(0, 0, 0, 0.1), options)[1];
    if (slot.kind !== "skill") throw new Error("expected skill");
    assert.equal(slot.skillId, "smallHeal");
  }
});

test("skills at stack caps are excluded but repeatable consumables and below-cap resistance remain", () => {
  const acquiredSkills = { ...cappedSkills(), attackResistance: 2, smallHeal: 9 };
  const before = { ...acquiredSkills };
  const slots = pickRoguelikeWeakFloorUpgradeSlots(1, [], 30, () => 0, { acquiredSkills });
  const skillIds = slots.flatMap((slot) => slot.kind === "skill" ? [slot.skillId] : []);
  assert.deepEqual(new Set(skillIds), new Set(["smallHeal", "mediumHeal", "largeHeal", "attackResistance"]));
  assert.deepEqual(acquiredSkills, before);
});

test("large screens exhaust the pools without duplicate stat keys, skill IDs or weak effects", () => {
  const slots = pickRoguelikeWeakFloorUpgradeSlots(1, [], 100, () => 0.99);
  assert.equal(slots.length, 24);
  const ids = slots.map((slot) => slot.kind === "stat" ? `stat:${slot.key}` : slot.kind === "skill" ? `skill:${slot.skillId}` : `weak:${slot.effectKind}`);
  assert.equal(new Set(ids).size, slots.length);
  assert.ok(slots.every((slot) => slot.kind === "stat" ? [1, 2].includes(slot.rarity) : slot.kind === "weak-magic" ? slot.rarity === 3 : slot.rarity === ROGUELIKE_SKILLS[slot.skillId].rarity));
});

test("after skills and weak magic are exhausted category selection falls back to stats", () => {
  const acquiredSkills = cappedSkills();
  const acquired = ROGUELIKE_WEAK_MAGIC_EFFECTS.map((effect) => effect.kind);
  const slots = pickRoguelikeWeakFloorUpgradeSlots(1, acquired, 30, () => 0.99, { acquiredSkills });
  assert.equal(slots.length, 9);
  assert.equal(slots.filter((slot) => slot.kind === "stat").length, 6);
  assert.equal(slots.filter((slot) => slot.kind === "skill").length, 3);
  assert.ok(slots.every((slot) => slot.kind !== "weak-magic"));
});

test("skill rewards copy registry display metadata and keep inputs unchanged", () => {
  const acquiredSkills: AcquiredSkills = {};
  const acquired: WeakMagicEffectKind[] = ["chargeBan"];
  const slots = pickRoguelikeWeakFloorUpgradeSlots(1, acquired, 3, () => 0, { acquiredSkills });
  for (const slot of slots) {
    if (slot.kind !== "skill") continue;
    const skill = ROGUELIKE_SKILLS[slot.skillId as SkillId];
    assert.equal(slot.label, skill.label);
    assert.equal(slot.description, skill.description);
    assert.equal(slot.rarity, skill.rarity);
  }
  assert.deepEqual(acquiredSkills, {});
  assert.deepEqual(acquired, ["chargeBan"]);
  assert.deepEqual(pickRoguelikeWeakFloorUpgradeSlots(1, [], 0), []);
});
