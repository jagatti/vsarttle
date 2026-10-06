import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBossMagicDamper,
  applyColorDrain,
  applyVoidminationBossForm,
  getOverchargeChargeRecovery,
  getOverchargeMagicCostRatio,
  getPainShareDamage,
  getRoguelikeVoidDominationSourceFloor,
  getVoidminationThreshold,
  mergeVoidminationBossFormStats,
  pickActionOrderBySpeed,
  pickNextVoidminationForm,
  resolveVoidminationDamage,
  shouldSuppressEvasion,
} from "@/lib/roguelikeVoidDomination";
import type { PlayerBattleState } from "@/types/game";

const makePlayer = (id: string): PlayerBattleState => ({
  id,
  nickname: id,
  imageDataUrl: "",
  stats: {
    hp: 100,
    maxHp: 100,
    pp: 40,
    maxPp: 40,
    attack: 80,
    defense: 70,
    speed: 5,
    evasion: 0.2,
  },
  characterType: "balanced",
  currentHp: 100,
  currentPp: 40,
  chargeMultiplier: 1,
  lastActionCategory: null,
});

test("floor 20 reuses floor 19 void-domination effect", () => {
  assert.equal(getRoguelikeVoidDominationSourceFloor(19), 19);
  assert.equal(getRoguelikeVoidDominationSourceFloor(20), 19);
});

test("void-domination threshold is floored to 66% max HP", () => {
  assert.equal(getVoidminationThreshold(999), 659);
  assert.equal(getVoidminationThreshold(666), 439);
});

test("void-domination trigger stops lethal damage at the 66% threshold once", () => {
  assert.deepEqual(
    resolveVoidminationDamage({ currentHp: 999, maxHp: 999, incomingDamage: 5000, alreadyUsed: false }),
    { nextHp: 659, damageTaken: 340, triggered: true },
  );
  assert.deepEqual(
    resolveVoidminationDamage({ currentHp: 999, maxHp: 999, incomingDamage: 5000, alreadyUsed: true }),
    { nextHp: 0, damageTaken: 999, triggered: false },
  );
});

test("magic damper reduces already-active boss magic damage by 25%", () => {
  assert.equal(applyBossMagicDamper(100), 75);
});

test("pain share returns 20% floored damage", () => {
  assert.equal(getPainShareDamage(99), 19);
  assert.equal(getPainShareDamage(5), 1);
});

test("reverse velocity makes the slower unit act first", () => {
  const slow = makePlayer("slow");
  const fast = makePlayer("fast");
  slow.stats.speed = 3;
  fast.stats.speed = 9;
  const [first, second] = pickActionOrderBySpeed({ left: slow, right: fast, rng: () => 0.99, reverse: true });
  assert.equal(first.id, "slow");
  assert.equal(second.id, "fast");
});

test("overcharge charge recovery heals 10% HP and full max PP up to double", () => {
  const boss = makePlayer("boss");
  boss.stats.maxHp = 666;
  boss.stats.maxPp = 99;
  assert.deepEqual(getOverchargeChargeRecovery(boss), {
    hpRecover: 67,
    ppRecover: 99,
    ppCeiling: 198,
  });
});

test("overcharge magic cost ratios are raised to 25% and 50%", () => {
  assert.equal(getOverchargeMagicCostRatio(16, true, "boss", "boss", "magicWeak"), 0.25);
  assert.equal(getOverchargeMagicCostRatio(16, true, "boss", "boss", "magicStrong"), 0.5);
  assert.equal(getOverchargeMagicCostRatio(16, true, "player", "boss", "magicStrong"), null);
});

test("type change reapplies form bonuses from base stats without stacking", () => {
  const base = makePlayer("boss").stats;
  const attack = applyVoidminationBossForm(base, "attack");
  const magic = applyVoidminationBossForm(base, "magic");
  const barrier = applyVoidminationBossForm(base, "defense");
  assert.equal(attack.attack, 100);
  assert.equal(magic.maxPp, 48);
  assert.equal(barrier.defense, 88);
});

test("type change merge preserves unrelated current stat mutations", () => {
  const current = {
    ...makePlayer("boss").stats,
    maxHp: 1234,
    hp: 1234,
    pp: 41,
    maxPp: 41,
  };
  const base = makePlayer("boss").stats;
  const merged = mergeVoidminationBossFormStats(current, base, "magic");
  assert.equal(merged.maxHp, 1234);
  assert.equal(merged.maxPp, 48);
  assert.equal(merged.attack, 80);
});

test("next type-change form never repeats the previous form", () => {
  assert.notEqual(pickNextVoidminationForm(() => 0.99, "attack"), "attack");
});

test("color drain lowers player max stats and heals the boss within max limits", () => {
  const player = makePlayer("player");
  player.stats.maxHp = 250;
  player.stats.hp = 250;
  player.stats.maxPp = 50;
  player.stats.pp = 50;
  player.currentHp = 250;
  player.currentPp = 50;
  const boss = makePlayer("boss");
  boss.stats.maxHp = 900;
  boss.stats.maxPp = 130;
  boss.currentHp = 850;
  boss.currentPp = 100;

  const drained = applyColorDrain(player, boss);
  assert.equal(drained.player.stats.maxHp, 213);
  assert.equal(drained.player.stats.maxPp, 43);
  assert.equal(drained.boss.currentHp, 887);
  assert.equal(drained.boss.currentPp, 107);
});

test("inevitable zone suppresses evasion for both sides", () => {
  assert.equal(shouldSuppressEvasion(19, true), true);
  assert.equal(shouldSuppressEvasion(20, true), true);
  assert.equal(shouldSuppressEvasion(19, false), false);
});
