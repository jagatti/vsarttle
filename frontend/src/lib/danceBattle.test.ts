import assert from "node:assert/strict";
import test from "node:test";
import {
  DANCE_JUDGMENT_POINTS,
  addDanceGauge,
  applyDanceStaminaJudgment,
  canActivateDanceFever,
  createDanceSequence,
  getDanceActionScore,
  getDanceCpuJudgment,
  getDanceCpuMode,
  getDanceCenterChallenge,
  getDanceDancers,
  getDanceGaugePoints,
  getDanceGoal,
  getDanceFeverLimit,
  getDanceNextCenter,
  getDanceRecovery,
  getDanceSequenceLength,
  getDanceStamina,
  getDanceStaminaAfter,
  getDanceTargetTime,
  getDanceVisibleModes,
  isDanceFeverAllowed,
  isDanceFinalKeyWindow,
  judgeDanceTiming,
  resolveDanceProgression,
} from "@/lib/danceBattle";

test("dance timing uses the specified judgement boundaries", () => {
  assert.equal(judgeDanceTiming(22), "PERFECT");
  assert.equal(judgeDanceTiming(-70), "GREAT");
  assert.equal(judgeDanceTiming(115), "GOOD");
  assert.equal(judgeDanceTiming(116), "BAD");
});

test("final key is accepted only from 900ms early through 300ms late", () => {
  assert.equal(isDanceFinalKeyWindow(-900), true);
  assert.equal(isDanceFinalKeyWindow(300), true);
  assert.equal(isDanceFinalKeyWindow(-901), false);
  assert.equal(isDanceFinalKeyWindow(301), false);
});

test("dance stamina and recovery derive from character max stats", () => {
  assert.equal(getDanceStamina(256), 52);
  assert.equal(getDanceRecovery(44), 15);
  assert.equal(getDanceRecovery(0), 10);
});

test("dance patterns preserve the difficulty lengths and recovery X", () => {
  assert.equal(getDanceSequenceLength("normal", 3), 5);
  assert.equal(getDanceSequenceLength("normal", 5), 9);
  assert.equal(getDanceSequenceLength("multiplier", 5), 10);
  assert.deepEqual(createDanceSequence("recovery", 3, () => 0), ["ArrowUp", "X"]);
  assert.equal(createDanceSequence("normal", 5, () => 0).length, 9);
  assert.ok(createDanceSequence("normal", 5, () => 0).filter((key) => key === "X").length >= 1);
  assert.ok(createDanceSequence("normal", 5, () => 0).filter((key) => key === "X").length <= 2);
});

test("dance target timings follow the original sequence formula", () => {
  assert.equal(getDanceTargetTime(1000, 0), 1000 + Math.round(3000 / 1.1));
  assert.equal(getDanceTargetTime(1000, 1) - getDanceTargetTime(1000, 0), Math.round(1400 / 1.1));
});

test("dance CPU boss judgments are stronger and score is kept as base points", () => {
  assert.equal(getDanceCpuJudgment(() => 0.25), "GREAT");
  assert.equal(getDanceCpuJudgment(() => 0.25, true), "PERFECT");
  assert.equal(getDanceActionScore(["PERFECT", "GOOD"], "normal"), 21);
  assert.equal(getDanceActionScore(["PERFECT", "GOOD"], "multiplier"), 21);
  assert.equal(getDanceGaugePoints(52, "multiplier"), 62);
  assert.equal(getDanceGaugePoints(-3, "multiplier"), -3);
  assert.equal(getDanceGaugePoints(10, "normal"), 10);
  assert.deepEqual(DANCE_JUDGMENT_POINTS, { PERFECT: 13, GREAT: 10, GOOD: 8, BAD: 5, MISS: -3 });
});

test("CPU mode probabilities follow stamina, streak, and the specified fallback split", () => {
  assert.equal(getDanceCpuMode(9, 0, () => 0.49), "recovery");
  assert.equal(getDanceCpuMode(9, 0, () => 0.5), "normal");
  assert.equal(getDanceCpuMode(10, 0, () => 0.05), "recovery");
  assert.equal(getDanceCpuMode(10, 0, () => 0.2), "normal");
  assert.equal(getDanceCpuMode(10, 0, () => 0.6), "multiplier");
  assert.equal(getDanceCpuMode(10, 2, () => 0.69), "multiplier");
});

test("dance goals and 1v1 backline behavior match the game rules", () => {
  assert.equal(getDanceGoal(3), 304);
  assert.equal(getDanceGoal(4), 304);
  assert.equal(getDanceGoal(5), 540);
  assert.equal(getDanceDancers("b", 1, true), 0);
  assert.equal(getDanceDancers("b", 1, false), 1);
  assert.equal(getDanceDancers("b", 3, true), 2);
  assert.equal(getDanceDancers("last", 3, false, "red"), 2);
});

test("fever requires two successful actions and is limited by difficulty", () => {
  assert.equal(canActivateDanceFever(1, 0), false);
  assert.equal(canActivateDanceFever(2, 0), true);
  assert.equal(canActivateDanceFever(0, 1), false);
  assert.equal(isDanceFeverAllowed("c", "center", false), true);
  assert.equal(isDanceFeverAllowed("b", "center", false), false);
  assert.equal(isDanceFeverAllowed("last", "backline", false), false);
  assert.equal(isDanceFeverAllowed("b", "center", true), true);
  assert.equal(isDanceFeverAllowed("last", "center", false), true);
  assert.equal(getDanceFeverLimit(3), 4);
  assert.equal(getDanceFeverLimit(5), 8);
});

test("spectators see no input lanes and fever displays only its single-key lane", () => {
  assert.deepEqual(getDanceVisibleModes(false, false), []);
  assert.deepEqual(getDanceVisibleModes(false, true), []);
  assert.deepEqual(getDanceVisibleModes(true, false), ["recovery", "normal", "multiplier"]);
  assert.deepEqual(getDanceVisibleModes(true, true), ["multiplier"]);
});

test("lane first keys are unique and recovery is always selected by up", () => {
  const sequences = {
    recovery: createDanceSequence("recovery", 3),
    normal: createDanceSequence("normal", 3),
    multiplier: createDanceSequence("multiplier", 3),
  };
  assert.equal(sequences.recovery[0], "ArrowUp");
  assert.notEqual(sequences.normal[0], "ArrowUp");
  assert.notEqual(sequences.multiplier[0], "ArrowUp");
  assert.notEqual(sequences.normal[0], sequences.multiplier[0]);
});

test("score comparison uses base points while only positive gauge adds are multiplied and capped", () => {
  assert.equal(getDanceCenterChallenge(13, [
    { id: "tie", mode: "multiplier", base: 13 },
    { id: "higher", mode: "multiplier", base: 14 },
    { id: "normal", mode: "normal", base: 99 },
  ]), "higher");
  assert.equal(getDanceCenterChallenge(13, [{ id: "tie", mode: "multiplier", base: 13 }]), null);
  assert.equal(addDanceGauge(300, getDanceGaugePoints(13, "multiplier"), 304), 304);
  assert.equal(addDanceGauge(2, -3, 304), 0);
});

test("zero stamina converts successful non-recovery judgments to BAD but preserves MISS", () => {
  assert.equal(applyDanceStaminaJudgment("PERFECT", 0, "normal"), "BAD");
  assert.equal(applyDanceStaminaJudgment("PERFECT", 0, "multiplier"), "BAD");
  assert.equal(applyDanceStaminaJudgment("MISS", 0, "normal"), "MISS");
  assert.equal(applyDanceStaminaJudgment("PERFECT", 0, "recovery"), "PERFECT");
  assert.equal(getDanceStaminaAfter(4, { maxHp: 100, maxPp: 0 }, "multiplier", 3), 0);
  assert.equal(getDanceStaminaAfter(4, { maxHp: 100, maxPp: 0 }, "recovery", 0, true), 4);
});

test("central miss selects the next roster member and backline challenges need a strict third-step win", () => {
  assert.deepEqual(getDanceNextCenter([
    { id: "red-first", team: "red" },
    { id: "blue-first", team: "blue" },
    { id: "red-second", team: "red" },
  ], "red-first"), { id: "blue-first", team: "blue" });
  assert.deepEqual(getDanceNextCenter([
    { id: "red-first", team: "red" },
    { id: "blue-first", team: "blue" },
    { id: "red-second", team: "red" },
  ], "blue-first"), { id: "red-first", team: "red" });
  assert.equal(getDanceNextCenter([{ id: "only", team: "red" }], "only"), null);
});

test("opening chooses the highest positive base score, and an all-nonpositive opening repeats", () => {
  const state = {
    phase: "a" as const,
    lastStep: "center" as const,
    center: null,
    centerUsedThird: false,
    scores: { red: 0, blue: 0 },
    goal: 304,
  };
  assert.deepEqual(resolveDanceProgression(state, [
    { id: "red", team: "red", mode: "normal", base: 10, missed: false },
    { id: "blue", team: "blue", mode: "multiplier", base: 13, missed: false },
  ], [{ id: "red", team: "red" }, { id: "blue", team: "blue" }]), {
    phase: "c",
    lastStep: "center",
    center: { id: "blue", team: "blue", base: 13 },
    centerUsedThird: false,
    winner: null,
  });
  assert.equal(resolveDanceProgression(state, [
    { id: "red", team: "red", mode: "normal", base: 0, missed: false },
  ], [{ id: "red", team: "red" }]).phase, "a");
  assert.equal(resolveDanceProgression({
    ...state,
    scores: { red: 304, blue: 0 },
  }, [{ id: "red", team: "red", mode: "normal", base: 13, missed: false }], [
    { id: "red", team: "red" }, { id: "blue", team: "blue" },
  ]).phase, "last");
});

test("center miss forces a roster-head handoff and resets its base score", () => {
  const next = resolveDanceProgression({
    phase: "c",
    lastStep: "center",
    center: { id: "blue", team: "blue", base: 13 },
    centerUsedThird: true,
    scores: { red: 20, blue: 20 },
    goal: 304,
  }, [{ id: "blue", team: "blue", mode: "normal", base: -3, missed: true }], [
    { id: "red", team: "red" }, { id: "blue", team: "blue" }, { id: "red-next", team: "red" },
  ]);
  assert.equal(next.phase, "c");
  assert.deepEqual(next.center, { id: "red", team: "red", base: 0 });
  assert.equal(next.centerUsedThird, false);
});

test("a miss during last dance releases it and rechecks the new center team's goal", () => {
  const next = resolveDanceProgression({
    phase: "last",
    lastStep: "center",
    center: { id: "red", team: "red", base: 10 },
    centerUsedThird: true,
    scores: { red: 304, blue: 304 },
    goal: 304,
  }, [{ id: "red", team: "red", mode: "normal", base: -3, missed: true }], [
    { id: "red", team: "red" }, { id: "blue", team: "blue" },
  ]);
  assert.equal(next.phase, "last");
  assert.equal(next.lastStep, "center");
  assert.deepEqual(next.center, { id: "blue", team: "blue", base: 0 });
});

test("center score and last dance transitions use base points and strict challenges", () => {
  const center = { id: "red-center", team: "red" as const, base: 13 };
  const afterCenter = resolveDanceProgression({
    phase: "c",
    lastStep: "center",
    center,
    centerUsedThird: false,
    scores: { red: 304, blue: 300 },
    goal: 304,
  }, [{ id: center.id, team: "red", mode: "normal", base: 10, missed: false }], [
    { id: center.id, team: "red" }, { id: "blue", team: "blue" },
  ]);
  assert.equal(afterCenter.phase, "last");
  assert.equal(afterCenter.lastStep, "center");
  assert.equal(afterCenter.center?.base, 10);

  const afterFinal = resolveDanceProgression({
    phase: "last",
    lastStep: "backline",
    center,
    centerUsedThird: false,
    scores: { red: 304, blue: 304 },
    goal: 304,
  }, [{ id: "blue", team: "blue", mode: "multiplier", base: 13, missed: false }], [
    { id: center.id, team: "red" }, { id: "blue", team: "blue" },
  ]);
  assert.equal(afterFinal.winner, "red");
});

test("last dance allows only an opponent's strict third-step score to take center", () => {
  const state = {
    phase: "last" as const,
    lastStep: "backline" as const,
    center: { id: "red", team: "red" as const, base: 13 },
    centerUsedThird: true,
    scores: { red: 304, blue: 304 },
    goal: 304,
  };
  const tie = resolveDanceProgression(state, [
    { id: "blue", team: "blue", mode: "multiplier", base: 13, missed: false },
  ], [{ id: "red", team: "red" }, { id: "blue", team: "blue" }]);
  assert.equal(tie.winner, "red");
  const challenge = resolveDanceProgression(state, [
    { id: "blue", team: "blue", mode: "multiplier", base: 14, missed: false },
  ], [{ id: "red", team: "red" }, { id: "blue", team: "blue" }]);
  assert.equal(challenge.winner, null);
  assert.deepEqual(challenge.center, { id: "blue", team: "blue", base: 14 });
  assert.equal(challenge.phase, "last");
  assert.equal(challenge.lastStep, "center");
});
