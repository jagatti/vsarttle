import assert from "node:assert/strict";
import test from "node:test";
import {
  getRoguelikeUpgradeAddAmountsByRarity,
  getRoguelikeBossUpgradeChoices,
  pickRandomAvailableWeakMagicEffect,
  pickRoguelikeWeakFloorUpgradeSlots,
  rollRoguelikeUpgradeRarity,
} from "@/lib/roguelikeUpgrades";
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

test("pickRoguelikeWeakFloorUpgradeSlots never returns ★3 once all effects are acquired", () => {
  const acquired: WeakMagicEffectKind[] = ["paralysis", "tieBan", "attackBan", "barrierBan", "magicBan", "chargeBan"];
  const slots = pickRoguelikeWeakFloorUpgradeSlots(1, acquired, 3, () => 0.99);
  assert.equal(slots.length, 3);
  assert.ok(slots.every((slot) => slot.kind === "stat"));
  assert.ok(slots.every((slot) => slot.rarity === 2));
});

test("pickRoguelikeWeakFloorUpgradeSlots does not duplicate ★3 effects in one offer", () => {
  const slots = pickRoguelikeWeakFloorUpgradeSlots(1, [], 3, () => 0.99);
  const weakMagicSlots = slots.filter((slot) => slot.kind === "weak-magic");
  assert.equal(weakMagicSlots.length, 3);
  assert.equal(new Set(weakMagicSlots.map((slot) => slot.effectKind)).size, 3);
});
