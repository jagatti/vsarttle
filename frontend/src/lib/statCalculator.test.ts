import assert from "node:assert/strict";
import test from "node:test";
import { DEFENSE_SCALE } from "@/lib/battleLogic";
import { analyzeDrawing, BASE_STATS, calculateStatsFromDrawing, detectCharacterType } from "@/lib/statCalculator";
import type { DrawingData, FillSpan, Point, Stroke } from "@/types/game";

type ImageDataLike = Parameters<typeof detectCharacterType>[0];

const CANVAS_SIZE = 32;

function makeDrawing(strokes: Stroke[], width = CANVAS_SIZE, height = CANVAS_SIZE): DrawingData {
  return {
    version: 1,
    canvas: { width, height },
    layers: [{ id: "base", name: "base", strokes }],
  };
}

function makeImageData(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [r, g, b, a] = fill(x, y);
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return { width, height, data };
}

function makeFilledRectImage({
  width = CANVAS_SIZE,
  height = CANVAS_SIZE,
  left,
  top,
  right,
  bottom,
  color,
}: {
  width?: number;
  height?: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  color: [number, number, number, number];
}) {
  return makeImageData(width, height, (x, y) => (x >= left && x <= right && y >= top && y <= bottom ? color : [0, 0, 0, 0]));
}

function makeFilledCircleImage({
  width = CANVAS_SIZE,
  height = CANVAS_SIZE,
  cx,
  cy,
  radius,
  color,
}: {
  width?: number;
  height?: number;
  cx: number;
  cy: number;
  radius: number;
  color: [number, number, number, number];
}) {
  const radiusSquared = radius * radius;
  return makeImageData(width, height, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radiusSquared ? color : [0, 0, 0, 0];
  });
}

function circlePoints(cx: number, cy: number, radius: number, segments: number): Point[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const theta = (Math.PI * 2 * index) / segments;
    return {
      x: cx + Math.cos(theta) * radius,
      y: cy + Math.sin(theta) * radius,
      t: index,
    };
  });
}

function makeFillSpansForRect(left: number, top: number, right: number, bottom: number): FillSpan[] {
  return Array.from({ length: bottom - top + 1 }, (_, index) => ({
    y: top + index,
    x1: left,
    x2: right,
  }));
}

function withinPercent(actual: number, expected: number, percent: number) {
  return Math.abs(actual - expected) <= expected * percent;
}

function withinPercentRounded(actual: number, expected: number, percent: number) {
  return Math.abs(actual - expected) <= expected * percent + 1;
}

function effectiveHp(hp: number, defense: number) {
  return hp * (DEFENSE_SCALE + defense) / DEFENSE_SCALE;
}

function powerOf(stats: ReturnType<typeof calculateStatsFromDrawing>) {
  return effectiveHp(stats.hp, stats.defense) * (stats.attack + 2 * stats.pp + stats.defense) / 3;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandomSyntheticCase(index: number): { drawing: DrawingData; imageData: ImageDataLike } {
  const rng = mulberry32(index + 1);
  const left = 2 + Math.floor(rng() * 12);
  const top = 2 + Math.floor(rng() * 12);
  const boxWidth = 6 + Math.floor(rng() * 12);
  const boxHeight = 6 + Math.floor(rng() * 12);
  const right = Math.min(CANVAS_SIZE - 3, left + boxWidth);
  const bottom = Math.min(CANVAS_SIZE - 3, top + boxHeight);
  const mode = Math.floor(rng() * 4);
  const primary = [
    [255, 0, 0, 255],
    [0, 64, 255, 255],
    [40, 40, 40, 255],
    [255, 180, 0, 255],
  ][Math.floor(rng() * 4)] as [number, number, number, number];
  const secondary = [
    [255, 0, 64, 255],
    [0, 255, 180, 255],
    [64, 64, 64, 255],
    [180, 0, 255, 255],
  ][Math.floor(rng() * 4)] as [number, number, number, number];

  const imageData = makeImageData(CANVAS_SIZE, CANVAS_SIZE, (x, y) => {
    const inRect = x >= left && x <= right && y >= top && y <= bottom;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const rx = Math.max(1, (right - left) / 2);
    const ry = Math.max(1, (bottom - top) / 2);
    const inEllipse = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) <= 1;

    if (mode === 0) return inRect ? primary : [0, 0, 0, 0];
    if (mode === 1) return inEllipse ? primary : [0, 0, 0, 0];
    if (mode === 2 && inRect) return (x + y) % 2 === 0 ? primary : secondary;
    if (mode === 3 && inEllipse) return x % 3 === 0 ? secondary : primary;
    return [0, 0, 0, 0];
  });

  const strokes: Stroke[] = [];
  const strokeCount = 1 + Math.floor(rng() * 3);
  for (let strokeIndex = 0; strokeIndex < strokeCount; strokeIndex += 1) {
    const pointCount = 2 + Math.floor(rng() * 5);
    const points: Point[] = Array.from({ length: pointCount }, (_, pointIndex) => ({
      x: left + rng() * Math.max(1, right - left),
      y: top + rng() * Math.max(1, bottom - top),
      t: pointIndex,
    }));
    strokes.push({
      id: `p-${index}-${strokeIndex}`,
      tool: "pen",
      color: "#000000",
      size: 2 + Math.floor(rng() * 9),
      points,
    });
  }
  if (rng() > 0.5) {
    strokes.push({
      id: `f-${index}`,
      tool: "fill",
      color: "#ff0000",
      size: 1,
      points: [{ x: left, y: top, t: 0 }],
      fillSpans: makeFillSpansForRect(left, top, right, bottom),
    });
  }

  return { drawing: makeDrawing(strokes), imageData };
}

test("analyzeDrawing keeps pure red filled art close to the attack preset", () => {
  const imageData = makeFilledRectImage({
    left: 8,
    top: 8,
    right: 23,
    bottom: 23,
    color: [255, 0, 0, 255],
  });
  const drawing = makeDrawing([
    {
      id: "fill",
      tool: "fill",
      color: "#ff0000",
      size: 1,
      points: [{ x: 8, y: 8, t: 0 }],
      fillSpans: makeFillSpansForRect(8, 8, 23, 23),
    },
  ]);

  const analysis = analyzeDrawing(drawing, imageData);

  assert.equal(analysis.trend, "attack");
  assert.ok(withinPercentRounded(analysis.stats.hp, BASE_STATS.attack.hp, 0.05));
  assert.ok(withinPercentRounded(analysis.stats.pp, BASE_STATS.attack.pp, 0.05));
  assert.ok(withinPercentRounded(analysis.stats.attack, BASE_STATS.attack.attack, 0.05));
  assert.ok(withinPercentRounded(analysis.stats.defense, BASE_STATS.attack.defense, 0.05));
  assert.ok(Math.abs(analysis.stats.speed - BASE_STATS.attack.speed) <= 1);
  assert.ok(analysis.stats.evasion >= 0 && analysis.stats.evasion <= 0.05);
});

test("stat calculation stays mostly size-independent for the same simple shape", () => {
  const smallImage = makeFilledCircleImage({ cx: 5, cy: 5, radius: 3, color: [0, 0, 0, 255] });
  const largeImage = makeFilledCircleImage({ cx: 16, cy: 16, radius: 9, color: [0, 0, 0, 255] });
  const emptyDrawing = makeDrawing([]);

  const smallStats = calculateStatsFromDrawing(emptyDrawing, smallImage);
  const largeStats = calculateStatsFromDrawing(emptyDrawing, largeImage);

  assert.equal(detectCharacterType(smallImage), detectCharacterType(largeImage));
  assert.ok(withinPercent(smallStats.pp, largeStats.pp, 0.03));
  assert.ok(withinPercent(smallStats.attack, largeStats.attack, 0.03));
  assert.ok(withinPercent(smallStats.defense, largeStats.defense, 0.03));
});

test("extra visual complexity does not push overall power far beyond the base preset", () => {
  const smallBlackDotImage = makeFilledCircleImage({ cx: 5, cy: 5, radius: 2, color: [0, 0, 0, 255] });
  const smallBlackDotStats = calculateStatsFromDrawing(makeDrawing([]), smallBlackDotImage);
  const smallBlackDotType = detectCharacterType(smallBlackDotImage);

  const complexImage = makeImageData(CANVAS_SIZE, CANVAS_SIZE, (x, y) => {
    if ((x + y) % 5 === 0) return [255, 0, 0, 255];
    if ((x * 2 + y) % 5 === 1) return [0, 64, 255, 255];
    if ((x + y * 3) % 5 === 2) return [255, 200, 0, 255];
    return [0, 0, 0, 255];
  });
  const complexDrawing = makeDrawing([
    {
      id: "curve-a",
      tool: "pen",
      color: "#ff0000",
      size: 3,
      points: circlePoints(10, 10, 7, 14),
    },
    {
      id: "curve-b",
      tool: "pen",
      color: "#0000ff",
      size: 9,
      points: circlePoints(21, 20, 8, 18),
    },
    {
      id: "fill",
      tool: "fill",
      color: "#ffcc00",
      size: 1,
      points: [{ x: 16, y: 16, t: 0 }],
      fillSpans: makeFillSpansForRect(4, 4, 27, 27),
    },
  ]);
  const complexStats = calculateStatsFromDrawing(complexDrawing, complexImage);
  const complexType = detectCharacterType(complexImage);

  const smallBasePower = powerOf({
    ...BASE_STATS[smallBlackDotType],
    maxHp: BASE_STATS[smallBlackDotType].hp,
    maxPp: BASE_STATS[smallBlackDotType].pp,
  });
  const complexBasePower = powerOf({
    ...BASE_STATS[complexType],
    maxHp: BASE_STATS[complexType].hp,
    maxPp: BASE_STATS[complexType].pp,
  });

  assert.ok(withinPercent(powerOf(smallBlackDotStats), smallBasePower, 0.08));
  assert.ok(withinPercent(powerOf(complexStats), complexBasePower, 0.08));
});

test("attack and PP stay zero-sum around the blended base", () => {
  const imageData = makeFilledCircleImage({ cx: 16, cy: 16, radius: 8, color: [255, 0, 128, 255] });
  const drawing = makeDrawing([
    {
      id: "curve",
      tool: "pen",
      color: "#ff0080",
      size: 3,
      points: circlePoints(16, 16, 8, 12),
    },
  ]);

  const analysis = analyzeDrawing(drawing, imageData);
  const attackDelta = analysis.stats.attack / analysis.base.attack - 1;
  const ppDelta = analysis.stats.pp / analysis.base.pp - 1;

  assert.equal(Math.sign(attackDelta), -Math.sign(ppDelta));
  assert.ok(Math.abs(Math.abs(attackDelta) - Math.abs(ppDelta)) <= 0.03);
});

test("random synthetic drawings stay inside the configured stat ranges", () => {
  for (let index = 0; index < 200; index += 1) {
    const { drawing, imageData } = makeRandomSyntheticCase(index);
    const analysis = analyzeDrawing(drawing, imageData);

    assert.ok(Math.abs(analysis.stats.attack - analysis.base.attack) / analysis.base.attack <= 0.15 + 1 / analysis.base.attack);
    assert.ok(Math.abs(analysis.stats.pp - analysis.base.pp) / analysis.base.pp <= 0.15 + 1 / analysis.base.pp);
    assert.ok(Math.abs(analysis.stats.defense - analysis.base.defense) / analysis.base.defense <= 0.15 + 1 / analysis.base.defense);
    assert.ok(Math.abs(analysis.stats.speed - Math.round(analysis.base.speed)) <= 1);
    assert.ok(analysis.stats.evasion >= 0 && analysis.stats.evasion <= 0.05);
  }
});

test("higher defense drawings trade HP while preserving effective HP", () => {
  const imageData = makeFilledRectImage({
    left: 6,
    top: 8,
    right: 25,
    bottom: 22,
    color: [255, 0, 0, 255],
  });

  const highDefense = analyzeDrawing(
    makeDrawing([
      {
        id: "stable-wide",
        tool: "pen",
        color: "#ff0000",
        size: 10,
        points: [
          { x: 4, y: 10, t: 0 },
          { x: 28, y: 10, t: 1 },
          { x: 28, y: 12, t: 2 },
          { x: 4, y: 12, t: 3 },
        ],
      },
    ]),
    imageData,
  );
  const lowDefense = analyzeDrawing(
    makeDrawing([
      {
        id: "curvy-thin",
        tool: "pen",
        color: "#ff0000",
        size: 2,
        points: circlePoints(16, 16, 8, 18),
      },
      {
        id: "fill",
        tool: "fill",
        color: "#ff6666",
        size: 1,
        points: [{ x: 16, y: 16, t: 0 }],
        fillSpans: makeFillSpansForRect(10, 12, 22, 20),
      },
    ]),
    imageData,
  );

  const highTarget = effectiveHp(highDefense.base.hp, highDefense.base.defense);
  const lowTarget = effectiveHp(lowDefense.base.hp, lowDefense.base.defense);

  assert.ok(highDefense.stats.defense > lowDefense.stats.defense);
  assert.ok(highDefense.stats.hp < lowDefense.stats.hp);
  assert.ok(withinPercent(effectiveHp(highDefense.stats.hp, highDefense.stats.defense), highTarget, 0.02));
  assert.ok(withinPercent(effectiveHp(lowDefense.stats.hp, lowDefense.stats.defense), lowTarget, 0.02));
});

test("empty canvases still map to the balanced preset", () => {
  const imageData = makeImageData(CANVAS_SIZE, CANVAS_SIZE, () => [0, 0, 0, 0]);
  const stats = calculateStatsFromDrawing(makeDrawing([]), imageData);

  assert.deepEqual(stats, {
    hp: 300,
    maxHp: 300,
    pp: 65,
    maxPp: 65,
    attack: 120,
    defense: 110,
    speed: 6,
    evasion: 0.01,
  });
});
