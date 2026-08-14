import assert from "node:assert/strict";
import test from "node:test";

import {
  getMultiplayerStageBgm,
  getRoguelikeStageBgm,
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


test("roguelike stage bgm follows stage and floor", () => {
  assert.equal(getRoguelikeStageBgm("drawing", 1), "/sounds/bgm/oekaki_loop.mp3");
  assert.equal(getRoguelikeStageBgm("upgrade", 1), null);
  assert.equal(getRoguelikeStageBgm("result", 20), null);
  assert.equal(getRoguelikeStageBgm("battle", 1), "/sounds/bgm/battle_loop.mp3");
  assert.equal(getRoguelikeStageBgm("battle", 5), "/sounds/bgm/boss1_loop.mp3");
  assert.equal(getRoguelikeStageBgm("battle", 10), "/sounds/bgm/boss2_loop.mp3");
  assert.equal(getRoguelikeStageBgm("battle", 13), "/sounds/bgm/boss3_loop.mp3");
  assert.equal(getRoguelikeStageBgm("battle", 16), "/sounds/bgm/boss4_loop.mp3");
  assert.equal(getRoguelikeStageBgm("battle", 17), "/sounds/bgm/boss17_loop.mp3");
  assert.equal(getRoguelikeStageBgm("battle", 18), "/sounds/bgm/boss5-1_loop.mp3");
  assert.equal(getRoguelikeStageBgm("battle", 19), "/sounds/bgm/boss5-2_loop.mp3");
  assert.equal(getRoguelikeStageBgm("battle", 20), "/sounds/bgm/boss5-3_loop.mp3");
});
