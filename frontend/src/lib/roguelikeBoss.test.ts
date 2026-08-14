import assert from "node:assert/strict";
import test from "node:test";
import { LIMIT_BREAK_MAX_STAT } from "@/lib/singlePlayLimitBreak";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";

test("buildRoguelikeBossState floor 5 uses hardcoded stats", () => {
  const boss = buildRoguelikeBossState(5);
  assert.equal(boss.id, "rl-boss-5");
  assert.equal(boss.characterType, "attack");
  assert.equal(boss.imageDataUrl, "/arttle_boss/boss1.png");
  assert.deepEqual(boss.stats, { hp: 355, maxHp: 355, pp: 55, maxPp: 55, attack: 199, defense: 100, speed: 7, evasion: 0.03 });
  assert.equal(boss.currentHp, 355);
  assert.equal(boss.currentPp, 55);
});

test("buildRoguelikeBossState floor 10 uses hardcoded stats", () => {
  const boss = buildRoguelikeBossState(10);
  assert.equal(boss.id, "rl-boss-10");
  assert.equal(boss.characterType, "magic");
  assert.deepEqual(boss.stats, { hp: 499, maxHp: 499, pp: 80, maxPp: 80, attack: 125, defense: 115, speed: 9, evasion: 0.05 });
});

test("buildRoguelikeBossState floor 13 uses hardcoded stats", () => {
  const boss = buildRoguelikeBossState(13);
  assert.equal(boss.id, "rl-boss-13");
  assert.equal(boss.characterType, "defense");
  assert.deepEqual(boss.stats, { hp: 394, maxHp: 394, pp: 77, maxPp: 77, attack: 128, defense: 200, speed: 1, evasion: 0.25 });
});

test("buildRoguelikeBossState floor 16 uses hardcoded stats", () => {
  const boss = buildRoguelikeBossState(16);
  assert.equal(boss.id, "rl-boss-16");
  assert.equal(boss.characterType, "magic");
  assert.deepEqual(boss.stats, { hp: 666, maxHp: 666, pp: 99, maxPp: 99, attack: 160, defense: 150, speed: 9, evasion: 0.06 });
});

test("buildRoguelikeBossState builds hardcoded floor 17 boss", () => {
  const boss = buildRoguelikeBossState(17);
  assert.equal(boss.id, "rl-boss-17");
  assert.equal(boss.imageDataUrl, "/arttle_boss/boss17.png");
  assert.deepEqual(boss.stats, { hp: 800, maxHp: 800, pp: 150, maxPp: 150, attack: 250, defense: 300, speed: 9, evasion: 0 });
});

test("buildRoguelikeBossState floor 18 uses hardcoded stats with zero evasion", () => {
  const boss = buildRoguelikeBossState(18);
  assert.equal(boss.id, "rl-boss-18");
  assert.equal(boss.stats.evasion, 0);
  assert.deepEqual(boss.stats, { hp: 777, maxHp: 777, pp: 77, maxPp: 77, attack: 177, defense: 177, speed: 7, evasion: 0 });
});

test("buildRoguelikeBossState floor 19 uses hardcoded stats with zero evasion", () => {
  const boss = buildRoguelikeBossState(19);
  assert.equal(boss.id, "rl-boss-19");
  assert.equal(boss.stats.evasion, 0);
  assert.deepEqual(boss.stats, { hp: 999, maxHp: 999, pp: 122, maxPp: 122, attack: 222, defense: 222, speed: 22, evasion: 0 });
});

test("buildRoguelikeBossState floor 20 has ALL999 stats and no forceMagicStrongAction", () => {
  const boss = buildRoguelikeBossState(20);
  assert.equal(boss.id, "rl-boss-20");
  assert.equal(boss.nickname, "第20層のボス");
  assert.equal(boss.limitBreakActive, true);
  assert.equal(boss.limitBreakUsed, true);
  assert.equal(boss.forceMagicStrongAction, false);
  assert.equal(boss.currentHp, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.currentPp, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.maxHp, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.maxPp, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.attack, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.defense, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.speed, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.evasion, 0);
});
