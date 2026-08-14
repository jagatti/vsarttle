import assert from "node:assert/strict";
import test from "node:test";
import { getBossData } from "@/data/bosses";
import { LIMIT_BREAK_MAX_STAT } from "@/lib/singlePlayLimitBreak";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";

for (const [floor, bossFloor, phase] of [
  [5, 1, 1],
  [10, 2, 1],
  [13, 3, 1],
  [16, 4, 1],
] as const) {
  test(`buildRoguelikeBossState maps floor ${floor} to normal boss ${bossFloor}-${phase}`, () => {
    const boss = buildRoguelikeBossState(floor);
    const data = getBossData(bossFloor, phase, "normal");
    assert.equal(boss.id, `rl-boss-${floor}`);
    assert.equal(boss.characterType, data.characterType);
    assert.deepEqual(boss.stats, data.stats);
    assert.equal(boss.currentHp, data.stats.maxHp);
    assert.equal(boss.currentPp, data.stats.maxPp);
  });
}

test("buildRoguelikeBossState builds custom floor 17 boss", () => {
  const boss = buildRoguelikeBossState(17);
  assert.equal(boss.id, "rl-boss-17");
  assert.equal(boss.imageDataUrl, "/arttle_boss/boss17.png");
  assert.deepEqual(boss.stats, { hp: 700, maxHp: 700, pp: 150, maxPp: 150, attack: 300, defense: 200, speed: 6, evasion: 0 });
});

test("buildRoguelikeBossState zeroes evasion on floors 18 and 19", () => {
  const floor18 = buildRoguelikeBossState(18);
  const floor19 = buildRoguelikeBossState(19);
  assert.equal(floor18.stats.evasion, 0);
  assert.equal(floor19.stats.evasion, 0);
  assert.equal(floor18.id, "rl-boss-18");
  assert.equal(floor19.id, "rl-boss-19");
});

test("buildRoguelikeBossState applies limit break on floor 20", () => {
  const boss = buildRoguelikeBossState(20);
  assert.equal(boss.id, "rl-boss-20");
  assert.equal(boss.nickname, "第20層のボス");
  assert.equal(boss.limitBreakActive, true);
  assert.equal(boss.limitBreakUsed, true);
  assert.equal(boss.currentHp, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.currentPp, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.maxHp, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.maxPp, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.attack, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.defense, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.speed, LIMIT_BREAK_MAX_STAT);
  assert.equal(boss.stats.evasion, 0);
});
