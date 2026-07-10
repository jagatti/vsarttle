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
  turnResult.damageEvents = [{ from: "me", to: "enemy", amount: 12, avoided: false, reason: "バリアカウンター" }];
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
