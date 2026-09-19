import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVANTAGE_THRESHOLD,
  compareRadarStats,
  getStrongestAdvantageKey,
  mapAbsoluteToRadius,
  RADAR_ABSOLUTE_RANGE,
  RADAR_STAT_ORDER,
  RADIUS_MAX,
  RADIUS_MIN,
  type RadarStatKey,
} from "@/components/Vs/statRadar";
import { BASE_STATS } from "@/lib/statCalculator";
import type { CharacterStats } from "@/types/game";

function makeStats(overrides: Partial<CharacterStats> = {}): CharacterStats {
  return {
    hp: BASE_STATS.balanced.hp,
    maxHp: BASE_STATS.balanced.hp,
    pp: BASE_STATS.balanced.pp,
    maxPp: BASE_STATS.balanced.pp,
    attack: BASE_STATS.balanced.attack,
    defense: BASE_STATS.balanced.defense,
    speed: BASE_STATS.balanced.speed,
    evasion: BASE_STATS.balanced.evasion,
    ...overrides,
  };
}

function minBase(key: RadarStatKey): number {
  return Math.min(...Object.values(BASE_STATS).map((stats) => stats[key]));
}

function maxBase(key: RadarStatKey): number {
  return Math.max(...Object.values(BASE_STATS).map((stats) => stats[key]));
}

test("RADAR_ABSOLUTE_RANGE covers min/max across all BASE_STATS types with ±12% margin", () => {
  for (const key of RADAR_STAT_ORDER) {
    assert.ok(RADAR_ABSOLUTE_RANGE[key].min <= minBase(key) * 0.88);
    assert.ok(RADAR_ABSOLUTE_RANGE[key].max >= maxBase(key) * 1.12);
  }
});

test("mapAbsoluteToRadius maps absolute min/max and clamps out-of-range values", () => {
  assert.equal(mapAbsoluteToRadius("attack", RADAR_ABSOLUTE_RANGE.attack.min), RADIUS_MIN);
  assert.equal(mapAbsoluteToRadius("attack", RADAR_ABSOLUTE_RANGE.attack.max), RADIUS_MAX);
  assert.equal(mapAbsoluteToRadius("attack", RADAR_ABSOLUTE_RANGE.attack.min - 100), RADIUS_MIN);
  assert.equal(mapAbsoluteToRadius("attack", RADAR_ABSOLUTE_RANGE.attack.max + 100), RADIUS_MAX);
});

test("compareRadarStats returns even for identical stats", () => {
  const stats = makeStats();
  const compared = compareRadarStats(stats, stats);
  assert.deepEqual(compared, {
    hp: "even",
    pp: "even",
    attack: "even",
    defense: "even",
    speed: "even",
    evasion: "even",
  });
});

test("compareRadarStats marks attack up/down for attack 199 vs 85", () => {
  const mine = makeStats({ attack: 199 });
  const theirs = makeStats({ attack: 85 });
  assert.equal(compareRadarStats(mine, theirs).attack, "up");
  assert.equal(compareRadarStats(theirs, mine).attack, "down");
});

test("compareRadarStats is symmetric between players", () => {
  const left = makeStats({ hp: 310, pp: 50, attack: 199, defense: 100, speed: 6, evasion: 0.01 });
  const right = makeStats({ hp: 290, pp: 90, attack: 100, defense: 150, speed: 5, evasion: 0.01 });
  const leftToRight = compareRadarStats(left, right);
  const rightToLeft = compareRadarStats(right, left);

  for (const key of RADAR_STAT_ORDER) {
    if (leftToRight[key] === "even") {
      assert.equal(rightToLeft[key], "even");
      continue;
    }
    assert.equal(rightToLeft[key], leftToRight[key] === "up" ? "down" : "up");
  }
});

test("getStrongestAdvantageKey returns max-radius-diff key and null when all even", () => {
  const attackType = makeStats({ hp: 290, pp: 50, attack: 199, defense: 100, speed: 6, evasion: 0.01 });
  const defenseType = makeStats({ hp: 310, pp: 50, attack: 85, defense: 150, speed: 5, evasion: 0.01 });
  assert.equal(getStrongestAdvantageKey(attackType, defenseType), "attack");
  assert.equal(getStrongestAdvantageKey(defenseType, attackType), "defense");
  assert.equal(getStrongestAdvantageKey(attackType, attackType), null);
});

test("getStrongestAdvantageKey respects ADVANTAGE_THRESHOLD", () => {
  const mine = makeStats({ hp: 300 });
  const theirs = makeStats({ hp: 300 + ((ADVANTAGE_THRESHOLD - 0.001) * (RADAR_ABSOLUTE_RANGE.hp.max - RADAR_ABSOLUTE_RANGE.hp.min)) / (RADIUS_MAX - RADIUS_MIN) });
  assert.equal(getStrongestAdvantageKey(mine, theirs), null);
});
