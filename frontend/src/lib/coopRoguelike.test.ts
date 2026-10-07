import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerBattleState } from "@/types/game";
import {
  applyCoopRevivalCost,
  getCoopAvailableActions,
  getCoopChargeMultiplierAfterAction,
  getCoopNextPlayerId,
  getCoopRewardPlayerId,
  getCoopStartingPlayerId,
  getCoopTurnOutcome,
  resolveCoopTurn,
  reviveCoopPlayer,
} from "@/lib/coopRoguelike";

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
