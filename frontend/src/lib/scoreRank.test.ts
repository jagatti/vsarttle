import assert from "node:assert/strict";
import test from "node:test";
import {
  getFloorScoreDetail,
  getTotalScoreRank,
  scoreRankToPoint,
  totalPointToScoreRank,
} from "@/lib/scoreRank";

test("floor 1 all S factors becomes SS", () => {
  const detail = getFloorScoreDetail(1, {
    continued: false,
    charactersUsed: 1,
    clearTurn: 10,
  });

  assert.equal(detail.continueRank, "S");
  assert.equal(detail.characterRank, "S");
  assert.equal(detail.turnRank, "S");
  assert.equal(detail.basePointTotal, 6);
  assert.equal(detail.score, "SS");
});

test("floor 5 special character threshold makes 3 chars rank A", () => {
  const detail = getFloorScoreDetail(5, {
    continued: true,
    charactersUsed: 3,
    clearTurn: 25,
  });

  assert.equal(detail.continueRank, "B");
  assert.equal(detail.characterRank, "A");
  assert.equal(detail.turnRank, "A");
  assert.equal(detail.basePointTotal, -1);
  assert.equal(detail.score, "B");
});

test("floor score C starts at -2 or below", () => {
  const detail = getFloorScoreDetail(1, {
    continued: true,
    charactersUsed: 3,
    clearTurn: 17,
  });

  assert.equal(detail.basePointTotal, -3);
  assert.equal(detail.score, "C");
});

test("total score sample SS,SS,S,A,A becomes S", () => {
  const result = getTotalScoreRank(["SS", "SS", "S", "A", "A"]);
  assert.equal(result.point, 5);
  assert.equal(result.rank, "S");
});

test("total score uses C as -2 points", () => {
  const point = ["C", "B", "A", "S", "SS"].reduce((sum, rank) => sum + scoreRankToPoint(rank), 0);
  assert.equal(point, 0);
  assert.equal(totalPointToScoreRank(point), "A");
});
