import assert from "node:assert/strict";
import test from "node:test";
import { pickGhostCpuAction } from "@/lib/ghostCpuAction";
import type { PlayerBattleState } from "@/types/game";

function makeEnemy(overrides: Partial<PlayerBattleState> = {}): PlayerBattleState {
  return {
    id: "cpu",
    nickname: "CPU",
    imageDataUrl: "/arttle_boss/boss1.png",
    characterType: "balanced",
    stats: { hp: 100, maxHp: 100, pp: 100, maxPp: 100, attack: 20, defense: 20, speed: 5, evasion: 0.1 },
    currentHp: 100,
    currentPp: 100,
    chargeMultiplier: 1,
    lastActionCategory: null,
    ...overrides,
  };
}

test("pickGhostCpuAction returns magicStrong during limit break", () => {
  assert.equal(pickGhostCpuAction(makeEnemy({ forceMagicStrongAction: true }), 5), "magicStrong");
});

test("pickGhostCpuAction filters charge above configured hp ratio", () => {
  const enemy = makeEnemy({ currentHp: 100, lastActionCategory: "magic" });
  const picked = pickGhostCpuAction(enemy, 2, { chargeAllowedHpRatio: 0.3, random: () => 0.99 });
  assert.notEqual(picked, "charge");
});

test("pickGhostCpuAction falls back to paralysis when no action is available", () => {
  const enemy = makeEnemy({
    currentPp: 0,
    paralyzedNextTurn: true,
  });
  assert.equal(pickGhostCpuAction(enemy, 3), "paralysis");
});

test("pickGhostCpuAction uses configured action weights", () => {
  const enemy = makeEnemy({ lastActionCategory: "magic" });
  assert.equal(
    pickGhostCpuAction(enemy, 2, {
      weights: { attack: 0, barrier: 1, charge: 0 },
      random: () => 0.99,
    }),
    "barrier",
  );
});
