import assert from "node:assert/strict";
import test from "node:test";
import {
  DANCE_JUDGMENT_POINTS,
  canActivateDanceFever,
  createDanceSequence,
  getDanceActionScore,
  getDanceCpuJudgment,
  getDanceDancers,
  getDanceGoal,
  getDanceFeverLimit,
  getDanceRecovery,
  getDanceSequenceLength,
  getDanceStamina,
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

test("dance CPU boss judgments are stronger and score scaling is applied once", () => {
  assert.equal(getDanceCpuJudgment(() => 0.25), "GREAT");
  assert.equal(getDanceCpuJudgment(() => 0.25, true), "PERFECT");
  assert.equal(getDanceActionScore(["PERFECT", "GOOD"], "normal"), 21);
  assert.equal(getDanceActionScore(["PERFECT", "GOOD"], "multiplier"), 25.2);
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
  assert.equal(canActivateDanceFever(0, 1), true);
  assert.equal(getDanceFeverLimit(3), 4);
  assert.equal(getDanceFeverLimit(5), 8);
});
