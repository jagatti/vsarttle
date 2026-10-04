import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableActions } from "@/lib/battleLogic";
import type { PlayerBattleState } from "@/types/game";
import {
  applySinglePlayLimitBreak,
  applySinglePlayLimitBreakSurvive,
  getSinglePlayLimitBreakDisplayDurationMs,
  getSinglePlayLimitBreakStatusLines,
  LIMIT_BREAK_SURVIVE_HP,
  resetSinglePlayLimitBreakPlayerActions,
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
  assert.equal(limitBroken.stats.evasion, 0);
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

test("applySinglePlayLimitBreakSurvive leaves the boss at 1 HP with the charge glow active, without touching stats", () => {
  const survived = applySinglePlayLimitBreakSurvive(makeEnemy());

  assert.equal(survived.currentHp, LIMIT_BREAK_SURVIVE_HP);
  assert.equal(survived.currentHp, 1);
  assert.ok(survived.chargeMultiplier > 1);
  assert.equal(survived.stats.maxHp, 999);
  assert.equal(survived.limitBreakUsed, undefined);
  assert.equal(survived.limitBreakActive, undefined);
});

test("resetSinglePlayLimitBreakPlayerActions unlocks actions and clears temporary restrictions", () => {
  const player = makeEnemy();
  player.lastActionCategory = "magic";
  player.chargedPreviousTurn = true;
  player.paralyzedNextTurn = true;
  player.tieBanActive = true;
  player.attackBanTurns = 2;
  player.barrierBanTurns = 2;
  player.chargeBanTurns = 2;
  player.magicBanTurns = 2;

  const reset = resetSinglePlayLimitBreakPlayerActions(player);
  assert.equal(reset.lastActionCategory, null);
  assert.equal(reset.currentPp, reset.stats.maxPp);
  assert.equal(reset.chargeMultiplier, 1);
  assert.equal(reset.chargedPreviousTurn, false);
  assert.equal(reset.paralyzedNextTurn, false);
  assert.equal(reset.tieBanActive, false);
  assert.equal(reset.attackBanTurns, 0);
  assert.equal(reset.barrierBanTurns, 0);
  assert.equal(reset.chargeBanTurns, 0);
  assert.equal(reset.magicBanTurns, 0);
  assert.deepEqual(
    getAvailableActions(reset, 2).sort(),
    ["attack", "magicWeak", "magicStrong", "barrier", "charge"].sort(),
  );
});

test("getSinglePlayLimitBreakDisplayDurationMs waits 3 seconds after the final reveal", () => {
  assert.equal(getSinglePlayLimitBreakDisplayDurationMs(0), 3000);
  assert.equal(getSinglePlayLimitBreakDisplayDurationMs(1), 3000);
  assert.equal(getSinglePlayLimitBreakDisplayDurationMs(5), 11000);
});
