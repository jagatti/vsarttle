import assert from "node:assert/strict";
import test from "node:test";
import { removeEdgeBackgroundPixels } from "@/lib/danceBattleImage";

test("dance portrait background removal clears edge-connected white but preserves enclosed white details", () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4);
  for (let index = 0; index < 25; index += 1) {
    pixels.set([255, 255, 255, 255], index * 4);
  }
  for (const index of [6, 7, 8, 11, 13, 16, 17, 18]) {
    pixels.set([10, 20, 30, 255], index * 4);
  }

  removeEdgeBackgroundPixels(pixels, 5, 5);

  assert.equal(pixels[3], 0);
  assert.equal(pixels[12 * 4 + 3], 255);
  assert.equal(pixels[11 * 4 + 3], 255);
});

test("dance portrait background removal also clears solid colored edge backgrounds", () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4);
  for (let index = 0; index < 25; index += 1) {
    pixels.set([60, 120, 190, 255], index * 4);
  }
  pixels.set([230, 30, 40, 255], 12 * 4);

  removeEdgeBackgroundPixels(pixels, 5, 5);

  assert.equal(pixels[3], 0);
  assert.equal(pixels[12 * 4 + 3], 255);
});
