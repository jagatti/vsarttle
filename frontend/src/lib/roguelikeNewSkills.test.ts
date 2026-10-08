import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_WEAK_MAGIC_EFFECTS, applyDefense, getAvailableActions, getDamageAnnouncement,
  getDamageMultiplier, magicCost, resolveTurn,
} from "@/lib/battleLogic";
import {
  buildCoopSkillEffects, buildCoopUpgradeChoices, getCoopAvailableActions,
  resetCoopFloorTurn, resolveCoopTurn, type CoopSnapshot,
} from "@/lib/coopRoguelike";
import {
  applyRoguelikeSkillReward, buildRoguelikeSkillEffects, buildRoguelikeSkillLabels,
  buildRoguelikeSkillsTooltip, ROGUELIKE_SKILLS, type AcquiredSkills,
} from "@/lib/roguelikeSkills";
import { pickRoguelikeWeakFloorUpgradeSlots, rollRoguelikeUpgradeRarity } from "@/lib/roguelikeUpgrades";
import type { ActionType, PlayerBattleState, WeakMagicEffectKind } from "@/types/game";

const newSkills = ["shortBattle", "enhancedMagic", "extraStatus", "underdog"] as const;
const player = (id: string, maxHp = 1000): PlayerBattleState => ({
  id, nickname: id, imageDataUrl: "", characterType: "balanced",
  stats: { hp: maxHp, maxHp, pp: 51, maxPp: 51, attack: 100, defense: 100, speed: id === "a" ? 10 : 5, evasion: 0 },
  currentHp: maxHp, currentPp: 51, chargeMultiplier: 1, lastActionCategory: null,
});
const battle = (
  actions: Record<string, ActionType>,
  extra: Partial<Parameters<typeof resolveTurn>[0]> = {},
) => resolveTurn({
  turn: 2, players: { a: player("a"), b: player("b") }, actions,
  rng: () => 0.99, disableVoidmination: true, ...extra,
});
const sequence = (...values: number[]) => () => {
  assert.ok(values.length > 0, "unexpected extra random draw");
  return values.shift()!;
};

test("new skill rewards, flags, labels and tooltips are unique and describe their contracts", () => {
  const labels = ["短期決戦", "強化魔法", "異常追加", "下克上"];
  const acquired: AcquiredSkills = {};
  for (const [index, id] of newSkills.entries()) {
    const p = player("a");
    const reward = applyRoguelikeSkillReward(p, id, {});
    assert.strictEqual(reward.player, p);
    assert.deepEqual(reward.acquiredSkills, { [id]: 1 });
    assert.deepEqual(applyRoguelikeSkillReward(p, id, reward.acquiredSkills).acquiredSkills, reward.acquiredSkills);
    assert.deepEqual(buildRoguelikeSkillEffects({ [id]: 1 }), { [id]: true });
    assert.deepEqual(buildRoguelikeSkillEffects({ [id]: 0 }), {});
    assert.equal(ROGUELIKE_SKILLS[id].label, labels[index]);
    assert.equal(ROGUELIKE_SKILLS[id].maxStacks, 1);
    assert.equal(ROGUELIKE_SKILLS[id].consumable, false);
    assert.equal(buildRoguelikeSkillsTooltip({ [id]: 1 }), `${labels[index]}: ${ROGUELIKE_SKILLS[id].description}`);
    acquired[id] = 1;
  }
  assert.deepEqual(buildRoguelikeSkillLabels(acquired), labels);
  assert.match(ROGUELIKE_SKILLS.shortBattle.description, /11.*2倍.*21.*3倍.*協力.*2人/);
  assert.match(ROGUELIKE_SKILLS.enhancedMagic.description, /消費PP\+25%.*威力/);
  assert.match(ROGUELIKE_SKILLS.extraStatus.description, /弱まほう.*状態異常.*\+1.*2個以上/);
  assert.match(ROGUELIKE_SKILLS.underdog.description, /最大HP.*低い.*与ダメージ\+50%/);
});

test("shortBattle changes both directions at 11, never stacks at 16 or 21, and defaults remain unchanged", () => {
  assert.equal(getDamageMultiplier(15), 1);
  assert.equal(getDamageMultiplier(15.5), 2);
  assert.equal(getDamageMultiplier(10.5, true), 1);
  for (const [turn, skillFactor, defaultFactor] of [[10, 1, 1], [11, 2, 1], [16, 2, 2], [20, 2, 2], [21, 3, 3]]) {
    assert.equal(getDamageMultiplier(turn, true), skillFactor);
    assert.equal(getDamageMultiplier(turn), defaultFactor);
    for (const owners of [{ a: { shortBattle: true } }, { a: { shortBattle: true }, b: { shortBattle: true } }]) {
      const result = battle({ a: "attack", b: "attack" }, { turn, skillEffects: owners });
      assert.deepEqual(result.damageEvents.map((event) => event.amount), [75 * skillFactor, 75 * skillFactor]);
    }
    assert.deepEqual(battle({ a: "attack", b: "attack" }, { turn }).damageEvents.map((event) => event.amount),
      [75 * defaultFactor, 75 * defaultFactor]);
  }
  assert.deepEqual(battle({ a: "attack", b: "attack" }, {
    turn: 11, forceTripleDamage: true, skillEffects: { a: { shortBattle: true } },
  }).damageEvents.map((event) => event.amount), [225, 225]);
});

test("damage announcements agree with skill and default milestones and forced triple damage", () => {
  const expected = [
    [7, "", ""],
    [8, "あと3ターンで常時ダメージ2倍（短期決戦）", ""],
    [10, "あと1ターンで常時ダメージ2倍（短期決戦）", ""],
    [11, "現在ダメージ2倍中", ""],
    [13, "現在ダメージ2倍中", "あと3ターンで常時ダメージ2倍"],
    [18, "あと3ターンで常時ダメージ3倍（現在2倍）", "あと3ターンで常時ダメージ3倍（現在2倍）"],
    [21, "現在ダメージ3倍中", "現在ダメージ3倍中"],
  ] as const;
  for (const [turn, skill, normal] of expected) {
    assert.equal(getDamageAnnouncement(turn, true), skill);
    assert.equal(getDamageAnnouncement(turn), normal);
    assert.equal(getDamageAnnouncement(turn, true, true), "現在ダメージ3倍中");
    assert.equal(getDamageAnnouncement(turn, false, true), "現在ダメージ3倍中");
  }
});

test("enhancedMagic multiplies raw PP cost before one ceiling and uses that cost for damage and affordability", () => {
  for (const [action, ratio, cost] of [["magicWeak", 0.2, 13], ["magicStrong", 0.4, 26]] as const) {
    const a = player("a");
    assert.equal(magicCost(action, a.stats, { costMultiplier: 1.25 }), cost);
    assert.equal(cost, Math.ceil(a.stats.maxPp * ratio * 1.25));
    assert.notEqual(cost, Math.ceil(Math.ceil(a.stats.maxPp * ratio) * 1.25));
    const hit = battle({ a: action, b: "attack" }, { skillEffects: { a: { enhancedMagic: true } } });
    assert.equal(hit.nextStates.a.currentPp, 51 - cost);
    assert.equal(hit.damageEvents[0].amount, applyDefense(cost * 5, 100));
    for (const pp of [cost - 1, cost]) {
      a.currentPp = pp;
      assert.equal(getAvailableActions(a, 2, { enhancedMagic: true }).includes(action), pp === cost);
      assert.equal(getCoopAvailableActions(a, 1, null, { enhancedMagic: true }).includes(action), pp === cost);
      assert.equal(getAvailableActions(a, 2).includes(action), true);
    }
  }
});

test("enhanced magic reflection uses the caster's cost and PPAbsorb uses actual enhanced PP paid", () => {
  for (const [action, cost] of [["magicWeak", 13], ["magicStrong", 26]] as const) {
    const b = player("b");
    b.currentPp = 0;
    const result = battle({ a: action, b: "barrier" }, {
      players: { a: player("a"), b },
      skillEffects: { a: { enhancedMagic: true }, b: { ppAbsorb: true } },
    });
    assert.equal(result.damageEvents[0].reason, "バリア反射");
    assert.equal(result.damageEvents[0].amount, applyDefense(cost * 5, 100));
    assert.equal(result.nextStates.a.currentPp, 51 - cost);
    assert.equal(result.nextStates.b.currentPp, Math.ceil(cost * 0.2));
  }
  const a = player("a");
  const b = player("b");
  a.currentPp = 2;
  b.currentPp = 0;
  assert.equal(battle({ a: "magicWeak", b: "barrier" }, {
    players: { a, b }, skillEffects: { a: { enhancedMagic: true }, b: { ppAbsorb: true } },
  }).nextStates.b.currentPp, 1);
  const reflectorOnly = battle({ a: "magicWeak", b: "barrier" }, { skillEffects: { b: { enhancedMagic: true } } });
  assert.equal(reflectorOnly.damageEvents[0].amount, applyDefense(11 * 5, 100));
  assert.equal(reflectorOnly.nextStates.a.currentPp, 40);
});

test("extraStatus selects zero, one, or two distinct learned effects without replacement", () => {
  const all = ALL_WEAK_MAGIC_EFFECTS.map((effect) => effect.kind);
  for (const [kinds, count] of [[[], 0], [["paralysis"], 1], [["attackBan", "barrierBan"], 2], [all, 2]] as [WeakMagicEffectKind[], number][]) {
    const result = battle({ a: "magicWeak", b: "attack" }, {
      skillEffects: { a: { extraStatus: true } }, weakMagicSelections: { a: { kinds } },
      rng: () => 0,
    });
    assert.equal(result.magicEffectEvents.length, count);
    assert.equal(new Set(result.magicEffectEvents.map((event) => event.effectName)).size, count);
    assert.ok(result.magicEffectEvents.every((event) => event.casterId === "a" && event.affectedId === "b" && !event.reflected));
    if (count === 2 && kinds.length === 2) {
      assert.equal(result.nextStates.b.attackBanTurns, 2);
      assert.equal(result.nextStates.b.barrierBanTurns, 2);
    }
  }
  assert.equal(battle({ a: "magicWeak", b: "attack" }, {
    skillEffects: { a: { extraStatus: true } },
    weakMagicSelections: { a: { kinds: ["paralysis", "paralysis"] } },
  }).magicEffectEvents.length, 1);
  assert.equal(battle({ a: "magicWeak", b: "attack" }, {
    weakMagicSelections: { a: { kinds: all } },
  }).magicEffectEvents.length, 1);
});

test("extraStatus does not apply on misses or strong magic and resolves callback selections once", () => {
  let calls = 0;
  const selection = (caster: PlayerBattleState) => {
    calls++;
    assert.equal(caster.id, "a");
    return { kinds: ["attackBan", "barrierBan"] satisfies WeakMagicEffectKind[] };
  };
  const hit = battle({ a: "magicWeak", b: "attack" }, {
    skillEffects: { a: { extraStatus: true } }, weakMagicSelections: { a: selection },
  });
  assert.equal(calls, 1);
  assert.equal(hit.magicEffectEvents.length, 2);
  for (const action of ["magicWeak", "magicStrong"] as const) {
    const b = player("b");
    if (action === "magicWeak") b.stats.evasion = 1;
    const result = battle({ a: action, b: "attack" }, {
      players: { a: player("a"), b }, skillEffects: { a: { extraStatus: true } },
      weakMagicSelections: { a: selection },
    });
    assert.deepEqual(result.magicEffectEvents, []);
    assert.equal(result.nextStates.b.attackBanTurns, undefined);
    assert.equal(result.nextStates.b.barrierBanTurns, undefined);
  }
  assert.equal(calls, 1);
});

test("extraStatus reflection remains owned by the caster and resistance rolls independently per effect", () => {
  const selection = { kinds: ["attackBan", "barrierBan"] satisfies WeakMagicEffectKind[] };
  const reflected = battle({ a: "magicWeak", b: "barrier" }, {
    skillEffects: { a: { extraStatus: true } }, weakMagicSelections: { a: selection },
  });
  assert.equal(reflected.magicEffectEvents.length, 2);
  assert.ok(reflected.magicEffectEvents.every((event) => event.casterId === "a" && event.affectedId === "a" && event.reflected));
  assert.equal(reflected.nextStates.a.attackBanTurns, 2);
  assert.equal(reflected.nextStates.a.barrierBanTurns, 2);
  assert.equal(battle({ a: "magicWeak", b: "barrier" }, {
    skillEffects: { b: { extraStatus: true } }, weakMagicSelections: { a: selection },
  }).magicEffectEvents.length, 1);
  for (const reflect of [false, true]) {
    const rolls = [0.99, 0, 0.1, 0, 0.9];
    const result = battle({ a: "magicWeak", b: reflect ? "barrier" : "attack" }, {
      skillEffects: { a: { extraStatus: true, ...(reflect ? { statusResistance: true } : {}) }, b: reflect ? {} : { statusResistance: true } },
      weakMagicSelections: { a: selection }, rng: () => rolls.shift()!,
    });
    assert.equal(rolls.length, 0);
    assert.equal(result.magicEffectEvents.length, 1);
    assert.equal(result.magicEffectEvents[0].effectName, "バリア禁止");
    const affected = result.nextStates[reflect ? "a" : "b"];
    assert.equal(affected.attackBanTurns, undefined);
    assert.equal(affected.barrierBanTurns, 2);
    assert.equal(result.logs.filter((log) => log.includes("特殊効果を防いだ")).length, 1);
  }
});

test("underdog compares current maximum HP strictly, never current HP, and boosts only outgoing damage", () => {
  for (const maxHp of [900, 1000, 1100]) {
    const a = player("a", maxHp);
    a.currentHp = 500;
    const b = player("b");
    b.currentHp = 800;
    const result = battle({ a: "attack", b: "attack" }, { players: { a, b }, skillEffects: { a: { underdog: true } } });
    assert.equal(result.damageEvents.find((event) => event.from === "a")?.amount, maxHp < 1000 ? 113 : 75);
    assert.equal(result.damageEvents.find((event) => event.from === "b")?.amount, 75);
  }
  const grown = player("a", 1100);
  assert.equal(battle({ a: "attack", b: "paralysis" }, {
    players: { a: grown, b: player("b") }, skillEffects: { a: { underdog: true } },
  }).damageEvents[0].amount, 75);
});

test("underdog multiplies attacks, both magic strengths, barrier collision and reflected damage", () => {
  for (const actions of [
    { a: "attack", b: "paralysis" }, { a: "magicWeak", b: "attack" },
    { a: "magicStrong", b: "attack" }, { a: "barrier", b: "barrier" },
    { a: "barrier", b: "magicWeak" },
  ] satisfies Record<string, ActionType>[]) {
    const players = { a: player("a", 900), b: player("b") };
    const base = battle(actions, { players }).damageEvents.find((event) => event.from === "a")!;
    const boosted = battle(actions, { players, skillEffects: { a: { underdog: true } } }).damageEvents.find((event) => event.from === "a")!;
    assert.equal(boosted.amount, Math.round(base.amount * 1.5));
    assert.deepEqual(players.a, player("a", 900));
  }
  const casterOnly = battle({ a: "magicWeak", b: "barrier" }, {
    players: { a: player("a", 900), b: player("b") }, skillEffects: { a: { underdog: true } },
  });
  assert.equal(casterOnly.damageEvents[0].amount, applyDefense(11 * 5, 100));
});

test("underdog multiplies pursuit too and caps only after all damage multipliers", () => {
  const a = player("a", 900);
  const b = player("b");
  b.paralyzedNextTurn = true;
  const pursuitOnly = battle({ a: "attack", b: "paralysis" }, {
    players: { a, b }, skillEffects: { a: { underdog: true, pursuit: true } },
  });
  assert.equal(pursuitOnly.damageEvents[0].amount, 188);
  assert.equal(pursuitOnly.damageEvents[0].pursuitDamage, 75);
  const options = {
    turn: 11, players: { a, b },
    skillEffects: { a: { shortBattle: true, underdog: true, pursuit: true, fightSpirit: true }, b: { fightSpirit: true, attackResistance: 1 } },
  };
  const uncapped = battle({ a: "attack", b: "paralysis" }, options);
  // 75 -> resistance 68 -> short battle 136 -> fight spirit 164 -> pursuit 214
  // -> underdog 321 -> incoming fight spirit 386.
  assert.equal(uncapped.damageEvents[0].amount, 386);
  assert.equal(uncapped.damageEvents[0].pursuitDamage, 90);
  for (const cap of [350, 200]) {
    const capped = battle({ a: "attack", b: "paralysis" }, { ...options, damageCaps: { b: cap } });
    assert.equal(capped.damageEvents[0].amount, cap);
    assert.equal(capped.nextStates.b.currentHp, 1000 - cap);
    assert.equal(capped.damageEvents[0].pursuitDamage, cap === 350 ? 54 : undefined);
  }
});

test("new acquired skills are excluded from offers without changing slot rarity odds", () => {
  const acquiredSkills = Object.fromEntries(newSkills.map((id) => [id, 1])) as AcquiredSkills;
  const offered = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const roll = i / 100;
    const slots = pickRoguelikeWeakFloorUpgradeSlots(2, [], 3, () => roll);
    const excluded = pickRoguelikeWeakFloorUpgradeSlots(2, [], 3, () => roll, { acquiredSkills });
    assert.deepEqual(excluded.map((slot) => slot.rarity), slots.map((slot) => slot.rarity));
    for (const slot of slots) if (slot.kind === "skill") offered.add(slot.skillId);
    assert.ok(excluded.every((slot) => slot.kind !== "skill" || !newSkills.includes(slot.skillId as typeof newSkills[number])));
  }
  for (const rarityRoll of [0, 0.6, 0.9]) {
    for (let i = 0; i < 100; i++) {
      const slots = pickRoguelikeWeakFloorUpgradeSlots(2, [], 2, sequence(0, 0, rarityRoll, i / 100));
      for (const slot of slots) if (slot.kind === "skill") offered.add(slot.skillId);
    }
  }
  for (const id of newSkills) assert.ok(offered.has(id), `offered ${id}`);
  for (const [slot, boundary1, boundary2] of [[1, 0.65, 1], [2, 0.55, 0.88], [3, 0.55, 0.85]]) {
    assert.equal(rollRoguelikeUpgradeRarity(slot, [1, 2, 3], () => boundary1 - 0.0001), 1);
    assert.equal(rollRoguelikeUpgradeRarity(slot, [1, 2, 3], () => boundary1), 2);
    if (slot !== 1) assert.equal(rollRoguelikeUpgradeRarity(slot, [1, 2, 3], () => boundary2), 3);
  }
});

function snapshot(): CoopSnapshot {
  return {
    runId: "run", floor: 2, turn: 21, floorTurn: 11, totalTurn: 20,
    actedPlayerIds: [], playerIds: ["a", "b"], activePlayerId: "b",
    players: { a: player("a"), b: player("b") }, enemy: player("enemy"),
    stage: "battle", turnResult: null, chargeMultiplier: 1, deadline: 0,
    excludedPlayerIds: [], pendingRevivalId: null, rewardPlayerId: null, upgradeChoices: [],
    rewardPhase: 1, pickedChoiceIndex: null,
    outcome: null, status: "", acquiredWeakMagicKinds: {}, acquiredSkills: {},
    acquiredHealingSkills: {}, floorDamageTaken: 0, perfectVictoryFloor: null,
  };
}

test("co-op shares only shortBattle even from an inactive, excluded or defeated owner", () => {
  const current = snapshot();
  current.acquiredSkills = { a: { shortBattle: 1, enhancedMagic: 1, extraStatus: 1, underdog: 1 }, b: { pursuit: 1 } };
  const original = structuredClone(current.acquiredSkills);
  for (const dead of [false, true]) {
    current.players.a.currentHp = dead ? 0 : 1000;
    current.excludedPlayerIds = dead ? ["a"] : [];
    assert.deepEqual(buildCoopSkillEffects(current.acquiredSkills, "a"),
      { shortBattle: true, enhancedMagic: true, extraStatus: true, underdog: true });
    assert.deepEqual(buildCoopSkillEffects(current.acquiredSkills, "b"), { pursuit: true, shortBattle: true });
  }
  assert.deepEqual(current.acquiredSkills, original);
  assert.deepEqual(buildCoopSkillEffects({ a: { enhancedMagic: 1, extraStatus: 1, underdog: 1 }, b: {} }, "b"), {});
  assert.deepEqual(buildCoopSkillEffects({}, "a"), {});
});

test("co-op rewards exclude team shortBattle and all personal acquired skills without sharing other rewards", () => {
  const current = snapshot();
  current.players.a.currentHp = 0;
  current.excludedPlayerIds = ["a"];
  current.acquiredSkills = { a: { shortBattle: 1 }, b: { enhancedMagic: 1, extraStatus: 1, underdog: 1 } };
  const personal = new Set<string>();
  for (let i = 0; i < 100; i++) {
    for (const id of ["b", "a"]) {
      current.players.a.currentHp = id === "b" ? 0 : 1000;
      const choices = buildCoopUpgradeChoices(current, id, false, () => i / 100);
      assert.ok(choices.every((choice) => choice.kind !== "skill" || choice.skillId !== "shortBattle"));
      if (id === "b") {
        assert.ok(choices.every((choice) => choice.kind !== "skill" || !["enhancedMagic", "extraStatus", "underdog"].includes(choice.skillId)));
      } else {
        for (const choice of choices) if (choice.kind === "skill") personal.add(choice.skillId);
      }
      current.players.a.currentHp = 1000;
      for (const rarityRoll of [0.6, 0.9]) {
        for (let i = 0; i < 100; i++) {
          const choices = buildCoopUpgradeChoices(current, "a", false, sequence(0, 0, rarityRoll, i / 100, 0, 0, 0));
          for (const choice of choices) if (choice.kind === "skill") personal.add(choice.skillId);
        }
      }
    }
  }
  for (const id of ["enhancedMagic", "extraStatus", "underdog"]) assert.ok(personal.has(id));
});

test("both co-op players use shared shortBattle at floor boundaries and reset instead of using cumulative turns", () => {
  for (const owner of ["a", "b"]) {
    for (const activePlayerId of ["a", "b"]) {
      const acquiredSkills: Record<string, AcquiredSkills> = { [owner]: { shortBattle: 1 } };
      for (const [floorTurn, factor] of [[10, 1], [11, 2], [16, 2], [20, 2], [21, 3]]) {
        const players = { a: player("a"), b: player("b") };
        if (owner !== activePlayerId) players[owner].currentHp = 0;
        const result = resolveCoopTurn({
          turn: floorTurn, players, enemy: player("enemy"), activePlayerId,
          playerAction: "attack", enemyAction: "attack", chargeMultiplier: 1,
          playerIds: ["a", "b"], rng: () => 0.99, disableVoidmination: true,
          skillEffects: { [activePlayerId]: buildCoopSkillEffects(acquiredSkills, activePlayerId) },
        });
        assert.deepEqual(result.turnResult.damageEvents.map((event) => event.amount), [75 * factor, 75 * factor]);
        assert.deepEqual(result.players[activePlayerId === "a" ? "b" : "a"], players[activePlayerId === "a" ? "b" : "a"]);
      }
      const reset = resetCoopFloorTurn({ turn: 100, floorTurn: 21, totalTurn: 99 });
      const result = resolveCoopTurn({
        turn: reset.floorTurn, players: { a: player("a"), b: player("b") }, enemy: player("enemy"),
        activePlayerId, playerAction: "attack", enemyAction: "attack", chargeMultiplier: 1,
        playerIds: ["a", "b"], rng: () => 0.99, disableVoidmination: true,
        skillEffects: { [activePlayerId]: buildCoopSkillEffects(acquiredSkills, activePlayerId) },
      });
      assert.equal(reset.turn, 100);
      assert.deepEqual(result.turnResult.damageEvents.map((event) => event.amount), [75, 75]);
    }
  }
});
