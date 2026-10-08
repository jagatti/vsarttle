import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerBattleState } from "@/types/game";
import {
  applyCoopRevivalCost,
  applyCoopUpgrade,
  advanceCoopRewardPhase,
  advanceCoopTurnCounters,
  buildCoopUpgradeChoices,
  getCoopAvailableActions,
  getCoopAlivePlayerIds,
  getCoopChargeMultiplierAfterAction,
  getCoopChargeAuraStage,
  getCoopNextPlayerId,
  getCoopResultData,
  getCoopRewardPlayerId,
  getCoopChoiceDisabledReason,
  getCoopFirstSelectableChoiceIndex,
  isCoopChoiceDisabled,
  getCoopStartingPlayerId,
  getCoopTurnOutcome,
  resolveCoopTurn,
  resetCoopFloorTurn,
  reviveCoopPlayer,
  startCoopBattle,
  isCoopPresentationComplete,
  getCoopSkillTurn,
  type CoopSnapshot,
  type CoopUpgradeChoice,
} from "@/lib/coopRoguelike";
import { getRoguelikeBossUpgradeChoices, pickRoguelikeWeakFloorUpgradeSlots } from "@/lib/roguelikeUpgrades";
import { TURN_SECONDS, PARALYSIS_TURN_SECONDS, POST_TURN_DELAY_MS, getRoguelikeTurnSeconds } from "@/lib/roguelikeTiming";
import { buildRoguelikeSkillEffects } from "@/lib/roguelikeSkills";

function player(id: string, currentHp = 100): PlayerBattleState {
  return {
    id,
    nickname: id,
    imageDataUrl: "",
    stats: { hp: 100, maxHp: 100, pp: 50, maxPp: 50, attack: 100, defense: 100, speed: 1, evasion: 0 },
    characterType: "balanced",
    currentHp,
    currentPp: 50,
    chargeMultiplier: 1,
    lastActionCategory: null,
  };
}

test("co-op starts on alternating layers and skips a defeated player", () => {
  const players = { p1: player("p1"), p2: player("p2") };
  assert.equal(getCoopStartingPlayerId(players, 1, ["p1", "p2"]), "p1");
  assert.equal(getCoopStartingPlayerId(players, 2, ["p1", "p2"]), "p2");
  assert.equal(getCoopStartingPlayerId({ ...players, p1: player("p1", 0) }, 1, ["p1", "p2"]), "p2");
  assert.equal(getCoopNextPlayerId({ ...players, p2: player("p2", 0) }, "p1", false), "p1");
});

test("co-op paralysis consumes the active player's turn before handoff", () => {
  const players = { p1: player("p1"), p2: player("p2") };
  assert.equal(getCoopNextPlayerId(players, "p1", true), "p1");
  assert.equal(getCoopNextPlayerId(players, "p1", false), "p2");
});

test("an active player afflicted with paralysis keeps the next hand until their forced turn is spent", () => {
  const result = resolveCoopTurn({
    turn: 1,
    players: { p1: player("p1"), p2: player("p2") },
    enemy: player("enemy"),
    activePlayerId: "p1",
    playerAction: "attack",
    enemyAction: "magicWeak",
    chargeMultiplier: 1,
    playerIds: ["p1", "p2"],
    weakMagicSelections: { enemy: { kinds: ["paralysis"] } },
    rng: () => 0.99,
  });
  assert.equal(result.players.p1?.paralyzedNextTurn, true);
  assert.equal(result.nextPlayerId, "p1");
});

test("co-op consecutive-action restriction is tracked per player", () => {
  const p1 = player("p1");
  assert.deepEqual(getCoopAvailableActions(p1, 1, null), ["attack", "magicWeak", "magicStrong", "barrier", "charge"]);
  assert.deepEqual(getCoopAvailableActions(p1, 3, "attack"), ["magicWeak", "magicStrong", "barrier", "charge"]);
  assert.deepEqual(getCoopAvailableActions(p1, 3, null), ["attack", "magicWeak", "magicStrong", "barrier", "charge"]);
});

test("co-op charge stacks across players to 2.25x and expires on any non-charge action", () => {
  const afterP1 = getCoopChargeMultiplierAfterAction(1, "charge");
  const afterP2 = getCoopChargeMultiplierAfterAction(afterP1, "charge");
  assert.equal(afterP2, 2.25);
  assert.equal(getCoopChargeMultiplierAfterAction(afterP2, "barrier"), 1);
});

test("co-op charge aura stages follow the shared multiplier", () => {
  assert.equal(getCoopChargeAuraStage(1), "none");
  assert.equal(getCoopChargeAuraStage(1.5), "charged");
  assert.equal(getCoopChargeAuraStage(2.25), "overcharged");
});

test("co-op turn counters advance globally and reset only the floor turn between layers", () => {
  const afterAction = advanceCoopTurnCounters({ turn: 8, floorTurn: 4, totalTurn: 7 });
  assert.deepEqual(afterAction, { turn: 9, floorTurn: 5, totalTurn: 8 });
  assert.deepEqual(resetCoopFloorTurn(afterAction), { turn: 9, floorTurn: 1, totalTurn: 8 });
  assert.deepEqual(getCoopResultData({ floor: 5, totalTurn: 42 }), { floorReached: 5, totalTurn: 42 });
});

test("co-op turn resolution passes shared charge into the next player's damage", () => {
  const players = { p1: player("p1"), p2: player("p2") };
  const enemy = player("enemy");
  const first = resolveCoopTurn({
    turn: 1,
    players,
    enemy,
    activePlayerId: "p1",
    playerAction: "charge",
    enemyAction: "barrier",
    chargeMultiplier: 1,
    playerIds: ["p1", "p2"],
    rng: () => 0.99,
  });
  const second = resolveCoopTurn({
    turn: 2,
    players: first.players,
    enemy: first.enemy,
    activePlayerId: "p2",
    playerAction: "charge",
    enemyAction: "barrier",
    chargeMultiplier: first.chargeMultiplier,
    playerIds: ["p1", "p2"],
    rng: () => 0.99,
  });
  const third = resolveCoopTurn({
    turn: 3,
    players: second.players,
    enemy: second.enemy,
    activePlayerId: "p1",
    playerAction: "attack",
    enemyAction: "barrier",
    chargeMultiplier: second.chargeMultiplier,
    playerIds: ["p1", "p2"],
    rng: () => 0.99,
  });
  assert.equal(first.chargeMultiplier, 1.5);
  assert.equal(first.players.p2?.currentHp, 100);
  assert.equal(second.chargeMultiplier, 2.25);
  assert.equal(third.turnResult.damageEvents.find((event) => event.from === "p1")?.chargeMultiplier, 2.25);
  assert.equal(third.chargeMultiplier, 1);
});

test("co-op damage multiplier follows the floor turn, not the cumulative turn", () => {
  const resolveAt = (turn: number) => resolveCoopTurn({
    turn,
    players: { p1: player("p1"), p2: player("p2") },
    enemy: player("enemy"),
    activePlayerId: "p1",
    playerAction: "attack",
    enemyAction: "barrier",
    chargeMultiplier: 1,
    playerIds: ["p1", "p2"],
    rng: () => 0.99,
  }).turnResult.damageEvents.find((event) => event.from === "p1")?.amount;
  assert.equal(resolveAt(16), resolveAt(1)! * 2);
});

test("co-op floor clear and mutual defeat outcomes require a surviving teammate", () => {
  assert.equal(getCoopTurnOutcome({ p1: player("p1", 1), p2: player("p2", 0) }, 0), "floor-clear");
  assert.equal(getCoopTurnOutcome({ p1: player("p1", 0), p2: player("p2", 0) }, 0), "game-over");
  assert.equal(getCoopTurnOutcome({ p1: player("p1", 0), p2: player("p2", 0) }, 20), "game-over");
});

test("co-op rewards follow layer parity except for surviving boss last attackers", () => {
  const players = { p1: player("p1"), p2: player("p2") };
  assert.equal(getCoopRewardPlayerId(players, 1, ["p1", "p2"], { bossFloor: false, lastAttackerId: "p2" }), "p1");
  assert.equal(getCoopRewardPlayerId(players, 2, ["p1", "p2"], { bossFloor: true, lastAttackerId: "p1" }), "p1");
  assert.equal(getCoopRewardPlayerId(
    { ...players, p2: player("p2", 0) },
    2,
    ["p1", "p2"],
    { bossFloor: true, lastAttackerId: "p2" },
  ), "p1");
  assert.equal(getCoopRewardPlayerId(
    players,
    2,
    ["p1", "p2"],
    { bossFloor: true, lastAttackerId: "p2", excludedIds: ["p2"] },
  ), "p1");
});

test("co-op revival keeps at least one HP and restores a teammate to half HP/PP with cleared conditions", () => {
  const payer = applyCoopRevivalCost(player("p1", 2));
  const revived = reviveCoopPlayer({
    ...player("p2", 0),
    paralyzedNextTurn: true,
    barrierBanTurns: 2,
    chargedPreviousTurn: true,
  });
  assert.equal(payer.currentHp, 1);
  assert.equal(revived.currentHp, 50);
  assert.equal(revived.currentPp, 25);
  assert.equal(revived.paralyzedNextTurn, false);
  assert.equal(revived.barrierBanTurns, 0);
  assert.equal(revived.chargedPreviousTurn, false);
});

  function snapshot(floor = 1): CoopSnapshot {
    return {
      runId: "run", floor, turn: 1, floorTurn: 1, totalTurn: 0, actedPlayerIds: [], playerIds: ["p1", "p2"], activePlayerId: "p1",
      players: { p1: player("p1"), p2: player("p2") }, enemy: player("enemy"),
      stage: "vs", turnResult: null, chargeMultiplier: 1, deadline: 0,
      excludedPlayerIds: [], pendingRevivalId: null, rewardPlayerId: null, upgradeChoices: [],
      rewardPhase: 1, pickedChoiceIndex: null,
      outcome: null, status: "", acquiredWeakMagicKinds: {}, acquiredSkills: {},
      acquiredHealingSkills: {}, floorDamageTaken: 0, perfectVictoryFloor: null,
    };
  }

function rewardSnapshot(floor = 1): CoopSnapshot {
  const current = snapshot(floor);
  const rewardPlayerId = getCoopRewardPlayerId(current.players, floor, current.playerIds, {
    bossFloor: floor === 5, lastAttackerId: "p2",
  });
  return {
    ...current, stage: "upgrading", rewardPlayerId,
    upgradeChoices: [
      { kind: "weak-stat", rarity: 1, key: "attack", amount: 10 },
      { kind: "weak-magic", rarity: 3, effectKind: "paralysis", effectName: "まひ" },
      { kind: "weak-stat", rarity: 1, key: "defense", amount: 10 },
    ],
  };
}

test("weak-floor rewards alternate the first picker and hand unchanged remaining slots to the partner", () => {
  for (const floor of [1, 2]) {
    const current = rewardSnapshot(floor);
    const firstId = floor === 1 ? "p1" : "p2";
    const secondId = floor === 1 ? "p2" : "p1";
    current.acquiredWeakMagicKinds[secondId] = ["paralysis"];
    const upgraded = applyCoopUpgrade(current, firstId, current.upgradeChoices[0]!);
    const next = advanceCoopRewardPhase(upgraded, 0, () => { throw new Error("Must not reroll"); })!;
    assert.equal(next.rewardPlayerId, secondId);
    assert.equal(next.rewardPhase, 2);
    assert.equal(next.pickedChoiceIndex, 0);
    assert.equal(next.upgradeChoices, current.upgradeChoices);
    assert.equal(next.players[firstId]!.stats.attack, 110);
    assert.equal(getCoopChoiceDisabledReason(next, secondId, 0), "相手が選んだ枠");
    assert.equal(getCoopChoiceDisabledReason(next, secondId, 1), "取得済み");
    assert.equal(getCoopFirstSelectableChoiceIndex(next), 2);
    const finished = applyCoopUpgrade(next, secondId, next.upgradeChoices[2]!);
    assert.equal(finished.players[secondId]!.stats.defense, 110);
    assert.equal(advanceCoopRewardPhase(finished, 2), null);
    assert.equal(current.rewardPhase, 1);
  }
});

test("both invalid remaining rewards reroll only those slots and always yield selectable choices", () => {
  const invalidChoices: CoopUpgradeChoice[] = [
    { kind: "weak-magic", rarity: 3, effectKind: "paralysis", effectName: "まひ" },
    { kind: "skill", skillId: "attackResistance", ...{ rarity: 1 as const, label: "", description: "" } },
    { kind: "skill", skillId: "guts", ...{ rarity: 3 as const, label: "", description: "" } },
  ];
  for (const left of invalidChoices) {
    for (const right of invalidChoices) {
      for (const pickedIndex of [0, 1, 2]) {
        const current = rewardSnapshot();
        current.acquiredWeakMagicKinds.p2 = ["paralysis"];
        current.acquiredSkills.p2 = { attackResistance: 3, guts: 1 };
        const picked = current.upgradeChoices[0]!;
        current.upgradeChoices = [left, right];
        current.upgradeChoices.splice(pickedIndex, 0, picked);
        const upgraded = applyCoopUpgrade(current, "p1", picked);
        for (const roll of [0, 0.5, 0.99]) {
          const next = advanceCoopRewardPhase(upgraded, pickedIndex, () => roll)!;
          assert.equal(next.upgradeChoices.length, 3);
          assert.equal(next.upgradeChoices[pickedIndex], picked);
          assert.notEqual(next.upgradeChoices, current.upgradeChoices);
          for (const index of [0, 1, 2]) {
            assert.equal(isCoopChoiceDisabled(next, "p2", index), index === pickedIndex);
          }
        }
      }
    }
  }
});

test("one capped or non-stackable skill is disabled without rerolling the other available reward", () => {
  for (const skillId of ["attackResistance", "guts"] as const) {
    const current = rewardSnapshot();
    current.acquiredSkills.p2 = { [skillId]: skillId === "guts" ? 1 : 3 };
    current.upgradeChoices[1] = { kind: "skill", skillId, rarity: 1, label: "", description: "" };
    const next = advanceCoopRewardPhase(current, 0, () => { throw new Error("Must not reroll"); })!;
    assert.equal(next.upgradeChoices, current.upgradeChoices);
    assert.equal(getCoopChoiceDisabledReason(next, "p2", 1), skillId === "guts" ? "取得済み" : "取得上限");
    assert.equal(getCoopFirstSelectableChoiceIndex(next), 2);
  }
});

test("choice validation rejects out-of-turn, picked, and invalid indices but permits consumable repeats", () => {
  const current = rewardSnapshot();
  for (const index of [-1, 3, 0.5, NaN, Infinity]) assert.ok(isCoopChoiceDisabled(current, "p1", index));
  assert.ok(isCoopChoiceDisabled(current, "p2", 0));
  current.acquiredSkills.p1 = { smallHeal: 10, attackResistance: 2 };
  current.upgradeChoices[0] = { kind: "skill", skillId: "smallHeal", rarity: 1, label: "", description: "" };
  current.upgradeChoices[1] = { kind: "skill", skillId: "attackResistance", rarity: 1, label: "", description: "" };
  assert.equal(getCoopFirstSelectableChoiceIndex(current), 0);
  assert.equal(isCoopChoiceDisabled(current, "p1", 1), false);
  current.stage = "battle";
  assert.ok(isCoopChoiceDisabled(current, "p1", 0));
});

test("timeout selects the first available slot in either phase and synchronized snapshots retain picked slots", () => {
  const current = rewardSnapshot();
  assert.equal(getCoopFirstSelectableChoiceIndex(current), 0);
  for (const pickedIndex of [1, 2]) {
    const upgraded = applyCoopUpgrade(current, "p1", current.upgradeChoices[pickedIndex]!);
    const next = advanceCoopRewardPhase(upgraded, pickedIndex)!;
    const restored: CoopSnapshot = JSON.parse(JSON.stringify(next));
    assert.equal(restored.rewardPhase, 2);
    assert.equal(restored.pickedChoiceIndex, pickedIndex);
    assert.equal(restored.rewardPlayerId, "p2");
    assert.ok(isCoopChoiceDisabled(restored, "p2", pickedIndex));
    assert.equal(getCoopFirstSelectableChoiceIndex(restored), 0);
  }
  const blockedFirst = rewardSnapshot();
  blockedFirst.upgradeChoices[0] = blockedFirst.upgradeChoices[1]!;
  blockedFirst.acquiredWeakMagicKinds.p2 = ["paralysis"];
  const next = advanceCoopRewardPhase(blockedFirst, 1)!;
  assert.equal(getCoopFirstSelectableChoiceIndex(next), 2);
});

test("shortBattle shared by either ally is unavailable to the second picker", () => {
  const current = rewardSnapshot();
  current.acquiredSkills.p1 = { shortBattle: 1 };
  current.upgradeChoices[1] = { kind: "skill", skillId: "shortBattle", rarity: 1, label: "", description: "" };
  const next = advanceCoopRewardPhase(current, 0, () => { throw new Error("Must not reroll"); })!;
  assert.equal(getCoopChoiceDisabledReason(next, "p2", 1), "取得済み");
});

test("boss rewards, revival offers, and a single survivor never open a second reward phase", () => {
  for (const floor of [5, 10, 13, 16, 17]) {
    const current = rewardSnapshot(floor);
    assert.equal(advanceCoopRewardPhase(current, 0), null);
  }
  const revival = rewardSnapshot();
  revival.pendingRevivalId = "p2";
  assert.equal(advanceCoopRewardPhase(revival, 0), null);
  const single = rewardSnapshot();
  single.players.p2 = player("p2", 0);
  assert.equal(advanceCoopRewardPhase(single, 0), null);
  const excluded = rewardSnapshot();
  excluded.excludedPlayerIds = ["p2"];
  assert.equal(advanceCoopRewardPhase(excluded, 0), null);
});

test("the sole survivor disconnecting during rewards leaves no valid picker and requires game over", () => {
  const current = rewardSnapshot();
  current.players.p1 = player("p1", 0);
  current.rewardPlayerId = "p2";
  current.pendingRevivalId = "p1";
  current.excludedPlayerIds = ["p2"];
  assert.deepEqual(getCoopAlivePlayerIds(current.players, current.excludedPlayerIds), []);
  assert.equal(getCoopTurnOutcome(current.players, 0, current.excludedPlayerIds), "game-over");
  assert.equal(getCoopFirstSelectableChoiceIndex(current), -1);
  assert.equal(advanceCoopRewardPhase(current, 0), null);
});

  test("co-op weak-floor choices reuse solo rarity/skill/weak-magic slots with slot one intact", () => {
    const current = snapshot(2);
    const expected = pickRoguelikeWeakFloorUpgradeSlots(2, [], 3, () => 0.8, {
      currentHp: 100, maxHp: 100,
    }).map((slot) => slot.kind === "stat" ? { ...slot, kind: "weak-stat" } : slot);
    assert.deepEqual(buildCoopUpgradeChoices(current, "p1", false, () => 0.8), expected);
    const revival = buildCoopUpgradeChoices(current, "p1", true, () => 0.8);
    assert.deepEqual(revival[0], expected[0]);
    assert.equal(revival.length, 3);
    assert.equal(revival[2]?.kind, "revival");
  });

  test("co-op boss rewards replace only full heal with revival and never invent rewards on floors 18/19", () => {
    for (const floor of [5, 10, 13, 16, 17]) {
      const current = snapshot(floor);
      const expected = getRoguelikeBossUpgradeChoices(floor);
      assert.deepEqual(buildCoopUpgradeChoices(current, "p1", false), expected);
      const revival = buildCoopUpgradeChoices(current, "p1", true);
      assert.deepEqual(revival.slice(0, 2), expected.slice(0, 2));
      assert.equal(revival[2]?.kind, "revival");
    }
    for (const floor of [18, 19, 20]) assert.deepEqual(buildCoopUpgradeChoices(snapshot(floor), "p1", true), []);
  });

  test("co-op revival charges current HP without healing the payer first", () => {
    const current = snapshot();
    current.players.p1 = player("p1", 30);
    current.players.p2 = player("p2", 0);
    current.pendingRevivalId = "p2";
    const next = applyCoopUpgrade(current, "p1", { kind: "revival", label: "蘇生の儀式" });
    assert.equal(next.players.p1?.currentHp, 20);
    assert.equal(next.players.p2?.currentHp, 0);
    assert.equal(current.players.p1.currentHp, 30);
  });

  test("co-op skills and weak magic are personal rewards and are supplied to battle resolution", () => {
    let current = snapshot();
    current = applyCoopUpgrade(current, "p1", { kind: "weak-magic", rarity: 3, effectKind: "paralysis", effectName: "まひ" });
    assert.deepEqual(current.acquiredWeakMagicKinds.p1, ["paralysis"]);
    assert.equal(current.acquiredWeakMagicKinds.p2, undefined);
    current = applyCoopUpgrade(current, "p1", { kind: "skill", rarity: 3, skillId: "guts", label: "", description: "" });
    assert.equal(current.acquiredSkills.p1?.guts, 1);
    assert.equal(current.acquiredSkills.p2, undefined);
    const result = resolveCoopTurn({
      turn: 1, players: { ...current.players, p1: player("p1", 1) }, enemy: player("enemy"),
      activePlayerId: "p1", playerAction: "charge", enemyAction: "attack",
      chargeMultiplier: 1, playerIds: current.playerIds, rng: () => 0.99,
      skillEffects: { p1: buildRoguelikeSkillEffects(current.acquiredSkills.p1 ?? {}) },
    });
    assert.equal(result.players.p1?.currentHp, 1);
    assert.equal(result.players.p1?.roguelikeGutsUsed, true);
    assert.equal(result.players.p2?.currentHp, 100);
  });

  test("VS/switch/speech completion starts the shared 30s or paralysis 3s deadline only in battle", () => {
    assert.equal(TURN_SECONDS, 30);
    assert.equal(PARALYSIS_TURN_SECONDS, 3);
    assert.equal(POST_TURN_DELAY_MS, 4200);
    for (const stage of ["vs", "switching", "speech"] as const) {
      const current = { ...snapshot(), stage };
      assert.equal(current.deadline, 0);
      const next = startCoopBattle(current, 1000);
      assert.equal(next.stage, "battle");
      assert.equal(next.deadline, 31000);
      assert.equal(current.stage, stage);
      current.players.p1 = { ...current.players.p1!, paralyzedNextTurn: true };
      assert.equal(getRoguelikeTurnSeconds(current.players.p1), 3);
      assert.equal(startCoopBattle(current, 1000).deadline, 4000);
    }
    for (const stage of ["loading", "transition", "resolving", "upgrading", "result", "battle"] as const) {
      const current = { ...snapshot(), stage };
      assert.equal(startCoopBattle(current, 1000), current);
    }
    const current = { ...snapshot(), activePlayerId: null };
    assert.equal(startCoopBattle(current, 1000), current);
  });

  test("host waits for both presentations, except disconnected peers, and cannot finish other stages", () => {
    for (const stage of ["vs", "resolving"] as const) {
      const current = { ...snapshot(), stage };
      assert.equal(isCoopPresentationComplete(current, new Set()), false);
      assert.equal(isCoopPresentationComplete(current, new Set(["p1"])), false);
      assert.equal(isCoopPresentationComplete(current, new Set(["p1", "p2"])), true);
      current.excludedPlayerIds = ["p2"];
      assert.equal(isCoopPresentationComplete(current, new Set(["p1"])), true);
    }
    assert.equal(isCoopPresentationComplete({ ...snapshot(), stage: "battle" }, new Set(["p1", "p2"])), false);
  });

  test("filter protects the active player's first floor action", () => {
    const current = snapshot();
    const run = (skillTurn: number) => resolveCoopTurn({
      turn: 1, skillTurn, players: current.players, enemy: current.enemy!,
      activePlayerId: "p1", playerAction: "charge", enemyAction: "attack",
      chargeMultiplier: 1, playerIds: current.playerIds, rng: () => 0.99,
      skillEffects: { p1: { filter: true } },
    });
    assert.equal(run(1).players.p1?.currentHp, 100);
    assert.ok(run(2).turnResult.damageEvents.some((event) => event.to === "p1" && event.amount > 0));
  });

    test("each ally's filter protects their own first action even when the other ally starts", () => {
      const current = snapshot();
      current.actedPlayerIds = ["p1"];
      assert.equal(getCoopSkillTurn(current, "p1"), 2);
      assert.equal(getCoopSkillTurn(current, "p2"), 1);
      const run = (playerId: string) => resolveCoopTurn({
        turn: 22, skillTurn: getCoopSkillTurn(current, playerId),
        players: current.players, enemy: current.enemy!, activePlayerId: playerId,
        playerAction: "charge", enemyAction: "attack", chargeMultiplier: 1,
        playerIds: current.playerIds, rng: () => 0.99,
        skillEffects: { [playerId]: { filter: true } },
      });
      assert.equal(run("p2").players.p2?.currentHp, 100);
      assert.ok(run("p1").turnResult.damageEvents.some((event) => event.to === "p1" && event.amount > 0));
      current.actedPlayerIds = [];
      assert.equal(getCoopSkillTurn(current, "p1"), 1);
      assert.equal(getCoopSkillTurn(current, "p2"), 1);
    });
