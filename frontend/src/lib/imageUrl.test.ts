import test from "node:test";
import assert from "node:assert/strict";
import { drawingToDataUrl } from "./drawingWire";
import { FALLBACK_CHARACTER_IMAGE_URL, isBlankSvgDataUrl, resolveCharacterImageUrl, safeImageUrl } from "./imageUrl";

test("safeImageUrl allows data URLs and root-relative static asset paths", () => {
  assert.equal(
    safeImageUrl("data:image/svg+xml;base64,abc"),
    "data:image/svg+xml;base64,abc",
  );
  assert.equal(safeImageUrl("/arttle_boss/boss1.png"), "/arttle_boss/boss1.png");
  assert.equal(safeImageUrl("/images/avatar.png"), "/images/avatar.png");
});

test("safeImageUrl rejects non-whitelisted URL schemes", () => {
  assert.equal(safeImageUrl("https://example.com/image.png"), "");
  assert.equal(safeImageUrl("javascript:alert(1)"), "");
});

test("isBlankSvgDataUrl detects SVGs that draw nothing (empty or erase-only drawings)", () => {
  const emptyDrawing = drawingToDataUrl({ version: 1, canvas: { width: 512, height: 512 }, layers: [{ id: "l", name: "l", strokes: [] }] });
  assert.equal(isBlankSvgDataUrl(emptyDrawing), true);
  const singlePointOnly = drawingToDataUrl({
    version: 1,
    canvas: { width: 512, height: 512 },
    layers: [{ id: "l", name: "l", strokes: [{ id: "s", tool: "pen", color: "#000", size: 4, points: [{ x: 1, y: 1 }] }] }],
  });
  assert.equal(isBlankSvgDataUrl(singlePointOnly), true);
  const eraserOnly = drawingToDataUrl({
    version: 1,
    canvas: { width: 512, height: 512 },
    layers: [{ id: "l", name: "l", strokes: [{ id: "e", tool: "eraser", color: "#000", size: 8, points: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }] }],
  });
  assert.equal(isBlankSvgDataUrl(eraserOnly), true);
  assert.equal(isBlankSvgDataUrl(`data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"></svg>')}`), true);
});

test("isBlankSvgDataUrl keeps real drawings and non-SVG images", () => {
  const drawn = drawingToDataUrl({
    version: 1,
    canvas: { width: 512, height: 512 },
    layers: [{ id: "l", name: "l", strokes: [{ id: "s", tool: "pen", color: "#000", size: 4, points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }] }],
  });
  assert.equal(isBlankSvgDataUrl(drawn), false);
  assert.equal(isBlankSvgDataUrl("data:image/png;base64,aaa"), false);
  assert.equal(isBlankSvgDataUrl("data:image/svg+xml;base64,abc"), false);
  assert.equal(isBlankSvgDataUrl("/arttle_boss/boss1.png"), false);
});

test("resolveCharacterImageUrl falls back for missing, invalid, empty or blank images", () => {
  for (const value of [undefined, null, "", "   ", "/", "https://example.com/a.png", "javascript:alert(1)", "data:image/png;base64,", "data:image/svg+xml;charset=UTF-8,%3Csvg%3E%3C%2Fsvg%3E"]) {
    assert.equal(resolveCharacterImageUrl(value), FALLBACK_CHARACTER_IMAGE_URL, String(value));
  }
  assert.equal(resolveCharacterImageUrl("/arttle_boss/boss1.png"), "/arttle_boss/boss1.png");
  assert.equal(resolveCharacterImageUrl("data:image/png;base64,aaa"), "data:image/png;base64,aaa");
});

test("fallback character image is itself a visible SVG", () => {
  assert.ok(FALLBACK_CHARACTER_IMAGE_URL.startsWith("data:image/svg+xml"));
  assert.equal(isBlankSvgDataUrl(FALLBACK_CHARACTER_IMAGE_URL), false);
  assert.equal(resolveCharacterImageUrl(FALLBACK_CHARACTER_IMAGE_URL), FALLBACK_CHARACTER_IMAGE_URL);
});
