import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableActions, getDamageMultiplier, resolveTurn } from "@/lib/battleLogic";
import type { ActionType, PlayerBattleState, WeakMagicEffectSelection } from "@/types/game";

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
  const actions = getAvailableActions(player, 2);
  assert.deepEqual(actions.sort(), ["attack", "barrier", "charge"].sort());
});

test("getAvailableActions blocks attack and magic while their new ban counters are active", () => {
  const player = makePlayer("a");
  player.attackBanTurns = 1;
  player.magicBanTurns = 2;
  const actions = getAvailableActions(player, 2);
  assert.deepEqual(actions.sort(), ["barrier", "charge"].sort());
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

test("resolveTurn applies custom weak-magic selection effects instead of the legacy default pool", () => {
  const a = makePlayer("a");
  const b = makePlayer("b");
  const selection = {
    oneTurn: "paralysis",
    twoTurn: ["attackBan", "magicBan"],
  } satisfies WeakMagicEffectSelection;
  const result = resolveTurn({
    turn: 1,
    players: { a, b },
    actions: { a: "magicWeak", b: "attack" },
    weakMagicSelections: { a: selection },
    rng: () => 0.4,
  });
  assert.equal(result.nextStates.b.attackBanTurns, 2);
  assert.equal(result.nextStates.b.barrierBanTurns ?? 0, 0);
  assert.equal(result.magicEffectEvents[0]?.effectName, "こうげき禁止");
});

test("resolveTurn can apply tie-ban from a custom weak-magic selection", () => {
  const a = makePlayer("a");
  const b = makePlayer("b");
  const selection = {
    oneTurn: "tieBan",
    twoTurn: ["attackBan", "magicBan"],
  } satisfies WeakMagicEffectSelection;
  const result = resolveTurn({
    turn: 1,
    players: { a, b },
    actions: { a: "magicWeak", b: "attack" },
    weakMagicSelections: { a: selection },
    rng: () => 0.01,
  });
  assert.equal(result.nextStates.b.tieBanActive, true);
  assert.equal(result.magicEffectEvents[0]?.effectName, "あいこ禁止");
  assert.deepEqual(result.suppressedByTieBanIds, []);
});

test("getAvailableActions returns no actions while paralyzed", () => {
  const player = makePlayer("a");
  player.paralyzedNextTurn = true;
  assert.deepEqual(getAvailableActions(player, 2), []);
});

test("getAvailableActions excludes charge on turn 1", () => {
  const player = makePlayer("a");
  const actions = getAvailableActions(player, 1);
  assert.ok(!actions.includes("charge"), "charge should be excluded on turn 1");
  assert.ok(actions.includes("attack"), "attack should be available on turn 1");
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

test("resolveTurn: tie-ban suppresses the affected player's own same-category action", () => {
  const a = makePlayer("a");
  const b = makePlayer("b");
  a.tieBanActive = true;
  const result = resolveTurn({
    turn: 2,
    players: { a, b },
    actions: { a: "attack", b: "attack" },
    rng: () => 0.99,
  });
  assert.equal(result.nextStates.a.currentHp, 40);
  assert.equal(result.nextStates.b.currentHp, 100);
  assert.equal(result.damageEvents.length, 1);
  assert.deepEqual(result.suppressedByTieBanIds, ["a"]);
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

test("resolveTurn: barrier vs paralyzed gives counter damage [defense - opponent.defense/2]", () => {
  const a = makePlayer("a"); // uses barrier
  const b = makePlayer("b"); // paralyzed
  b.paralyzedNextTurn = true;
  // a.defense=80, b.defense=80 → expected = max(1, round(80 - 80/2)) = 40
  const actions: Record<string, ActionType> = { a: "barrier", b: "paralysis" };
  const result = resolveTurn({ turn: 1, players: { a, b }, actions, rng: () => 0.99 });
  assert.equal(result.nextStates.b.currentHp, 100 - 40);
  assert.equal(result.nextStates.a.currentHp, 100); // barrier user takes no damage
});

test("resolveTurn: barrier vs charge uses [attacker.defense*chargeMultiplier - target.defense/2] formula", () => {
  const a = makePlayer("a"); // uses barrier
  const b = makePlayer("b"); // uses charge
  // a.defense=80, b.defense=80 → counter damage = max(1, round(80*1 - 80/2)) = 40
  // b was already at maxHp so charge HP recovery has no effect; b takes 40 counter damage
  const actions: Record<string, ActionType> = { a: "barrier", b: "charge" };
  const result = resolveTurn({ turn: 1, players: { a, b }, actions, rng: () => 0.99 });
  assert.equal(result.nextStates.b.currentHp, 60); // 100 - 40 (counter)
  // barrier user (a) takes no counter damage
  assert.equal(result.nextStates.a.currentHp, 100);
});

test("resolveTurn: chargeMultiplier resets after the turn following charge (turn-based reset)", () => {
  const a = makePlayer("a");
  const b = makePlayer("b");

  // Turn 1: a charges, b also charges (no damage this turn, both heal)
  const result1 = resolveTurn({
    turn: 1,
    players: { a, b },
    actions: { a: "charge", b: "charge" },
    rng: () => 0.99,
  });
  // After turn 1, a should have chargeMultiplier=1.5 and chargedPreviousTurn=true
  assert.equal(result1.nextStates.a.chargeMultiplier, 1.5);
  assert.equal(result1.nextStates.a.chargedPreviousTurn, true);

  // Turn 2: a is paralyzed (cannot act) — the 1.5x boost turn passes without attacking
  const states2 = result1.nextStates;
  states2.a.paralyzedNextTurn = true;
  const result2 = resolveTurn({
    turn: 2,
    players: states2,
    actions: { a: "paralysis", b: "attack" },
    rng: () => 0.99,
  });
  // chargeMultiplier should be reset to 1 after turn 2 (even though a couldn't act)
  assert.equal(result2.nextStates.a.chargeMultiplier, 1);
  assert.equal(result2.nextStates.a.chargedPreviousTurn, false);
});

test("resolveTurn: chargeMultiplier applies to damage on the turn immediately after charge", () => {
  const a = makePlayer("a");
  const b = makePlayer("b");

  // Turn 1: both charge — no combat damage, both get HP/PP recovery and 1.5x multiplier
  const result1 = resolveTurn({
    turn: 1,
    players: { a, b },
    actions: { a: "charge", b: "charge" },
    rng: () => 0.99,
  });
  assert.equal(result1.nextStates.a.chargeMultiplier, 1.5);
  assert.equal(result1.nextStates.a.chargedPreviousTurn, true);

  // Turn 2: a attacks, b uses barrier (attack beats barrier so only a's strike lands)
  const result2 = resolveTurn({
    turn: 2,
    players: result1.nextStates,
    actions: { a: "attack", b: "barrier" },
    rng: () => 0.99,
  });
  // a.attack=100, chargeMultiplier=1.5, b.defense=80 → 100*1.5 - 80/2 = 110
  const bDamageEvent = result2.damageEvents.find((e) => e.to === "b");
  assert.ok(bDamageEvent, "b should have received damage from a's charged attack");
  assert.equal(bDamageEvent!.amount, 110);
  // chargeMultiplier should be reset after turn 2
  assert.equal(result2.nextStates.a.chargeMultiplier, 1);
});
