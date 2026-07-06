import assert from "node:assert/strict";
import test from "node:test";
import { drawingToDataUrl, prepareDrawingForWire } from "@/lib/drawingWire";
import type { DrawingData } from "@/types/game";

const drawing: DrawingData = {
  version: 1,
  canvas: { width: 8, height: 8 },
  layers: [
    {
      id: "base",
      name: "base",
      strokes: [
        {
          id: "stroke-1",
          tool: "pen",
          color: "#123456",
          size: 7.7,
          points: [
            { x: 0.1, y: 0.2, t: 1000 },
            { x: 0.4, y: 0.5, t: 1001 },
            { x: 2.2, y: 2.4, t: 1002 },
            { x: 2.4, y: 2.5, t: 1003 },
            { x: 7.8, y: 7.7, t: 1004 },
          ],
        },
      ],
    },
  ],
};

test("prepareDrawingForWire removes timestamps and shrinks dense point data", () => {
  const wireDrawing = prepareDrawingForWire(drawing);

  assert.deepEqual(wireDrawing.layers[0].strokes[0].points, [
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    { x: 8, y: 8 },
  ]);
  assert.equal(wireDrawing.layers[0].strokes[0].size, 8);
  assert.ok(JSON.stringify(wireDrawing).length < JSON.stringify(drawing).length);
});

test("drawingToDataUrl returns an svg data url for battle portraits", () => {
  const wireDrawing = prepareDrawingForWire(drawing);
  const dataUrl = drawingToDataUrl(wireDrawing);

  assert.ok(dataUrl.startsWith("data:image/svg+xml;charset=UTF-8,"));
  const decoded = decodeURIComponent(dataUrl.split(",")[1] ?? "");
  assert.match(decoded, /<svg/);
  assert.match(decoded, /<polyline/);
  assert.match(decoded, /stroke="#123456"/);
});
