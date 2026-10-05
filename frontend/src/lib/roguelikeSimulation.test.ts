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
  const result = simulateRoguelikeRun({ seed: 8142, battleAi: "tactical", rewardPolicy: "stat-hp-attack" });
  assert.ok(result.rewardsTaken.some((reward) => reward.floor === 1 && reward.kind === "stat" && reward.rewardId === "hp"));
  assert.ok(result.finalStats.maxHp > ROGUELIKE_PLAYER_INITIAL_STATS.maxHp);
});
