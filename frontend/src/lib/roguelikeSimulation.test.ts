import assert from "node:assert/strict";
import test from "node:test";
import { ROGUELIKE_PLAYER_INITIAL_STATS } from "@/lib/roguelikeEnemyStats";
import { simulateRoguelikeRun } from "@/lib/roguelikeSimulation";

test("roguelike simulations are reproducible for a fixed seed and policies", () => {
  const options = { seed: 8142, battleAi: "tactical" as const, rewardPolicy: "heal-aware" as const };
  assert.deepEqual(simulateRoguelikeRun(options), simulateRoguelikeRun(options));
});

test("the run advances floors and carries current HP and PP without rewards", () => {
  const result = simulateRoguelikeRun({ seed: 8142, battleAi: "tactical", rewardPolicy: "baseline" });
  assert.ok(result.floorReached > 1);
  const firstFloorEnd = result.floorEndStates.find((state) => state.floor === 1);
  const secondFloorStart = result.floorStartStates.find((state) => state.floor === 2);
  assert.ok(firstFloorEnd);
  assert.ok(secondFloorStart);
  assert.equal(secondFloorStart.currentHp, firstFloorEnd.currentHp);
  assert.equal(secondFloorStart.currentPp, firstFloorEnd.currentPp);
});

test("reward policies select and apply the available stat reward", () => {
  const result = simulateRoguelikeRun({ seed: 1, battleAi: "tactical", rewardPolicy: "stat-hp-attack" });
  const firstReward = result.rewardsTaken.find((reward) => reward.floor === 1);
  assert.equal(firstReward?.kind, "stat");
  assert.ok(result.finalStats[firstReward!.rewardId as keyof typeof result.finalStats] > ROGUELIKE_PLAYER_INITIAL_STATS[firstReward!.rewardId as keyof typeof ROGUELIKE_PLAYER_INITIAL_STATS]);
});

test("heal-aware policy takes HP growth while above the critical recovery threshold", () => {
  const result = simulateRoguelikeRun({ seed: 14, battleAi: "tactical", rewardPolicy: "heal-aware" });
  const floorEnd = result.floorEndStates.find((state) => state.floor === 1)!;
  const firstReward = result.rewardsTaken.find((reward) => reward.floor === 1);
  assert.ok(floorEnd.currentHp / floorEnd.maxHp >= 0.4);
  assert.deepEqual(firstReward, { floor: 1, kind: "stat", rewardId: "hp" });
});
