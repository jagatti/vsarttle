import assert from "node:assert/strict";
import test from "node:test";
import { calculateStatsFromDrawing } from "@/lib/statCalculator";
import type { DrawingData } from "@/types/game";

const mediumStrokeDrawing: DrawingData = {
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
          size: 6,
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

function makeDrawingWithStrokeSize(size: number, strokeCount: number): DrawingData {
  const strokes = Array.from({ length: strokeCount }, (_, i) => ({
    id: `s${i}`,
    tool: "pen" as const,
    color: `#${(i + 1).toString(16).padStart(2, "0")}00ff`,
    size,
    points: [
      { x: 0, y: i % 2 === 0 ? 0 : 4, t: i * 2 },
      { x: 4, y: i % 2 === 0 ? 4 : 0, t: i * 2 + 1 },
    ],
  }));
  return {
    version: 1,
    canvas: { width: 4, height: 4 },
    layers: [{ id: "base", name: "base", strokes }],
  };
}

function attackMultiColorImage() {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i += 1) {
    data[i * 4 + 0] = 255;
    data[i * 4 + 1] = (i * 13) % 90;
    data[i * 4 + 2] = (i * 7) % 40;
    data[i * 4 + 3] = 255;
  }
  return { width: 4, height: 4, data };
}

test("calculateStatsFromDrawing - attack type uses new base max stats", () => {
  const stats = calculateStatsFromDrawing(mediumStrokeDrawing, solidImage(255, 0, 0));
  assert.deepEqual(stats, {
    hp: 300,
    maxHp: 300,
    pp: 50,
    maxPp: 50,
    attack: 199,
    defense: 100,
    speed: 6,
    evasion: 0.01,
  });
});

test("calculateStatsFromDrawing - defense type uses new base max stats", () => {
  const stats = calculateStatsFromDrawing(mediumStrokeDrawing, solidImage(50, 50, 50));
  assert.deepEqual(stats, {
    hp: 360,
    maxHp: 360,
    pp: 50,
    maxPp: 50,
    attack: 80,
    defense: 160,
    speed: 5,
    evasion: 0.01,
  });
});

test("calculateStatsFromDrawing - magic type uses new base max stats", () => {
  const stats = calculateStatsFromDrawing(mediumStrokeDrawing, solidImage(0, 0, 255));
  assert.deepEqual(stats, {
    hp: 280,
    maxHp: 280,
    pp: 90,
    maxPp: 90,
    attack: 100,
    defense: 100,
    speed: 7,
    evasion: 0.01,
  });
});

test("calculateStatsFromDrawing - balanced type uses new base max stats", () => {
  const stats = calculateStatsFromDrawing(mediumStrokeDrawing, solidImage(0, 0, 0, 0));
  assert.deepEqual(stats, {
    hp: 250,
    maxHp: 250,
    pp: 50,
    maxPp: 50,
    attack: 100,
    defense: 100,
    speed: 6,
    evasion: 0.01,
  });
});

test("calculateStatsFromDrawing - thick lines increase HP max up to +10%", () => {
  const thickDrawing = makeDrawingWithStrokeSize(10, 4);
  const stats = calculateStatsFromDrawing(thickDrawing, solidImage(255, 0, 0));
  assert.equal(stats.maxHp, 330);
  assert.equal(stats.maxPp, 50);
});

test("calculateStatsFromDrawing - thin + multicolor increase PP max up to +10%", () => {
  const thinDrawing = makeDrawingWithStrokeSize(2, 4);
  const stats = calculateStatsFromDrawing(thinDrawing, attackMultiColorImage());
  assert.equal(stats.maxPp, 55);
});
