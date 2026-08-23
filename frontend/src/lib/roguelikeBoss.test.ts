import assert from "node:assert/strict";
import test from "node:test";
import { LIMIT_BREAK_MAX_STAT } from "@/lib/singlePlayLimitBreak";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";

test("buildRoguelikeBossState floor 5 uses hardcoded stats", () => {
  const boss = buildRoguelikeBossState(5);
  assert.equal(boss.id, "rl-boss-5");
  assert.equal(boss.characterType, "attack");
  assert.equal(boss.imageDataUrl, "/arttle_boss/boss1.png");
  assert.deepEqual(boss.stats, { hp: 260, maxHp: 260, pp: 50, maxPp: 50, attack: 145, defense: 90, speed: 5, evasion: 0.02 });
  assert.equal(boss.currentHp, 260);
  assert.equal(boss.currentPp, 50);
});

test("buildRoguelikeBossState floor 10 uses hardcoded stats", () => {
  const boss = buildRoguelikeBossState(10);
  assert.equal(boss.id, "rl-boss-10");
  assert.equal(boss.characterType, "magic");
  assert.deepEqual(boss.stats, { hp: 480, maxHp: 480, pp: 88, maxPp: 88, attack: 135, defense: 150, speed: 8, evasion: 0.04 });
});

test("buildRoguelikeBossState floor 13 uses hardcoded stats", () => {
  const boss = buildRoguelikeBossState(13);
  assert.equal(boss.id, "rl-boss-13");
  assert.equal(boss.characterType, "defense");
  assert.deepEqual(boss.stats, { hp: 410, maxHp: 410, pp: 77, maxPp: 77, attack: 135, defense: 246, speed: 1, evasion: 0.22 });
});

test("buildRoguelikeBossState floor 16 uses hardcoded stats", () => {
  const boss = buildRoguelikeBossState(16);
  assert.equal(boss.id, "rl-boss-16");
  assert.equal(boss.characterType, "magic");
  assert.deepEqual(boss.stats, { hp: 666, maxHp: 666, pp: 128, maxPp: 128, attack: 220, defense: 220, speed: 9, evasion: 0.06 });
});

test("buildRoguelikeBossState builds hardcoded floor 17 boss", () => {
  const boss = buildRoguelikeBossState(17);
  assert.equal(boss.id, "rl-boss-17");
  assert.equal(boss.imageDataUrl, "/arttle_boss/boss17.png");
  assert.deepEqual(boss.stats, { hp: 800, maxHp: 800, pp: 150, maxPp: 150, attack: 280, defense: 280, speed: 10, evasion: 0 });
});

test("buildRoguelikeBossState floor 18 uses hardcoded stats with zero evasion", () => {
  const boss = buildRoguelikeBossState(18);
  assert.equal(boss.id, "rl-boss-18");
  assert.equal(boss.stats.evasion, 0);
  assert.deepEqual(boss.stats, { hp: 900, maxHp: 900, pp: 130, maxPp: 130, attack: 260, defense: 260, speed: 10, evasion: 0 });
});

test("buildRoguelikeBossState floor 19 uses hardcoded stats with zero evasion", () => {
  const boss = buildRoguelikeBossState(19);
  assert.equal(boss.id, "rl-boss-19");
  assert.equal(boss.stats.evasion, 0);
  assert.deepEqual(boss.stats, { hp: 999, maxHp: 999, pp: 160, maxPp: 160, attack: 380, defense: 300, speed: 14, evasion: 0 });
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
