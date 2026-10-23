import assert from "node:assert/strict";
import test from "node:test";
import {
  DANCE_JUDGMENT_POINTS,
  canActivateDanceFever,
  createDanceSequence,
  createDanceRound,
  DANCE_MODES,
  DANCE_ROUND_DURATION,
  DANCE_ROUND_GRACE,
  expireDanceRound,
  getDanceActionScore,
  getDanceCpuJudgment,
  getDanceDancers,
  getDanceGoal,
  getDanceFeverLimit,
  getDanceRecovery,
  getDanceRoundProgress,
  getDanceSequenceLength,
  getDanceStamina,
  getDanceTargetTime,
  judgeDanceTiming,
  inputDanceRound,
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

test("all three dance rows start with distinct keys and preserve their lengths", () => {
  for (const stars of [3, 4, 5] as const) {
    const round = createDanceRound(stars, 1000, () => 0);
    assert.equal(new Set(DANCE_MODES.map((mode) => round.sequences[mode][0])).size, 3);
    for (const mode of DANCE_MODES) {
      assert.equal(round.sequences[mode].length, getDanceSequenceLength(mode, stars));
    }
    assert.equal(round.sequences.recovery.at(-1), "X");
  }
});

test("the dance bar moves before selection and selecting a row never restarts its clock", () => {
  const round = createDanceRound(3, 1000, () => 0);
  const now = 1000 + DANCE_ROUND_DURATION / 2;
  assert.equal(round.mode, null);
  assert.equal(getDanceRoundProgress(round, now), 0.5);
  for (const mode of DANCE_MODES) {
    const selected = inputDanceRound(round, round.sequences[mode][0], now);
    assert.equal(selected.mode, mode);
    assert.equal(selected.index, 1);
    assert.equal(selected.startedAt, round.startedAt);
    assert.equal(selected.judgment, null, "prefix keys are not individually timed");
    assert.equal(getDanceRoundProgress(selected, now), 0.5);
  }
  assert.equal(getDanceRoundProgress(round, 0), 0);
  assert.equal(getDanceRoundProgress(round, now + DANCE_ROUND_DURATION), 1);
});

test("only the final dance key is judged against the shared bar deadline", () => {
  const initial = createDanceRound(5, 1000, () => 0);
  for (const mode of DANCE_MODES) {
    for (const [offset, judgment] of [[0, "PERFECT"], [-70, "GREAT"], [115, "GOOD"], [200, "BAD"]] as const) {
      let round = initial;
      const sequence = initial.sequences[mode];
      sequence.slice(0, -1).forEach((key, index) => {
        round = inputDanceRound(round, key, 1200 + index * 50);
        assert.equal(round.judgment, null);
      });
      round = inputDanceRound(round, sequence.at(-1)!, 1000 + DANCE_ROUND_DURATION + offset);
      assert.equal(round.judgment, judgment);
      assert.equal(round.index, sequence.length);
      assert.equal(inputDanceRound(round, "X", 5000), round, "completed rounds ignore input");
    }
  }
});

test("unselected and partially entered rows time out as MISS after E[0] + 300ms", () => {
  const round = createDanceRound(3, 1000, () => 0);
  const deadline = 1000 + DANCE_ROUND_DURATION + DANCE_ROUND_GRACE;
  assert.equal(expireDanceRound(round, deadline), round);
  const expired = expireDanceRound(round, deadline + 1);
  assert.equal(expired.mode, "normal", "unselected timeout falls back to row 2");
  assert.equal(expired.judgment, "MISS");
  const selected = inputDanceRound(round, round.sequences.recovery[0], 1200);
  assert.equal(expireDanceRound(selected, deadline + 1).mode, "recovery");
  assert.equal(expireDanceRound(selected, deadline + 1).judgment, "MISS");
  assert.equal(inputDanceRound(selected, "X", deadline + 1).judgment, "MISS", "late input cannot bypass timeout");
});

test("the first matching key locks the row and subsequent wrong input is BAD", () => {
  const round = createDanceRound(3, 1000, () => 0);
  assert.equal(inputDanceRound(round, "X", 1100), round);
  const selected = inputDanceRound(round, round.sequences.recovery[0], 1200);
  const wrong = inputDanceRound(selected, round.sequences.normal[0], 1300);
  assert.equal(wrong.mode, "recovery");
  assert.equal(wrong.judgment, "BAD");
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
