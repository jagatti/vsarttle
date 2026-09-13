import assert from "node:assert/strict";
import test from "node:test";
import {
  CHARACTER_TYPES,
  createAxisProfile,
  createBaseProfile,
  simulateBalanceMatrix,
} from "@/lib/battleBalanceSim";
import type { CharacterType } from "@/types/game";

const MATCHES_PER_ORDER = 1000;

function findPair(left: string, right: string, pairs: ReturnType<typeof simulateBalanceMatrix>["pairResults"]) {
  const pair = pairs.find((result) => result.left === left && result.right === right);
  assert.ok(pair, `missing pair ${left} vs ${right}`);
  return pair;
}

test("battle balance stays within the Step 2 win-rate bands", () => {
  const baseProfiles = CHARACTER_TYPES.map((type) => createBaseProfile(type));
  const result = simulateBalanceMatrix(baseProfiles, { matchesPerOrder: MATCHES_PER_ORDER });

  for (const pair of result.pairResults) {
    if (pair.left === pair.right) {
      assert.equal(pair.totalGames, MATCHES_PER_ORDER, `${pair.left} mirror matches should avoid duplicate swapped runs`);
      continue;
    }

    assert.equal(pair.totalGames, MATCHES_PER_ORDER * 2, `${pair.left} vs ${pair.right} should run both side orders`);
    assert.ok(pair.leftWinRate >= 0.35 && pair.leftWinRate <= 0.65, `${pair.left} vs ${pair.right} left win rate ${pair.leftWinRate.toFixed(3)} out of range`);
    assert.ok(pair.rightWinRate >= 0.35 && pair.rightWinRate <= 0.65, `${pair.left} vs ${pair.right} right win rate ${pair.rightWinRate.toFixed(3)} out of range`);
  }

  for (const type of CHARACTER_TYPES) {
    const overall = result.overallResults.find((entry) => entry.name === type);
    assert.ok(overall, `missing overall result for ${type}`);
    assert.ok(overall.winRate >= 0.4 && overall.winRate <= 0.6, `${type} overall win rate ${overall.winRate.toFixed(3)} out of range`);
  }
});

test("axis-extreme profiles stay near 50-50 against their own base profile", () => {
  for (const type of CHARACTER_TYPES as readonly CharacterType[]) {
    const base = createBaseProfile(type);
    const high = createAxisProfile(type, { sA: 1, sB: 1, sC: 1 }, `${type}+`);
    const low = createAxisProfile(type, { sA: -1, sB: -1, sC: -1 }, `${type}-`);
    const result = simulateBalanceMatrix([base, high, low], { matchesPerOrder: MATCHES_PER_ORDER });

    for (const pair of [findPair(base.name, high.name, result.pairResults), findPair(base.name, low.name, result.pairResults)]) {
      assert.ok(pair.leftWinRate >= 0.4 && pair.leftWinRate <= 0.6, `${pair.left} vs ${pair.right} left win rate ${pair.leftWinRate.toFixed(3)} out of range`);
      assert.ok(pair.rightWinRate >= 0.4 && pair.rightWinRate <= 0.6, `${pair.left} vs ${pair.right} right win rate ${pair.rightWinRate.toFixed(3)} out of range`);
    }
  }
});
