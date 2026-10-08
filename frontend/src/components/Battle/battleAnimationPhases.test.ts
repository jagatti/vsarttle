import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAnimationPhaseToDisplayResources,
  buildDisplayBattleResources,
  getPhaseImpactDelayMs,
  getPhaseSeDelayMs,
  getTurnAnimationPhases,
  MOTION_IMPACT_DELAY_MS,
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
  assert.equal(phases[1].damageEvents.length, 0);
  assert.deepEqual(phases[2].damageEvents, turnResult.damageEvents);
});

test("getTurnAnimationPhases shows barrier counter damage when the barrier is bashed into the charging player", () => {
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

  assert.equal(phases.length, 2);
  assert.equal(phases[0].actorId, "enemy");
  assert.equal(phases[0].motionType, "chargeConcentration");
  assert.deepEqual(phases[0].chargeEvents, turnResult.chargeEvents);
  assert.equal(phases[0].damageEvents.length, 0);
  assert.equal(phases[1].actorId, "me");
  assert.equal(phases[1].motionType, "barrierBash");
  assert.deepEqual(phases[1].damageEvents, turnResult.damageEvents);
  assert.equal(getPhaseImpactDelayMs(phases[1]), MOTION_IMPACT_DELAY_MS.barrierBash);
});

test("getTurnAnimationPhases bashes the barrier into a paralyzed player who stays stunned", () => {
  const me = makePlayer("me", { stats: { ...makePlayer("tmp").stats, speed: 8 } });
  const enemy = makePlayer("enemy", { stats: { ...makePlayer("tmp").stats, speed: 2 } });
  const turnResult = makeTurnResult({ me, enemy }, { me: "paralysis", enemy: "barrier" });
  turnResult.damageEvents = [{ from: "enemy", to: "me", amount: 9, avoided: false, reason: "こうげき", phaseHint: "counter" }];

  const phases = getTurnAnimationPhases(turnResult, me, enemy);

  assert.deepEqual(phases.map((phase) => [phase.actorId, phase.motionType, phase.damageEvents.length]), [
    ["me", "paralysisStun", 0],
    ["enemy", "barrierBash", 1],
  ]);
});

test("getPhaseImpactDelayMs matches each motion's hit frame and keeps impact phases immediate", () => {
  assert.equal(getPhaseImpactDelayMs({ motionType: "attackLunge", sourceActionType: "attack" }), 255);
  assert.equal(getPhaseImpactDelayMs({ motionType: "magicBlast", sourceActionType: "magicWeak" }), 442);
  assert.equal(getPhaseImpactDelayMs({ motionType: "magicBlast", sourceActionType: "magicStrong" }), 510);
  assert.equal(getPhaseImpactDelayMs({ motionType: "barrierClash", sourceActionType: "barrier" }), 230);
  assert.equal(getPhaseImpactDelayMs({ motionType: "none" }), 0);
  assert.equal(getPhaseImpactDelayMs({ motionType: "chargeConcentration", sourceActionType: "charge" }), 0);
  assert.equal(getPhaseSeDelayMs({ motionType: "magicReflect", sourceActionType: "magicWeak" }), MOTION_IMPACT_DELAY_MS.magicReflect);
  for (const delay of Object.values(MOTION_IMPACT_DELAY_MS)) assert.ok(delay < 850);
});

test("getTurnAnimationPhases shows both walls when barriers clash", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const phases = getTurnAnimationPhases(makeTurnResult({ me, enemy }, { me: "barrier", enemy: "barrier" }), me, enemy);
  assert.deepEqual(phases.map((phase) => [phase.motionType, phase.targetMotionType]), [
    ["barrierClash", "barrierClash"],
    ["barrierClash", "barrierClash"],
  ]);
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
  const afterThird = applyAnimationPhaseToDisplayResources(afterSecond, { me, enemy }, phases[2]);

  assert.deepEqual(startingDisplay, {
    me: { currentHp: 80, currentPp: 10 },
    enemy: { currentHp: 90, currentPp: 30 },
  });
  assert.deepEqual(afterFirst, {
    me: { currentHp: 100, currentPp: 20 },
    enemy: { currentHp: 90, currentPp: 30 },
  });
  assert.deepEqual(afterSecond, {
    me: { currentHp: 100, currentPp: 20 },
    enemy: { currentHp: 90, currentPp: 30 },
  });
  assert.deepEqual(afterThird, {
    me: { currentHp: 65, currentPp: 20 },
    enemy: { currentHp: 90, currentPp: 30 },
  });
});

test("getTurnAnimationPhases always places charge recovery before damage phases", () => {
  const me = makePlayer("me", { stats: { ...makePlayer("tmp").stats, speed: 2 } });
  const enemy = makePlayer("enemy", { stats: { ...makePlayer("tmp").stats, speed: 9 } });
  const turnResult = makeTurnResult({ me, enemy }, { me: "charge", enemy: "attack" });
  turnResult.chargeEvents = [{ playerId: "me", hpRecover: 25, ppRecover: 10 }];
  turnResult.damageEvents = [{ from: "enemy", to: "me", amount: 18, avoided: false, reason: "こうげき" }];

  const phases = getTurnAnimationPhases(turnResult, me, enemy);

  assert.deepEqual(phases[0].chargeEvents, turnResult.chargeEvents);
  assert.equal(phases[0].damageEvents.length, 0);
  assert.ok(phases.slice(1).some((phase) => phase.damageEvents.length > 0));
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
  assert.equal(phases[2].targetMotionType, "barrierBreak");
});

for (const action of ["attack", "magicWeak"] as const) {
  for (const barrierSide of ["me", "enemy"] as const) {
    for (const barrierIsFaster of [true, false]) {
      test(`${action} vs barrier: ${barrierSide} barrier ${barrierIsFaster ? "faster" : "slower"} deploys before the strike and hit`, () => {
        const me = makePlayer("me", { stats: { ...makePlayer("me").stats, speed: barrierIsFaster === (barrierSide === "me") ? 9 : 2 } });
        const enemy = makePlayer("enemy", { stats: { ...makePlayer("enemy").stats, speed: barrierIsFaster === (barrierSide === "enemy") ? 9 : 2 } });
        const barrierId = barrierSide;
        const attackerId = barrierSide === "me" ? "enemy" : "me";
        const result = makeTurnResult({ me, enemy }, { [barrierId]: "barrier", [attackerId]: action });
        result.actionOrder = me.stats.speed > enemy.stats.speed ? ["me", "enemy"] : ["enemy", "me"];
        result.damageEvents = [{
          from: action === "attack" ? attackerId : barrierId,
          to: action === "attack" ? barrierId : attackerId,
          amount: 18,
          avoided: false,
          reason: action === "attack" ? "こうげき" : "バリア反射",
        }];
        result.nextStates = {
          me: { ...me, currentPp: attackerId === "me" && action === "magicWeak" ? 30 : me.currentPp },
          enemy: { ...enemy, currentPp: attackerId === "enemy" && action === "magicWeak" ? 30 : enemy.currentPp },
        };

        const phases = getTurnAnimationPhases(result, me, enemy);
        assert.deepEqual(phases.map((phase) => phase.actorId), [barrierId, attackerId, attackerId]);
        assert.deepEqual(phases.map((phase) => phase.motionType), ["barrierWall", action === "attack" ? "attackLunge" : "magicReflect", "none"]);
        assert.equal(phases[1].targetMotionType, "barrierWall");
        assert.deepEqual(phases.map((phase) => phase.damageEvents.length), [0, 0, 1]);
        assert.equal(phases[2].targetMotionType, action === "attack" ? "barrierBreak" : undefined);

        const players = { me, enemy };
        const afterBarrier = applyAnimationPhaseToDisplayResources(buildDisplayBattleResources([me, enemy]), players, phases[0]);
        const afterAttack = applyAnimationPhaseToDisplayResources(afterBarrier, players, phases[1]);
        const afterHit = applyAnimationPhaseToDisplayResources(afterAttack, players, phases[2]);
        assert.deepEqual(afterAttack, afterBarrier);
        assert.equal(afterHit[result.damageEvents[0].to].currentHp, 82);
        assert.equal(afterHit[attackerId].currentPp, action === "magicWeak" ? 30 : 40);
      });
    }
  }
}

test("reflected damage and pain share follow the barrier, magic and hit phases; misses have no successful hit", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const result = makeTurnResult({ me, enemy }, { me: "magicStrong", enemy: "barrier" });
  result.damageEvents = [
    { from: "enemy", to: "me", amount: 18, avoided: false, reason: "バリア反射" },
    { from: "me", to: "enemy", amount: 3, avoided: false, reason: "ペインシェア" },
  ];
  const phases = getTurnAnimationPhases(result, me, enemy);
  assert.deepEqual(phases.map((phase) => phase.damageEvents.map((event) => event.reason)), [[], [], ["バリア反射"], ["ペインシェア"]]);
  result.damageEvents = [{ from: "enemy", to: "me", amount: 0, avoided: true, reason: "バリア反射" }];
  const missPhases = getTurnAnimationPhases(result, me, enemy);
  assert.deepEqual(missPhases.map((phase) => phase.damageEvents.length), [0, 0, 1]);
  const display = buildDisplayBattleResources([me, enemy]);
  assert.deepEqual(applyAnimationPhaseToDisplayResources(display, { me, enemy }, missPhases[2]), display);
});

test("attack vs barrier delays pain share until after the barrier breaks and takes damage", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const result = makeTurnResult({ me, enemy }, { me: "attack", enemy: "barrier" });
  result.damageEvents = [
    { from: "me", to: "enemy", amount: 18, avoided: false, reason: "こうげき" },
    { from: "enemy", to: "me", amount: 3, avoided: false, reason: "ペインシェア" },
  ];
  const phases = getTurnAnimationPhases(result, me, enemy);
  assert.deepEqual(phases.map((phase) => phase.damageEvents.map((event) => event.reason)), [[], [], ["こうげき"], ["ペインシェア"]]);
  assert.equal(phases[2].targetMotionType, "barrierBreak");
});

test("voidmination status changes do not reveal final PP before the cut-in", () => {
  const me = makePlayer("me");
  const enemy = makePlayer("enemy");
  const result = makeTurnResult({ me, enemy }, { me: "magicWeak", enemy: "barrier" });
  result.nextStates = { me: { ...me, currentPp: 12 }, enemy };
  result.voidminationTriggered = true;
  const phases = getTurnAnimationPhases(result, me, enemy);
  const display = buildDisplayBattleResources([me, enemy]);
  assert.equal(applyAnimationPhaseToDisplayResources(display, { me, enemy }, phases[2]).me.currentPp, 40);
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
