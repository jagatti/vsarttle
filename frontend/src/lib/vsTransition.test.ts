import assert from "node:assert/strict";
import test from "node:test";

import {
  getMultiplayerStageBgm,
  getSinglePlayStageBgm,
  VS_SCREEN_DURATION_MS,
} from "@/lib/vsTransition";

test("vs screen duration stays at 2500ms", () => {
  assert.equal(VS_SCREEN_DURATION_MS, 2500);
});

test("multiplayer vs stage keeps bgm silent until battle", () => {
  assert.equal(getMultiplayerStageBgm("vs"), null);
  assert.equal(getMultiplayerStageBgm("battle"), "/sounds/bgm/battle_loop.mp3");
});

test("single play vs stage keeps bgm silent until battle", () => {
  assert.equal(getSinglePlayStageBgm("vs", 1, 1, false, false), null);
});

test("single play battle bgm still follows floor and boss phase", () => {
  assert.equal(getSinglePlayStageBgm("battle", 1, 1, false, false), "/sounds/bgm/battle_loop.mp3");
  assert.equal(getSinglePlayStageBgm("battle", 3, 1, false, false), "/sounds/bgm/boss3_loop.mp3");
  assert.equal(getSinglePlayStageBgm("battle", 4, 1, false, false), "/sounds/bgm/boss4_loop.mp3");
  assert.equal(getSinglePlayStageBgm("battle", 5, 1, false, false), "/sounds/bgm/boss5-1_loop.mp3");
  assert.equal(getSinglePlayStageBgm("battle", 5, 2, false, false), "/sounds/bgm/boss5-2_loop.mp3");
});

test("single play limit break bgm still overrides other stage bgm", () => {
  assert.equal(getSinglePlayStageBgm("vs", 5, 2, true, false), null);
  assert.equal(getSinglePlayStageBgm("battle", 5, 2, false, true), "/sounds/bgm/boss5-3_loop.mp3");
});
