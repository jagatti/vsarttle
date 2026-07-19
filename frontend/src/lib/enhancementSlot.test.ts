import assert from "node:assert/strict";
import test from "node:test";
import { applyEnhancementSlot } from "@/lib/enhancementSlot";
import type { CharacterStats } from "@/types/game";

const baseStats: CharacterStats = {
  hp: 300,
  maxHp: 300,
  pp: 50,
  maxPp: 50,
  attack: 199,
  defense: 100,
  speed: 6,
  evasion: 0.01,
};

test("applyEnhancementSlot adds +1 PP", () => {
  const boosted = applyEnhancementSlot(baseStats, "pp");
  assert.equal(boosted.pp, 51);
  assert.equal(boosted.maxPp, 51);
});

test("applyEnhancementSlot adds +2 speed", () => {
  const boosted = applyEnhancementSlot(baseStats, "speed");
  assert.equal(boosted.speed, 8);
});

test("applyEnhancementSlot adds +4% evasion", () => {
  const boosted = applyEnhancementSlot(baseStats, "evasion");
  assert.equal(boosted.evasion, 0.05);
});
