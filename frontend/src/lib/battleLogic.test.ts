import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
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
