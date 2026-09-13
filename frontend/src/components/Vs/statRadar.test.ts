import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_RADIUS,
  buildRadarVertices,
  getMostDivergentRadarStatKey,
  getRadarComparableRatio,
  mapRadarRatioToRadius,
} from "@/components/Vs/statRadar";
import type { CharacterStats } from "@/types/game";

const base = {
  hp: 300,
  pp: 60,
  attack: 120,
  defense: 110,
  speed: 6,
  evasion: 0.01,
};

function makeStats(overrides: Partial<CharacterStats> = {}): CharacterStats {
  return {
    hp: base.hp,
    maxHp: base.hp,
    pp: base.pp,
    maxPp: base.pp,
    attack: base.attack,
    defense: base.defense,
    speed: base.speed,
    evasion: base.evasion,
    ...overrides,
  };
}

test("buildRadarVertices uses the base radius when stats equal the base profile", () => {
  const vertices = buildRadarVertices(makeStats(), base, 100);

  assert.ok(vertices.every((vertex) => Math.abs(vertex.radius - BASE_RADIUS) < 1e-9));
  assert.equal(vertices[0]?.x, 100);
  assert.ok(Math.abs((vertices[0]?.y ?? 0) - 32.5) < 1e-9);
});

test("mapRadarRatioToRadius clamps plus and minus 12 percent to the chart extremes", () => {
  assert.equal(mapRadarRatioToRadius(1.12), 1);
  assert.equal(mapRadarRatioToRadius(0.88), 0.35);
  assert.equal(mapRadarRatioToRadius(1.4), 1);
  assert.equal(mapRadarRatioToRadius(0.5), 0.35);
});

test("speed and evasion use the shared plus-minus 12 percent equivalent scale", () => {
  const faster = makeStats({ speed: base.speed + 1 });
  const slower = makeStats({ speed: base.speed - 1 });
  const evasionBase = { ...base, evasion: 0.04 };
  const evasive = makeStats({ evasion: evasionBase.evasion + 0.04 });
  const grounded = makeStats({ evasion: evasionBase.evasion - 0.04 });

  assert.equal(getRadarComparableRatio("speed", faster, base), 1.12);
  assert.equal(getRadarComparableRatio("speed", slower, base), 0.88);
  assert.equal(getRadarComparableRatio("evasion", evasive, evasionBase), 1.12);
  assert.equal(getRadarComparableRatio("evasion", grounded, evasionBase), 0.88);
});

test("getMostDivergentRadarStatKey picks the axis farthest from base", () => {
  const stats = makeStats({
    attack: Math.round(base.attack * 1.05),
    defense: 124,
    speed: base.speed + 1,
  });

  assert.equal(getMostDivergentRadarStatKey(stats, base), "defense");
});
