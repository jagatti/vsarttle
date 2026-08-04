import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAnimationPhaseToDisplayResources,
  buildDisplayBattleResources,
  getTurnAnimationPhases,
} from "@/components/Battle/battleAnimationPhases";
import type { ActionType, PlayerBattleState, TurnResult } from "@/types/game";

const makePlayer = (id: string, overrides: Partial<PlayerBattleState> = {}): PlayerBattleState => ({
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
    evasion: 0,
  },
  characterType: "balanced",
  currentHp: 100,
  currentPp: 40,
  chargeMultiplier: 1,
  lastActionCategory: null,
  ...overrides,
});

const makeTurnResult = (players: Record<string, PlayerBattleState>, actions: Record<string, ActionType>): TurnResult => ({
  turn: 1,
  actions,
  logs: [],
  damageEvents: [],
  chargeEvents: [],
  magicEffectEvents: [],
  suppressedByTieBanIds: [],
  winnerId: null,
  nextStates: players,
});

test("getTurnAnimationPhases keeps reflected damage on the magic caster's phase", () => {
  const me = makePlayer("me", { stats: { ...makePlayer("tmp").stats, speed: 4 } });
  const enemy = makePlayer("enemy", { stats: { ...makePlayer("tmp").stats, speed: 8 } });
  const turnResult = makeTurnResult(
    { me, enemy },
    {
      me: "magicStrong",
      enemy: "barrier",
    },
  );
  turnResult.damageEvents = [{ from: "enemy", to: "me", amount: 18, avoided: false, reason: "バリア反射" }];

  const phases = getTurnAnimationPhases(turnResult, me, enemy);

  assert.equal(phases[0].actorId, "enemy");
  assert.equal(phases[0].damageEvents.length, 0);
  assert.equal(phases[1].actorId, "me");
  assert.deepEqual(phases[1].damageEvents, turnResult.damageEvents);
});

test("getTurnAnimationPhases keeps barrier counter damage on the charging player's phase", () => {
  const me = makePlayer("me", { stats: { ...makePlayer("tmp").stats, speed: 3 } });
  const enemy = makePlayer("enemy", { stats: { ...makePlayer("tmp").stats, speed: 7 } });
  const turnResult = makeTurnResult(
    { me, enemy },
    {
      me: "barrier",
      enemy: "charge",
    },
  );
  turnResult.damageEvents = [{ from: "me", to: "enemy", amount: 12, avoided: false, reason: "こうげき", phaseHint: "counter" }];
  turnResult.chargeEvents = [{ playerId: "enemy", hpRecover: 25, ppRecover: 10 }];

  const phases = getTurnAnimationPhases(turnResult, me, enemy);

  assert.equal(phases[0].actorId, "enemy");
  assert.deepEqual(phases[0].chargeEvents, turnResult.chargeEvents);
  assert.deepEqual(phases[0].damageEvents, turnResult.damageEvents);
  assert.equal(phases[1].actorId, "me");
  assert.equal(phases[1].damageEvents.length, 0);
});

test("applyAnimationPhaseToDisplayResources updates only the active phase and preserves clamping", () => {
  const me = makePlayer("me", { currentHp: 80, currentPp: 10, stats: { ...makePlayer("tmp").stats, maxPp: 40, speed: 9 } });
  const enemy = makePlayer("enemy", { currentHp: 90, currentPp: 30, stats: { ...makePlayer("tmp").stats, speed: 4 } });
  const turnResult = makeTurnResult(
    {
      me: { ...me, currentHp: 80, currentPp: 20 },
      enemy: { ...enemy, currentHp: 70, currentPp: 30 },
    },
    {
      me: "charge",
      enemy: "attack",
    },
  );
  turnResult.chargeEvents = [{ playerId: "me", hpRecover: 25, ppRecover: 10 }];
  turnResult.damageEvents = [{ from: "enemy", to: "me", amount: 35, avoided: false, reason: "こうげき" }];

  const phases = getTurnAnimationPhases(turnResult, me, enemy);
  const startingDisplay = buildDisplayBattleResources([me, enemy]);
  const afterFirst = applyAnimationPhaseToDisplayResources(startingDisplay, { me, enemy }, phases[0]);
  const afterSecond = applyAnimationPhaseToDisplayResources(afterFirst, { me, enemy }, phases[1]);

  assert.deepEqual(startingDisplay, {
    me: { currentHp: 80, currentPp: 10 },
    enemy: { currentHp: 90, currentPp: 30 },
  });
  assert.deepEqual(afterFirst, {
    me: { currentHp: 100, currentPp: 20 },
    enemy: { currentHp: 90, currentPp: 30 },
  });
  assert.deepEqual(afterSecond, {
    me: { currentHp: 65, currentPp: 20 },
    enemy: { currentHp: 90, currentPp: 30 },
  });
});

// ---- わざモーションテスト ----

test("getTurnAnimationPhases assigns magicReflect to magic caster when facing barrier", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const turnResult = makeTurnResult({ me, enemy }, { me: "magicStrong", enemy: "barrier" });
  const phases = getTurnAnimationPhases(turnResult, me, enemy);
  const mePhase = phases.find((p) => p.actorId === "me");
  const enemyPhase = phases.find((p) => p.actorId === "enemy");
  assert.equal(mePhase?.motionType, "magicReflect");
  assert.equal(enemyPhase?.motionType, "barrierWall");
});

test("getTurnAnimationPhases assigns attackLunge to attacker and barrierWall+barrierBreak to barrier user", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const turnResult = makeTurnResult({ me, enemy }, { me: "attack", enemy: "barrier" });
  const phases = getTurnAnimationPhases(turnResult, me, enemy);
  const mePhase = phases.find((p) => p.actorId === "me");
  const enemyPhase = phases.find((p) => p.actorId === "enemy");
  assert.equal(mePhase?.motionType, "attackLunge");
  assert.equal(enemyPhase?.motionType, "barrierWall");
  assert.equal(enemyPhase?.targetMotionType, "barrierBreak");
});

test("getTurnAnimationPhases assigns barrierClash to both when barrier vs barrier", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const turnResult = makeTurnResult({ me, enemy }, { me: "barrier", enemy: "barrier" });
  const phases = getTurnAnimationPhases(turnResult, me, enemy);
  for (const phase of phases) {
    assert.equal(phase.motionType, "barrierClash");
  }
});

test("getTurnAnimationPhases assigns magicBlast to magic caster vs attack", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const turnResult = makeTurnResult({ me, enemy }, { me: "magicWeak", enemy: "attack" });
  const phases = getTurnAnimationPhases(turnResult, me, enemy);
  const mePhase = phases.find((p) => p.actorId === "me");
  const enemyPhase = phases.find((p) => p.actorId === "enemy");
  assert.equal(mePhase?.motionType, "magicBlast");
  assert.equal(mePhase?.sourceActionType, "magicWeak");
  assert.equal(enemyPhase?.motionType, "none");
});

test("getTurnAnimationPhases assigns no dedicated attack motion when attack faces strong magic", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const turnResult = makeTurnResult({ me, enemy }, { me: "attack", enemy: "magicStrong" });
  const phases = getTurnAnimationPhases(turnResult, me, enemy);
  const mePhase = phases.find((p) => p.actorId === "me");
  const enemyPhase = phases.find((p) => p.actorId === "enemy");
  assert.equal(mePhase?.motionType, "none");
  assert.equal(mePhase?.sourceActionType, "attack");
  assert.equal(enemyPhase?.motionType, "magicBlast");
  assert.equal(enemyPhase?.sourceActionType, "magicStrong");
});

test("getTurnAnimationPhases preserves strong magic sourceActionType for reflected magic", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const turnResult = makeTurnResult({ me, enemy }, { me: "magicStrong", enemy: "barrier" });
  const phases = getTurnAnimationPhases(turnResult, me, enemy);
  const mePhase = phases.find((p) => p.actorId === "me");
  assert.equal(mePhase?.motionType, "magicReflect");
  assert.equal(mePhase?.sourceActionType, "magicStrong");
});

test("getTurnAnimationPhases assigns chargeConcentration for charge action", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const turnResult = makeTurnResult({ me, enemy }, { me: "charge", enemy: "attack" });
  const phases = getTurnAnimationPhases(turnResult, me, enemy);
  const mePhase = phases.find((p) => p.actorId === "me");
  assert.equal(mePhase?.motionType, "chargeConcentration");
});
