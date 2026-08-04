import test from "node:test";
import assert from "node:assert/strict";
import { getBossBattleBackgroundUrl } from "./SinglePlayManager";

test("floor 1-4 returns boss{floor}.png", () => {
  for (let floor = 1; floor <= 4; floor++) {
    assert.equal(getBossBattleBackgroundUrl(floor, 1, false), `/arttle_back/boss${floor}.png`);
    assert.equal(getBossBattleBackgroundUrl(floor, 2, false), `/arttle_back/boss${floor}.png`);
    assert.equal(getBossBattleBackgroundUrl(floor, 1, true), `/arttle_back/boss${floor}.png`);
  }
});

test("floor 5 phase 1 without limitBreak returns boss5-1.png", () => {
  assert.equal(getBossBattleBackgroundUrl(5, 1, false), "/arttle_back/boss5-1.png");
});

test("floor 5 phase 2 returns boss5-2.png", () => {
  assert.equal(getBossBattleBackgroundUrl(5, 2, false), "/arttle_back/boss5-2.png");
});

test("floor 5 phase 1 with limitBreak returns boss5-2.png", () => {
  assert.equal(getBossBattleBackgroundUrl(5, 1, true), "/arttle_back/boss5-2.png");
});

test("floor 5 phase 2 with limitBreak returns boss5-2.png", () => {
  assert.equal(getBossBattleBackgroundUrl(5, 2, true), "/arttle_back/boss5-2.png");
});
