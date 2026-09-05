import assert from "node:assert/strict";
import test from "node:test";
import {
  ROGUELIKE_DEBUG_DEFAULT_CONFIG,
  ROGUELIKE_DEBUG_PLACEHOLDER_CHARACTER_TYPE,
  ROGUELIKE_DEBUG_PLACEHOLDER_DRAWING_DATA_URL,
  buildRoguelikeDebugRunInit,
  clampRoguelikeDebugFloor,
  isRoguelikeDebugQueryEnabled,
} from "@/lib/roguelikeDebug";

test("clampRoguelikeDebugFloor keeps values within the 1-20 floor range", () => {
  assert.equal(clampRoguelikeDebugFloor(0), 1);
  assert.equal(clampRoguelikeDebugFloor(-5), 1);
  assert.equal(clampRoguelikeDebugFloor(21), 20);
  assert.equal(clampRoguelikeDebugFloor(999), 20);
  assert.equal(clampRoguelikeDebugFloor(7.6), 8);
  assert.equal(clampRoguelikeDebugFloor(Number.NaN), 1);
});

test("buildRoguelikeDebugRunInit uses the default config to reproduce the roguelike initial stats", () => {
  const init = buildRoguelikeDebugRunInit(ROGUELIKE_DEBUG_DEFAULT_CONFIG);
  assert.equal(init.floor, 1);
  assert.deepEqual(init.playerStats, {
    hp: 250,
    maxHp: 250,
    pp: 50,
    maxPp: 50,
    attack: 100,
    defense: 100,
    speed: 1,
    evasion: 0.01,
  });
  assert.deepEqual(init.acquiredWeakMagicKinds, []);
  assert.equal(init.playerDrawingDataUrl, ROGUELIKE_DEBUG_PLACEHOLDER_DRAWING_DATA_URL);
  assert.equal(init.playerCharacterType, ROGUELIKE_DEBUG_PLACEHOLDER_CHARACTER_TYPE);
  assert.equal(init.isDebugRun, true);
});

test("buildRoguelikeDebugRunInit applies custom stats, floor, and acquired weak-magic kinds", () => {
  const init = buildRoguelikeDebugRunInit({
    floor: 14,
    hp: 500,
    pp: 90,
    attack: 200,
    defense: 150,
    speed: 5,
    evasionPercent: 20,
    acquiredWeakMagicKinds: ["paralysis", "tieBan", "paralysis"],
  });
  assert.equal(init.floor, 14);
  assert.deepEqual(init.playerStats, {
    hp: 500,
    maxHp: 500,
    pp: 90,
    maxPp: 90,
    attack: 200,
    defense: 150,
    speed: 5,
    evasion: 0.2,
  });
  assert.deepEqual(init.acquiredWeakMagicKinds, ["paralysis", "tieBan"]);
});

test("buildRoguelikeDebugRunInit clamps floor and evasion into valid ranges", () => {
  const init = buildRoguelikeDebugRunInit({
    floor: 50,
    hp: 250,
    pp: 50,
    attack: 100,
    defense: 100,
    speed: 1,
    evasionPercent: 500,
    acquiredWeakMagicKinds: [],
  });
  assert.equal(init.floor, 20);
  assert.equal(init.playerStats.evasion, 0.95);
});

test("isRoguelikeDebugQueryEnabled only returns true for the exact rlDebug=1 flag", () => {
  assert.equal(isRoguelikeDebugQueryEnabled(""), false);
  assert.equal(isRoguelikeDebugQueryEnabled("?foo=bar"), false);
  assert.equal(isRoguelikeDebugQueryEnabled("?rlDebug=0"), false);
  assert.equal(isRoguelikeDebugQueryEnabled("?rlDebug=1"), true);
  assert.equal(isRoguelikeDebugQueryEnabled("rlDebug=1"), true);
  assert.equal(isRoguelikeDebugQueryEnabled("?foo=bar&rlDebug=1"), true);
});
