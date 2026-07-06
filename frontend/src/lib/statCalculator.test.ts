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

test("calculateStatsFromDrawing keeps values in required ranges", () => {
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

  assert.ok(stats.hp >= 30 && stats.hp <= 300);
  assert.ok(stats.pp >= 20 && stats.pp <= 50);
  assert.ok(stats.attack >= 50 && stats.attack <= 200);
  assert.ok(stats.defense >= 50 && stats.defense <= 200);
  assert.ok(stats.speed >= 20 && stats.speed <= 50);
  assert.ok(stats.evasion >= 0.03 && stats.evasion <= 0.1);
});
