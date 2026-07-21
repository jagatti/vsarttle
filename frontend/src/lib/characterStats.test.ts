import assert from "node:assert/strict";
import test from "node:test";
import { getEffectiveStats } from "@/lib/characterStats";
import type { PlayerBattleState } from "@/types/game";

const makePlayer = (overrides: Partial<PlayerBattleState> = {}): PlayerBattleState => ({
  id: "player-1",
  nickname: "テスト",
  imageDataUrl: "",
  stats: {
    hp: 300,
    maxHp: 300,
    pp: 50,
    maxPp: 50,
    attack: 199,
    defense: 100,
    speed: 6,
    evasion: 0.01,
  },
  characterType: "balanced",
  currentHp: 300,
  currentPp: 50,
  chargeMultiplier: 1,
  lastActionCategory: null,
  ...overrides,
});

test("getEffectiveStats returns player.stats as-is", () => {
  const player = makePlayer();
  const stats = getEffectiveStats(player);
  assert.deepStrictEqual(stats, player.stats);
});

test("getEffectiveStats reflects stats modified by enhancementSlot (speed)", () => {
  const player = makePlayer({
    stats: {
      hp: 300,
      maxHp: 300,
      pp: 50,
      maxPp: 50,
      attack: 199,
      defense: 100,
      speed: 8,
      evasion: 0.01,
    },
  });
  const stats = getEffectiveStats(player);
  assert.equal(stats.speed, 8);
});

test("getEffectiveStats reflects stats modified by enhancementSlot (evasion)", () => {
  const player = makePlayer({
    stats: {
      hp: 300,
      maxHp: 300,
      pp: 50,
      maxPp: 50,
      attack: 199,
      defense: 100,
      speed: 6,
      evasion: 0.05,
    },
  });
  const stats = getEffectiveStats(player);
  assert.equal(stats.evasion, 0.05);
});

test("getEffectiveStats is the same object reference as player.stats", () => {
  const player = makePlayer();
  const stats = getEffectiveStats(player);
  assert.strictEqual(stats, player.stats);
});
