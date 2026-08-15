import assert from "node:assert/strict";
import test from "node:test";
import {
  getRoguelikeUpgradeAddAmountsByRarity,
  pickRandomAvailableWeakMagicEffect,
  pickRoguelikeWeakFloorUpgradeSlots,
  rollRoguelikeUpgradeRarity,
} from "@/lib/roguelikeUpgrades";
import type { WeakMagicEffectKind } from "@/types/game";

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
