import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerBattleState } from "@/types/game";
import {
  applySinglePlayLimitBreak,
  getSinglePlayLimitBreakDisplayDurationMs,
  getSinglePlayLimitBreakStatusLines,
} from "@/lib/singlePlayLimitBreak";

const makeEnemy = (): PlayerBattleState => ({
  id: "boss-5-2",
  nickname: "boss",
  imageDataUrl: "/boss.png",
  stats: {
    hp: 999,
    maxHp: 999,
    pp: 99,
    maxPp: 99,
    attack: 199,
    defense: 199,
    speed: 9,
    evasion: 0.09,
  },
  characterType: "balanced",
  currentHp: 0,
  currentPp: 12,
  chargeMultiplier: 2,
  lastActionCategory: "attack",
});

test("applySinglePlayLimitBreak fully restores HP/PP and raises stats to 999", () => {
  const limitBroken = applySinglePlayLimitBreak(makeEnemy());

  assert.equal(limitBroken.currentHp, 999);
  assert.equal(limitBroken.currentPp, 999);
  assert.equal(limitBroken.stats.hp, 999);
  assert.equal(limitBroken.stats.maxHp, 999);
  assert.equal(limitBroken.stats.pp, 999);
  assert.equal(limitBroken.stats.maxPp, 999);
  assert.equal(limitBroken.stats.attack, 999);
  assert.equal(limitBroken.stats.defense, 999);
  assert.equal(limitBroken.stats.speed, 999);
  assert.equal(limitBroken.limitBreakUsed, true);
  assert.equal(limitBroken.limitBreakActive, true);
  assert.equal(limitBroken.stats.evasion, 0.09);
  assert.equal(limitBroken.chargeMultiplier, 2);
});

test("getSinglePlayLimitBreakStatusLines formats each boosted status line", () => {
  const lines = getSinglePlayLimitBreakStatusLines(applySinglePlayLimitBreak(makeEnemy()));

  assert.deepEqual(lines, [
    "HP 999/999",
    "PP 999/999",
    "攻撃力 999",
    "防御力 999",
    "速度 999",
  ]);
});

test("getSinglePlayLimitBreakDisplayDurationMs waits 3 seconds after the final reveal", () => {
  assert.equal(getSinglePlayLimitBreakDisplayDurationMs(0), 3000);
  assert.equal(getSinglePlayLimitBreakDisplayDurationMs(1), 3000);
  assert.equal(getSinglePlayLimitBreakDisplayDurationMs(5), 11000);
});
