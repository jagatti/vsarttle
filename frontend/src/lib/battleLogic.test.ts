import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableActions, getDamageMultiplier, resolveTurn } from "@/lib/battleLogic";
import type { ActionType, PlayerBattleState } from "@/types/game";

const makePlayer = (id: string): PlayerBattleState => ({
  id,
  nickname: id,
  imageDataUrl: "",
  stats: {
    hp: 100,
    maxHp: 100,
    pp: 40,
    maxPp: 40,
    attack: 100,
    defense: 80,
    speed: 5,
    evasion: 0,
  },
  characterType: "balanced",
  currentHp: 100,
  currentPp: 40,
  chargeMultiplier: 1,
  lastActionCategory: null,
});

test("getAvailableActions blocks previous category and PP shortage", () => {
  const player = makePlayer("a");
  player.lastActionCategory = "magic";
  player.currentPp = 5;
  const actions = getAvailableActions(player);
  assert.deepEqual(actions.sort(), ["attack", "barrier", "charge"].sort());
});

test("resolveTurn applies attack vs attack formula with defense mitigation", () => {
  const a = makePlayer("a");
  const b = makePlayer("b");
  const actions: Record<string, ActionType> = { a: "attack", b: "attack" };
  const result = resolveTurn({ turn: 1, players: { a, b }, actions, rng: () => 0.99 });
  const expectedDamage = 100 - 80 / 2;
  assert.equal(result.nextStates.a.currentHp, 100 - expectedDamage);
  assert.equal(result.nextStates.b.currentHp, 100 - expectedDamage);
});

test("getAvailableActions returns no actions while paralyzed", () => {
  const player = makePlayer("a");
  player.paralyzedNextTurn = true;
  assert.deepEqual(getAvailableActions(player), []);
});

test("resolveTurn: paralyzed player deals no damage while opponent's action still lands", () => {
  const a = makePlayer("a");
  a.paralyzedNextTurn = true;
  const b = makePlayer("b");
  const actions: Record<string, ActionType> = { a: "paralysis", b: "attack" };
  const result = resolveTurn({ turn: 1, players: { a, b }, actions, rng: () => 0.99 });
  const expectedDamage = 100 - 80 / 2;
  // Attacker b takes no damage back since paralyzed a cannot act.
  assert.equal(result.nextStates.b.currentHp, 100);
  assert.equal(result.nextStates.a.currentHp, 100 - expectedDamage);
  // The paralysis status is consumed after this turn.
  assert.equal(result.nextStates.a.paralyzedNextTurn, false);
});

test("getDamageMultiplier changes at >15 and >20 turns", () => {
  assert.equal(getDamageMultiplier(15), 1);
  assert.equal(getDamageMultiplier(16), 2);
  assert.equal(getDamageMultiplier(20), 2);
  assert.equal(getDamageMultiplier(21), 3);
});

test("resolveTurn applies global damage multiplier on long turns", () => {
  const a = makePlayer("a");
  a.paralyzedNextTurn = true;
  const b = makePlayer("b");
  const actions: Record<string, ActionType> = { a: "paralysis", b: "attack" };

  const turn16 = resolveTurn({ turn: 16, players: { a, b }, actions, rng: () => 0.99 });
  assert.equal(turn16.damageEvents[0].amount, 120);

  const turn21 = resolveTurn({ turn: 21, players: { a, b }, actions, rng: () => 0.99 });
  assert.equal(turn21.damageEvents[0].amount, 180);
});
