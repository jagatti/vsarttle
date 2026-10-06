import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBossMultiplyUpgrade,
  applyBossUpgrade,
  applyPerfectVictoryBuff,
  applyTypeCorrection,
  applyUpgrade,
  buildWeakEnemyStats,
  getUpgradeAddAmounts,
  getEnemyWeakMagicKindsByType,
  isBossFloor,
  isWeakFloor,
  pickRandomUpgradeSlots,
} from "@/lib/roguelikeEnemyStats";
import { ALL_WEAK_MAGIC_EFFECTS } from "@/lib/battleLogic";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";

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

test("enemy weak magic effects follow character type", () => {
  assert.deepEqual(getEnemyWeakMagicKindsByType("attack"), ["tieBan", "magicBan"]);
  assert.deepEqual(getEnemyWeakMagicKindsByType("magic"), ["paralysis", "barrierBan", "chargeBan"]);
  assert.deepEqual(getEnemyWeakMagicKindsByType("defense"), ["attackBan", "chargeBan"]);
  assert.deepEqual(getEnemyWeakMagicKindsByType("balanced"), ["paralysis", "tieBan", "chargeBan"]);
  for (const type of ["attack", "magic", "defense", "balanced"]) {
    assert.ok(getEnemyWeakMagicKindsByType(type).every((kind) => ALL_WEAK_MAGIC_EFFECTS.some((effect) => effect.kind === kind)));
  }
});

test("unknown enemy types fall back to the original weak magic pool", () => {
  for (const type of [undefined, "", "unknown"]) {
    assert.deepEqual(getEnemyWeakMagicKindsByType(type), ["paralysis", "barrierBan", "chargeBan"]);
  }
});

test("boss weak magic uses its current character type, including floor 17 forms", () => {
  for (const floor of [5, 10, 13, 16, 17, 18, 19, 20]) {
    const boss = buildRoguelikeBossState(floor);
    const expected = floor === 5 ? ["tieBan", "magicBan"]
      : floor === 13 ? ["attackBan", "chargeBan"]
      : floor === 10 || floor === 16 ? ["paralysis", "barrierBan", "chargeBan"]
      : ["paralysis", "tieBan", "chargeBan"];
    assert.deepEqual(getEnemyWeakMagicKindsByType(boss.characterType), expected);
  }
  const boss = buildRoguelikeBossState(17);
  boss.characterType = "attack";
  assert.deepEqual(getEnemyWeakMagicKindsByType(boss.characterType), ["tieBan", "magicBan"]);
  boss.characterType = "magic";
  assert.deepEqual(getEnemyWeakMagicKindsByType(boss.characterType), ["paralysis", "barrierBan", "chargeBan"]);
  boss.characterType = "defense";
  assert.deepEqual(getEnemyWeakMagicKindsByType(boss.characterType), ["attackBan", "chargeBan"]);
});

test("applyTypeCorrection applies attack magic defense balanced corrections", () => {
  assert.deepEqual(applyTypeCorrection({ pp: 30, attack: 65, defense: 65 }, "attack"), { pp: 30, attack: 98, defense: 65 });
  assert.deepEqual(applyTypeCorrection({ pp: 30, attack: 65, defense: 65 }, "magic"), { pp: 45, attack: 65, defense: 65 });
  assert.deepEqual(applyTypeCorrection({ pp: 30, attack: 65, defense: 65 }, "defense"), { pp: 30, attack: 65, defense: 98 });
  assert.deepEqual(applyTypeCorrection({ pp: 44, attack: 160, defense: 75 }, "balanced"), { pp: 53, attack: 192, defense: 90 });
});

test("buildWeakEnemyStats uses floor 1-4 band", () => {
  assert.equal(buildWeakEnemyStats(1, "attack").attack, 105);
  assert.equal(buildWeakEnemyStats(1, "magic").pp, 53);
  assert.equal(buildWeakEnemyStats(1, "defense").defense, 105);
  const balanced = buildWeakEnemyStats(4, "balanced");
  assert.deepEqual({ hp: balanced.hp, pp: balanced.pp, attack: balanced.attack, defense: balanced.defense, speed: balanced.speed, evasion: balanced.evasion }, { hp: 180, pp: 42, attack: 84, defense: 84, speed: 1, evasion: 0.01 });
});

test("buildWeakEnemyStats uses floor 6-9 band", () => {
  const attack = buildWeakEnemyStats(6, "attack");
  const balanced = buildWeakEnemyStats(9, "balanced");
  assert.deepEqual({ hp: attack.hp, pp: attack.pp, attack: attack.attack, defense: attack.defense, speed: attack.speed }, { hp: 355, pp: 45, attack: 128, defense: 85, speed: 2 });
  assert.deepEqual({ pp: balanced.pp, attack: balanced.attack, defense: balanced.defense }, { pp: 54, attack: 102, defense: 102 });
});

test("buildWeakEnemyStats uses floor 11-12 band", () => {
  const balanced = buildWeakEnemyStats(11, "balanced");
  assert.deepEqual({ hp: balanced.hp, pp: balanced.pp, attack: balanced.attack, defense: balanced.defense, speed: balanced.speed }, { hp: 450, pp: 78, attack: 144, defense: 120, speed: 3 });
});

test("buildWeakEnemyStats uses floor 14-15 band", () => {
  const defense = buildWeakEnemyStats(14, "defense");
  assert.deepEqual({ hp: defense.hp, pp: defense.pp, attack: defense.attack, defense: defense.defense, speed: defense.speed }, { hp: 480, pp: 70, attack: 165, defense: 165, speed: 5 });
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

test("applyPerfectVictoryBuff increases every stat by 10% with upward rounding", () => {
  assert.deepEqual(applyPerfectVictoryBuff(baseStats), {
    hp: 110,
    maxHp: 110,
    pp: 44,
    maxPp: 44,
    attack: 22,
    defense: 33,
    speed: 5,
    evasion: 0.11,
  });
  assert.equal(applyPerfectVictoryBuff({ ...baseStats, evasion: 0.9 }).evasion, 0.95);
});

test("applyBossUpgrade applies floor-specific multipliers", () => {
  assert.equal(applyBossUpgrade(baseStats, 5).attack, 40);
  assert.deepEqual({ pp: applyBossUpgrade(baseStats, 10).pp, maxPp: applyBossUpgrade(baseStats, 10).maxPp }, { pp: 80, maxPp: 80 });
  assert.equal(applyBossUpgrade(baseStats, 13).defense, 60);
  assert.deepEqual({ hp: applyBossUpgrade(baseStats, 16).hp, maxHp: applyBossUpgrade(baseStats, 16).maxHp }, { hp: 200, maxHp: 200 });
  // floor 17 is now handled by applyBossMultiplyUpgrade
  assert.deepEqual(applyBossUpgrade(baseStats, 17), baseStats);
});

test("applyBossMultiplyUpgrade applies floor 17 single-key multipliers", () => {
  const hp = applyBossMultiplyUpgrade(baseStats, "hp");
  assert.deepEqual({ hp: hp.hp, maxHp: hp.maxHp }, { hp: 200, maxHp: 200 });
  assert.equal(applyBossMultiplyUpgrade(baseStats, "defense").defense, 60);
  assert.equal(applyBossMultiplyUpgrade(baseStats, "attack", 1.5).attack, 30);
  assert.deepEqual(
    { pp: applyBossMultiplyUpgrade(baseStats, "pp", 1.2).pp, maxPp: applyBossMultiplyUpgrade(baseStats, "pp", 1.2).maxPp },
    { pp: 48, maxPp: 48 },
  );
  assert.equal(hp.evasion, baseStats.evasion);
});

test("isWeakFloor and isBossFloor classify floors", () => {
  assert.equal(isWeakFloor(1), true);
  assert.equal(isWeakFloor(5), false);
  assert.equal(isWeakFloor(18), false);
  assert.equal(isBossFloor(5), true);
  assert.equal(isBossFloor(20), true);
  assert.equal(isBossFloor(6), false);
});

test("boss multipliers round every affected stat upward without changing other stats", () => {
  const stats = { ...baseStats, hp: 101, maxHp: 101, pp: 51, maxPp: 51, attack: 21, defense: 31 };
  for (const multiplier of [1.2, 1.5, 2]) {
    for (const key of ["hp", "pp", "attack", "defense"] as const) {
      const result = applyBossMultiplyUpgrade(stats, key, multiplier);
      const expected = { ...stats, [key]: Math.ceil(stats[key] * multiplier) };
      if (key === "hp") expected.maxHp = Math.ceil(stats.maxHp * multiplier);
      if (key === "pp") expected.maxPp = Math.ceil(stats.maxPp * multiplier);
      assert.deepEqual(result, expected);
    }
  }
  assert.equal(stats.hp, 101);
});

test("multipliers remove floating point noise before ceiling and remain integer over repeated upgrades", () => {
  const noisy = 100.00000000000001;
  const stats = { ...baseStats, hp: noisy, maxHp: noisy, pp: noisy, maxPp: noisy, attack: noisy, defense: noisy };
  for (const key of ["hp", "pp", "attack", "defense"] as const) {
    assert.equal(applyBossMultiplyUpgrade(stats, key, 1.2)[key], 120);
  }
  assert.deepEqual(applyTypeCorrection({ pp: noisy, attack: noisy, defense: noisy }, "balanced"),
    { pp: 120, attack: 120, defense: 120 });
  let result = { ...baseStats, attack: 101 };
  for (const multiplier of [1.2, 1.5, 1.2]) {
    result = applyBossMultiplyUpgrade(result, "attack", multiplier);
    result = applyPerfectVictoryBuff(result);
    assert.ok(Number.isInteger(result.attack));
  }
});
