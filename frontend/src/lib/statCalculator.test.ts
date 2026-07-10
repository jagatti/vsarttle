import assert from "node:assert/strict";
import test from "node:test";
import { calculateStatsFromDrawing } from "@/lib/statCalculator";
import type { DrawingData } from "@/types/game";

const blankDrawing: DrawingData = {
  version: 1,
  canvas: { width: 4, height: 4 },
  layers: [
    {
      id: "base",
      name: "base",
      strokes: [
        {
          id: "s1",
          tool: "pen",
          color: "#ff0000",
          size: 8,
          points: [
            { x: 0, y: 0, t: 0 },
            { x: 4, y: 4, t: 1 },
          ],
        },
      ],
    },
  ],
};

// Helper: fill a 4x4 image with a single RGBA color
function solidImage(r: number, g: number, b: number, a = 255) {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 4 * 4; i++) {
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width: 4, height: 4, data };
}

test("calculateStatsFromDrawing keeps values within the overall stat universe", () => {
  // Mixed colors → dominant trend is attack (red + orange > green + dark)
  const imageData = {
    width: 4,
    height: 4,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 255, 100, 0, 255, 0, 255, 0, 255, 10, 10, 10, 255,
      255, 0, 0, 255, 255, 100, 0, 255, 0, 255, 0, 255, 10, 10, 10, 255,
      255, 0, 0, 255, 255, 100, 0, 255, 0, 255, 0, 255, 10, 10, 10, 255,
      255, 0, 0, 255, 255, 100, 0, 255, 0, 255, 0, 255, 10, 10, 10, 255,
    ]),
  };

  const stats = calculateStatsFromDrawing(blankDrawing, imageData);

  assert.ok(stats.hp >= 30 && stats.hp <= 300, `hp ${stats.hp}`);
  assert.ok(stats.pp >= 30 && stats.pp <= 99, `pp ${stats.pp}`);
  assert.ok(stats.attack >= 50 && stats.attack <= 199, `attack ${stats.attack}`);
  assert.ok(stats.defense >= 50 && stats.defense <= 149, `defense ${stats.defense}`);
  assert.ok(stats.speed >= 1 && stats.speed <= 9, `speed ${stats.speed}`);
  assert.ok(stats.evasion >= 0.03 && stats.evasion <= 0.1, `evasion ${stats.evasion}`);
});

test("calculateStatsFromDrawing - attack type: HP/PP low, attack/speed high", () => {
  // Pure red → all attack pixels → trend="attack", trendRatio=1
  const stats = calculateStatsFromDrawing(blankDrawing, solidImage(255, 0, 0));

  assert.ok(stats.hp >= 30 && stats.hp <= 180, `hp ${stats.hp} out of attack range 30-180`);
  assert.ok(stats.pp >= 30 && stats.pp <= 60, `pp ${stats.pp} out of attack range 30-60`);
  assert.ok(stats.attack >= 120 && stats.attack <= 199, `attack ${stats.attack} out of attack range 120-199`);
  assert.ok(stats.defense >= 50 && stats.defense <= 110, `defense ${stats.defense} out of attack range 50-110`);
  assert.ok(stats.speed >= 5 && stats.speed <= 9, `speed ${stats.speed} out of attack range 5-9`);
  assert.ok(stats.evasion >= 0.03 && stats.evasion <= 0.07, `evasion ${stats.evasion} out of attack range 0.03-0.07`);
  assert.strictEqual(stats.hp, stats.maxHp);
  assert.strictEqual(stats.pp, stats.maxPp);
});

test("calculateStatsFromDrawing - defense type: HP/defense high, attack/evasion low", () => {
  // Dark gray (low saturation) → all defense pixels → trend="defense", trendRatio=1
  const stats = calculateStatsFromDrawing(blankDrawing, solidImage(50, 50, 50));

  assert.ok(stats.hp >= 150 && stats.hp <= 300, `hp ${stats.hp} out of defense range 150-300`);
  assert.ok(stats.pp >= 40 && stats.pp <= 80, `pp ${stats.pp} out of defense range 40-80`);
  assert.ok(stats.attack >= 50 && stats.attack <= 110, `attack ${stats.attack} out of defense range 50-110`);
  assert.ok(stats.defense >= 100 && stats.defense <= 149, `defense ${stats.defense} out of defense range 100-149`);
  assert.ok(stats.speed >= 1 && stats.speed <= 5, `speed ${stats.speed} out of defense range 1-5`);
  assert.ok(stats.evasion >= 0.03 && stats.evasion <= 0.05, `evasion ${stats.evasion} out of defense range 0.03-0.05`);
  assert.strictEqual(stats.hp, stats.maxHp);
  assert.strictEqual(stats.pp, stats.maxPp);
});

test("calculateStatsFromDrawing - magic type: PP/speed/evasion high, attack/defense low", () => {
  // Pure blue (hue=240, in 240-330 → magic) → trend="magic", trendRatio=1
  const stats = calculateStatsFromDrawing(blankDrawing, solidImage(0, 0, 255));

  assert.ok(stats.hp >= 30 && stats.hp <= 150, `hp ${stats.hp} out of magic range 30-150`);
  assert.ok(stats.pp >= 60 && stats.pp <= 99, `pp ${stats.pp} out of magic range 60-99`);
  assert.ok(stats.attack >= 50 && stats.attack <= 100, `attack ${stats.attack} out of magic range 50-100`);
  assert.ok(stats.defense >= 50 && stats.defense <= 100, `defense ${stats.defense} out of magic range 50-100`);
  assert.ok(stats.speed >= 5 && stats.speed <= 9, `speed ${stats.speed} out of magic range 5-9`);
  assert.ok(stats.evasion >= 0.06 && stats.evasion <= 0.1, `evasion ${stats.evasion} out of magic range 0.06-0.1`);
  assert.strictEqual(stats.hp, stats.maxHp);
  assert.strictEqual(stats.pp, stats.maxPp);
});

test("calculateStatsFromDrawing - balanced type: stays within balanced ranges", () => {
  // Fully transparent canvas → no colored pixels → trend="balanced"
  const stats = calculateStatsFromDrawing(blankDrawing, solidImage(0, 0, 0, 0));

  assert.ok(stats.hp >= 80 && stats.hp <= 220, `hp ${stats.hp} out of balanced range 80-220`);
  assert.ok(stats.pp >= 40 && stats.pp <= 80, `pp ${stats.pp} out of balanced range 40-80`);
  assert.ok(stats.attack >= 80 && stats.attack <= 150, `attack ${stats.attack} out of balanced range 80-150`);
  assert.ok(stats.defense >= 80 && stats.defense <= 120, `defense ${stats.defense} out of balanced range 80-120`);
  assert.ok(stats.speed >= 3 && stats.speed <= 7, `speed ${stats.speed} out of balanced range 3-7`);
  assert.ok(stats.evasion >= 0.04 && stats.evasion <= 0.07, `evasion ${stats.evasion} out of balanced range 0.04-0.07`);
  assert.strictEqual(stats.hp, stats.maxHp);
  assert.strictEqual(stats.pp, stats.maxPp);
});
