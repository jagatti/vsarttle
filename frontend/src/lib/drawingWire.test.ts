import assert from "node:assert/strict";
import test from "node:test";
import { drawingToDataUrl, prepareDrawingForWire, wireDrawingToStrokes } from "@/lib/drawingWire";
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

test("drawingToDataUrl renders fill strokes as rects", () => {
  const fillDrawing: DrawingData = {
    version: 1,
    canvas: { width: 8, height: 8 },
    layers: [
      {
        id: "base",
        name: "base",
        strokes: [
          {
            id: "fill-1",
            tool: "fill",
            color: "#00ff00",
            size: 0,
            points: [{ x: 1, y: 1, t: 0 }],
            fillSpans: [{ y: 1, x1: 0, x2: 3 }],
          },
        ],
      },
    ],
  };

  const wireDrawing = prepareDrawingForWire(fillDrawing);
  assert.deepEqual(wireDrawing.layers[0].strokes[0].fillSpans, [{ y: 1, x1: 0, x2: 3 }]);

  const dataUrl = drawingToDataUrl(wireDrawing);
  const decoded = decodeURIComponent(dataUrl.split(",")[1] ?? "");
  assert.match(decoded, /<rect x="0" y="1" width="4" height="1" fill="#00ff00" \/>/);
});

test("wireDrawingToStrokes reconstructs editable strokes with placeholder timestamps", () => {
  const wireDrawing = prepareDrawingForWire(drawing);
  const strokes = wireDrawingToStrokes(wireDrawing);

  assert.equal(strokes.length, 1);
  assert.equal(strokes[0].id, "stroke-1");
  assert.equal(strokes[0].tool, "pen");
  assert.equal(strokes[0].color, "#123456");
  assert.equal(strokes[0].size, 8);
  assert.deepEqual(strokes[0].points, [
    { x: 0, y: 0, t: 0 },
    { x: 2, y: 2, t: 0 },
    { x: 8, y: 8, t: 0 },
  ]);
});

test("wireDrawingToStrokes preserves fillSpans", () => {
  const fillDrawing: DrawingData = {
    version: 1,
    canvas: { width: 8, height: 8 },
    layers: [
      {
        id: "base",
        name: "base",
        strokes: [
          {
            id: "fill-1",
            tool: "fill",
            color: "#00ff00",
            size: 0,
            points: [{ x: 1, y: 1, t: 0 }],
            fillSpans: [{ y: 1, x1: 0, x2: 3 }],
          },
        ],
      },
    ],
  };

  const strokes = wireDrawingToStrokes(prepareDrawingForWire(fillDrawing));
  assert.equal(strokes[0].tool, "fill");
  assert.deepEqual(strokes[0].fillSpans, [{ y: 1, x1: 0, x2: 3 }]);
});
