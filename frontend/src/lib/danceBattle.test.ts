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
  judgeDanceTiming,
} from "@/lib/danceBattle";

test("dance timing uses the specified judgement boundaries", () => {
  assert.equal(judgeDanceTiming(22), "PERFECT");
  assert.equal(judgeDanceTiming(-70), "GREAT");
  assert.equal(judgeDanceTiming(115), "GOOD");
  assert.equal(judgeDanceTiming(116), "BAD");
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
  assert.equal(getDanceFeverLimit(3), 4);
  assert.equal(getDanceFeverLimit(5), 8);
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
});

test("central miss selects the next roster member and backline challenges need a strict third-step win", () => {
  assert.deepEqual(getDanceNextCenter([
    { id: "red-first", team: "red" },
    { id: "blue-first", team: "blue" },
    { id: "red-second", team: "red" },
  ], "red-first"), { id: "blue-first", team: "blue" });
  assert.equal(getDanceNextCenter([{ id: "only", team: "red" }], "only"), null);
});
