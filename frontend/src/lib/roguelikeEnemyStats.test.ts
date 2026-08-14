import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBossUpgrade,
  applyTypeCorrection,
  applyUpgrade,
  buildWeakEnemyStats,
  getUpgradeAddAmounts,
  isBossFloor,
  isWeakFloor,
  pickRandomUpgradeSlots,
} from "@/lib/roguelikeEnemyStats";

const baseStats = {
  hp: 100,
  maxHp: 100,
  pp: 40,
  maxPp: 40,
  attack: 20,
  defense: 30,
  speed: 4,
  evasion: 0.1,
};

test("applyTypeCorrection applies attack magic defense balanced corrections", () => {
  assert.deepEqual(applyTypeCorrection({ pp: 30, attack: 65, defense: 65 }, "attack"), { pp: 30, attack: 98, defense: 65 });
  assert.deepEqual(applyTypeCorrection({ pp: 30, attack: 65, defense: 65 }, "magic"), { pp: 45, attack: 65, defense: 65 });
  assert.deepEqual(applyTypeCorrection({ pp: 30, attack: 65, defense: 65 }, "defense"), { pp: 30, attack: 65, defense: 98 });
  assert.deepEqual(applyTypeCorrection({ pp: 44, attack: 160, defense: 75 }, "balanced"), { pp: 53, attack: 192, defense: 90 });
});

test("buildWeakEnemyStats uses floor 1-4 band", () => {
  assert.equal(buildWeakEnemyStats(1, "attack").attack, 98);
  assert.equal(buildWeakEnemyStats(1, "magic").pp, 45);
  assert.equal(buildWeakEnemyStats(1, "defense").defense, 98);
  const balanced = buildWeakEnemyStats(4, "balanced");
  assert.deepEqual({ hp: balanced.hp, pp: balanced.pp, attack: balanced.attack, defense: balanced.defense, speed: balanced.speed, evasion: balanced.evasion }, { hp: 160, pp: 36, attack: 78, defense: 78, speed: 1, evasion: 0.01 });
});

test("buildWeakEnemyStats uses floor 6-9 band", () => {
  const attack = buildWeakEnemyStats(6, "attack");
  const balanced = buildWeakEnemyStats(9, "balanced");
  assert.deepEqual({ hp: attack.hp, pp: attack.pp, attack: attack.attack, defense: attack.defense, speed: attack.speed }, { hp: 355, pp: 35, attack: 105, defense: 70, speed: 2 });
  assert.deepEqual({ pp: balanced.pp, attack: balanced.attack, defense: balanced.defense }, { pp: 42, attack: 84, defense: 84 });
});

test("buildWeakEnemyStats uses floor 11-12 band", () => {
  const balanced = buildWeakEnemyStats(11, "balanced");
  assert.deepEqual({ hp: balanced.hp, pp: balanced.pp, attack: balanced.attack, defense: balanced.defense, speed: balanced.speed }, { hp: 385, pp: 53, attack: 192, defense: 90, speed: 3 });
});

test("buildWeakEnemyStats uses floor 14-15 band", () => {
  const defense = buildWeakEnemyStats(14, "defense");
  assert.deepEqual({ hp: defense.hp, pp: defense.pp, attack: defense.attack, defense: defense.defense, speed: defense.speed }, { hp: 411, pp: 47, attack: 174, defense: 126, speed: 5 });
});

test("getUpgradeAddAmounts returns band-specific values", () => {
  assert.deepEqual(getUpgradeAddAmounts(1), { hp: 35, pp: 9, attack: 14, defense: 10, speed: 3, evasion: 0.01 });
  assert.deepEqual(getUpgradeAddAmounts(11), { hp: 120, pp: 28, attack: 30, defense: 35, speed: 5, evasion: 0.02 });
});

test("pickRandomUpgradeSlots returns 3 unique keys", () => {
  const picks = pickRandomUpgradeSlots(1, 3, () => 0.5);
  assert.equal(picks.length, 3);
  assert.equal(new Set(picks).size, 3);
});

test("applyUpgrade updates target stats", () => {
  assert.deepEqual(applyUpgrade(baseStats, "hp", 20), { ...baseStats, hp: 120, maxHp: 120 });
  assert.deepEqual(applyUpgrade(baseStats, "pp", 10), { ...baseStats, pp: 50, maxPp: 50 });
  assert.deepEqual(applyUpgrade(baseStats, "attack", 5), { ...baseStats, attack: 25 });
  assert.equal(applyUpgrade({ ...baseStats, evasion: 0.94 }, "evasion", 0.05).evasion, 0.95);
});

test("applyBossUpgrade applies floor-specific multipliers", () => {
  assert.equal(applyBossUpgrade(baseStats, 5).attack, 40);
  assert.deepEqual({ pp: applyBossUpgrade(baseStats, 10).pp, maxPp: applyBossUpgrade(baseStats, 10).maxPp }, { pp: 80, maxPp: 80 });
  assert.equal(applyBossUpgrade(baseStats, 13).defense, 60);
  assert.deepEqual({ hp: applyBossUpgrade(baseStats, 16).hp, maxHp: applyBossUpgrade(baseStats, 16).maxHp }, { hp: 200, maxHp: 200 });
  const floor17 = applyBossUpgrade(baseStats, 17);
  assert.deepEqual({ hp: floor17.hp, maxHp: floor17.maxHp, defense: floor17.defense }, { hp: 200, maxHp: 200, defense: 60 });
});

test("isWeakFloor and isBossFloor classify floors", () => {
  assert.equal(isWeakFloor(1), true);
  assert.equal(isWeakFloor(5), false);
  assert.equal(isWeakFloor(18), false);
  assert.equal(isBossFloor(5), true);
  assert.equal(isBossFloor(20), true);
  assert.equal(isBossFloor(6), false);
});
