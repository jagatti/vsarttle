import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRoguelikeAutoRecovery,
  applyRoguelikeSkillReward,
  buildRoguelikeSkillEffects,
  buildRoguelikeSkillsTooltip,
  ROGUELIKE_SKILLS,
  ROGUELIKE_SKILL_BALANCE,
  type AcquiredSkills,
  type SkillId,
} from "@/lib/roguelikeSkills";
import type { PlayerBattleState } from "@/types/game";

function makePlayer(overrides: Partial<PlayerBattleState> = {}): PlayerBattleState {
  return {
    id: "player", nickname: "テスト", imageDataUrl: "", characterType: "balanced",
    stats: { hp: 101, maxHp: 101, pp: 51, maxPp: 51, attack: 80, defense: 80, speed: 8, evasion: 0 },
    currentHp: 10, currentPp: 2, chargeMultiplier: 1, lastActionCategory: null,
    paralyzedNextTurn: true,
    ...overrides,
  };
}

test("registry contains stable IDs with complete metadata and rarity pools", () => {
  assert.deepEqual(Object.keys(ROGUELIKE_SKILLS), [
    "smallHeal", "mediumHeal", "largeHeal", "attackResistance", "magicResistance",
    "barrierResistance", "tieBoost", "ppRegen", "statusResistance", "filter", "ppAbsorb", "hpRegen",
    "pursuit", "fightSpirit", "guts",
  ]);
  const expectedPools = {
    1: ["smallHeal", "attackResistance", "magicResistance", "barrierResistance", "tieBoost", "pursuit"],
    2: ["mediumHeal", "ppRegen", "statusResistance", "filter", "ppAbsorb", "fightSpirit"],
    3: ["largeHeal", "hpRegen", "guts"],
  };
  for (const rarity of [1, 2, 3] as const) {
    assert.deepEqual(Object.values(ROGUELIKE_SKILLS).filter((skill) => skill.rarity === rarity).map((skill) => skill.id), expectedPools[rarity]);
  }
  for (const [id, skill] of Object.entries(ROGUELIKE_SKILLS)) {
    assert.equal(skill.id, id);
    assert.ok(skill.label.length && skill.description.length);
    assert.equal(skill.maxStacks, id.endsWith("Resistance") && id !== "statusResistance" ? 3 : 1);
    assert.equal(skill.consumable, id.endsWith("Heal"));
  }
});

test("registry uses requested labels and precise barrier, filter and PP absorption descriptions", () => {
  assert.equal(ROGUELIKE_SKILLS.attackResistance.label, "こうげき耐性");
  assert.equal(ROGUELIKE_SKILLS.magicResistance.label, "まほう耐性");
  assert.equal(ROGUELIKE_SKILLS.statusResistance.label, "異常耐性");
  assert.equal(ROGUELIKE_SKILLS.tieBoost.description, "あいこ時、与ダメージが10%増加する。チャージ同士のときは、回復量が25%→35%になる。");
  for (const wording of ["衝突", "一方的", "反射"]) {
    assert.ok(ROGUELIKE_SKILLS.barrierResistance.description.includes(wording));
  }
  assert.match(ROGUELIKE_SKILLS.filter.description, /1ターン目.*すべて.*0/);
  assert.match(ROGUELIKE_SKILLS.filter.description, /痛み分け.*状態異常は防がない/);
  assert.match(ROGUELIKE_SKILLS.ppAbsorb.description, /バリア.*反射.*実際に消費.*20%/);
  assert.match(ROGUELIKE_SKILLS.ppAbsorb.description, /ときだけ.*端数切り上げ/);
  assert.match(ROGUELIKE_SKILLS.pursuit.description, /まひ.*チャージ.*50ダメージ/);
  assert.match(ROGUELIKE_SKILLS.fightSpirit.description, /バランス型.*防御.*20%.*ダメージ.*20%/);
  assert.match(ROGUELIKE_SKILLS.guts.description, /一度だけ.*HP1.*1ラン/);
});

test("central balance constants match the skill and offer contracts", () => {
  assert.deepEqual(ROGUELIKE_SKILL_BALANCE, {
    healRatios: { smallHeal: 0.3, mediumHeal: 0.55, largeHeal: 0.85 },
    resistancePerStack: 0.1, maxResistanceStacks: 3, tieDamageMultiplier: 1.1,
    tieChargeRecovery: 0.35, autoRecoveryRatio: 0.05, statusResistanceChance: 0.5,
    ppAbsorbRatio: 0.2, healthyRecoveryWeight: 0.3, healthyHpRatio: 0.9, lowHpRatio: 0.4,
  });
});

test("empty acquired skills and consumables yield no battle effects", () => {
  assert.deepEqual(buildRoguelikeSkillEffects({}), {});
  assert.deepEqual(buildRoguelikeSkillEffects({ smallHeal: 1, mediumHeal: 1, largeHeal: 1 }), {});
});

test("effects use resistance stack counts and flags for every other passive", () => {
  assert.deepEqual(buildRoguelikeSkillEffects({
    attackResistance: 1, magicResistance: 2, barrierResistance: 3,
    tieBoost: 1, ppRegen: 1, statusResistance: 1, filter: 1, ppAbsorb: 1, hpRegen: 1,
    pursuit: 1, fightSpirit: 1, guts: 1,
  }), {
    attackResistance: 1, magicResistance: 2, barrierResistance: 3,
    tieBoost: true, ppRegen: true, statusResistance: true, filter: true, ppAbsorb: true, hpRegen: true,
    pursuit: true, fightSpirit: true, guts: true,
  });
});

test("effects sanitize over-cap, negative, fractional and nonfinite stack counts", () => {
  const acquired = { attackResistance: 20, magicResistance: 2.9, barrierResistance: -1, tieBoost: Infinity, ppRegen: NaN, hpRegen: 0 };
  assert.deepEqual(buildRoguelikeSkillEffects(acquired), { attackResistance: 3, magicResistance: 2 });
  assert.equal(acquired.attackResistance, 20);
});

test("each heal restores both resources with upward rounding without retaining consumables", () => {
  for (const skillId of ["smallHeal", "mediumHeal", "largeHeal"] as const) {
    const player = makePlayer();
    const acquired: AcquiredSkills = { [skillId]: 1, tieBoost: 1 };
    const result = applyRoguelikeSkillReward(player, skillId, acquired);
    const ratio = ROGUELIKE_SKILL_BALANCE.healRatios[skillId];
    assert.equal(result.player.currentHp, 10 + Math.ceil(101 * ratio));
    assert.equal(result.player.currentPp, 2 + Math.ceil(51 * ratio));
    assert.deepEqual(result.acquiredSkills, { tieBoost: 1 });
    assert.equal(result.player.paralyzedNextTurn, true);
    assert.strictEqual(result.player.stats, player.stats);
    assert.equal(player.currentHp, 10);
    assert.equal(acquired[skillId], 1);
  }
});

test("heal rewards cap resources at maxima and can be selected repeatedly", () => {
  const player = makePlayer({ currentHp: 100, currentPp: 50 });
  const first = applyRoguelikeSkillReward(player, "smallHeal", {});
  const second = applyRoguelikeSkillReward(first.player, "smallHeal", first.acquiredSkills);
  assert.equal(second.player.currentHp, 101);
  assert.equal(second.player.currentPp, 51);
  assert.deepEqual(second.acquiredSkills, {});
});

test("passive rewards stack up to registry caps without changing the player or input", () => {
  for (const skill of Object.values(ROGUELIKE_SKILLS).filter((skill) => !skill.consumable)) {
    const player = makePlayer();
    let acquired: AcquiredSkills = {};
    for (let i = 0; i < 5; i++) {
      const before = { ...acquired };
      const result = applyRoguelikeSkillReward(player, skill.id, acquired);
      assert.strictEqual(result.player, player);
      assert.deepEqual(acquired, before);
      acquired = result.acquiredSkills;
      assert.equal(acquired[skill.id], Math.min(i + 1, skill.maxStacks));
    }
  }
  assert.equal(applyRoguelikeSkillReward(makePlayer(), "attackResistance", { attackResistance: 100 }).acquiredSkills.attackResistance, 3);
});

test("new passive skills are single-acquisition skills", () => {
  for (const skillId of ["pursuit", "fightSpirit", "guts"] as const) {
    assert.equal(ROGUELIKE_SKILLS[skillId].maxStacks, 1);
    assert.equal(ROGUELIKE_SKILLS[skillId].consumable, false);
    assert.equal(applyRoguelikeSkillReward(makePlayer(), skillId, {}).acquiredSkills[skillId], 1);
  }
});

test("auto recovery supports each flag independently and rounds up from maxima", () => {
  const player = makePlayer();
  const hp = applyRoguelikeAutoRecovery(player, { hpRegen: true });
  const pp = applyRoguelikeAutoRecovery(player, { ppRegen: true });
  const both = applyRoguelikeAutoRecovery(player, { hpRegen: true, ppRegen: true });
  assert.deepEqual([hp.currentHp, hp.currentPp], [16, 2]);
  assert.deepEqual([pp.currentHp, pp.currentPp], [10, 5]);
  assert.deepEqual([both.currentHp, both.currentPp], [16, 5]);
  assert.equal(both.paralyzedNextTurn, true);
  assert.strictEqual(both.stats, player.stats);
  assert.equal(player.currentHp, 10);
  assert.strictEqual(applyRoguelikeAutoRecovery(player, {}), player);
});

test("auto recovery caps resources and never revives defeated players", () => {
  const full = applyRoguelikeAutoRecovery(makePlayer({ currentHp: 100, currentPp: 50 }), { hpRegen: true, ppRegen: true });
  assert.deepEqual([full.currentHp, full.currentPp], [101, 51]);
  for (const currentHp of [0, -5]) {
    const dead = makePlayer({ currentHp });
    assert.strictEqual(applyRoguelikeAutoRecovery(dead, { hpRegen: true, ppRegen: true }), dead);
  }
});

test("auto recovery never subtracts resources already above their maxima", () => {
  const player = makePlayer({ currentHp: 120, currentPp: 80 });
  const recovered = applyRoguelikeAutoRecovery(player, { hpRegen: true, ppRegen: true });
  assert.deepEqual([recovered.currentHp, recovered.currentPp], [120, 80]);
});

test("tooltip lists only acquired passives, descriptions and capped resistance stacks", () => {
  assert.equal(buildRoguelikeSkillsTooltip({}), "まだスキルを習得していません");
  assert.equal(buildRoguelikeSkillsTooltip({ smallHeal: 1, hpRegen: 0 }), "まだスキルを習得していません");
  const acquired: AcquiredSkills = { attackResistance: 99, tieBoost: 1, filter: 1 };
  const tooltip = buildRoguelikeSkillsTooltip(acquired);
  for (const id of ["attackResistance", "tieBoost", "filter"] as SkillId[]) {
    assert.ok(tooltip.includes(ROGUELIKE_SKILLS[id].label));
    assert.ok(tooltip.includes(ROGUELIKE_SKILLS[id].description));
  }
  assert.ok(tooltip.includes("あいこ時、与ダメージが10%増加する。チャージ同士のときは、回復量が25%→35%になる。"));
  assert.ok(tooltip.includes("×3"));
  assert.ok(!tooltip.includes("×99"));
});
