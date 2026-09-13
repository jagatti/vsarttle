import assert from "node:assert/strict";
import test from "node:test";
import { AXIS_WEIGHTS, type DrawingFeatures } from "@/lib/statCalculator";
import { buildDrawingTags } from "@/lib/drawingTags";

function makeFeatures(overrides: Partial<DrawingFeatures> = {}): DrawingFeatures {
  return {
    curvature: 0,
    stability: 0,
    density: 0,
    aspect: 0,
    offCenter: 0.5,
    saturation: 0,
    lightness: 0,
    paletteSpread: 0.5,
    fillRatio: 0,
    thickRatio: 0,
    ...overrides,
  };
}

test("buildDrawingTags returns plain when every feature stays below threshold", () => {
  const tags = buildDrawingTags(
    makeFeatures({
      curvature: 0.34,
      offCenter: 0.67,
      paletteSpread: 0.66,
    }),
  );

  assert.deepEqual(tags.map((tag) => tag.label), ["ふつう"]);
});

test("buildDrawingTags picks the strongest two features and respects sign", () => {
  const tags = buildDrawingTags(
    makeFeatures({
      saturation: 0.92,
      curvature: -0.7,
      density: 0.6,
    }),
  );

  assert.deepEqual(tags.map((tag) => tag.label), ["あざやか", "かくばった"]);
});

test("buildDrawingTags converts offCenter and paletteSpread from 0-1 into signed values", () => {
  const tags = buildDrawingTags(
    makeFeatures({
      offCenter: 0.9,
      paletteSpread: 0.85,
    }),
  );

  assert.deepEqual(tags.map((tag) => tag.label), ["かたよった", "カラフル"]);
});

test("buildDrawingTags respects maxTags=1", () => {
  const tags = buildDrawingTags(
    makeFeatures({
      saturation: -0.8,
      curvature: 0.9,
    }),
    1,
  );

  assert.deepEqual(tags.map((tag) => tag.label), ["まるい"]);
});

test("buildDrawingTags effect text stays aligned with AXIS_WEIGHTS directions", () => {
  const cases = [
    { features: makeFeatures({ curvature: 1 }), label: "まるい", effectText: "回避↑ 攻撃↓", evidence: AXIS_WEIGHTS.evasionVsSpeed.curvature > 0 && AXIS_WEIGHTS.attackVsPp.curvature < 0 },
    { features: makeFeatures({ curvature: -1 }), label: "かくばった", effectText: "攻撃↑ 回避↓", evidence: AXIS_WEIGHTS.attackVsPp.curvature < 0 && AXIS_WEIGHTS.evasionVsSpeed.curvature > 0 },
    { features: makeFeatures({ stability: 1 }), label: "どっしり", effectText: "防御↑ HP↓", evidence: AXIS_WEIGHTS.defenseVsHp.stability > 0 },
    { features: makeFeatures({ stability: -1 }), label: "ななめ", effectText: "HP↑ 防御↓", evidence: AXIS_WEIGHTS.defenseVsHp.stability > 0 },
    { features: makeFeatures({ density: 1 }), label: "ぎっしり", effectText: "速度↑ 回避↓", evidence: AXIS_WEIGHTS.evasionVsSpeed.density < 0 },
    { features: makeFeatures({ density: -1 }), label: "すかすか", effectText: "回避↑ 速度↓", evidence: AXIS_WEIGHTS.evasionVsSpeed.density < 0 },
    { features: makeFeatures({ aspect: 1 }), label: "よこなが", effectText: "防御↑ HP↓", evidence: AXIS_WEIGHTS.defenseVsHp.aspect > 0 },
    { features: makeFeatures({ aspect: -1 }), label: "たてなが", effectText: "HP↑ 防御↓", evidence: AXIS_WEIGHTS.defenseVsHp.aspect > 0 },
    { features: makeFeatures({ offCenter: 1 }), label: "かたよった", effectText: "回避↑ 速度↓", evidence: AXIS_WEIGHTS.evasionVsSpeed.offCenter > 0 },
    { features: makeFeatures({ saturation: 1 }), label: "あざやか", effectText: "攻撃↑ PP↓", evidence: AXIS_WEIGHTS.attackVsPp.saturation > 0 },
    { features: makeFeatures({ saturation: -1 }), label: "しぶい", effectText: "PP↑ 攻撃↓", evidence: AXIS_WEIGHTS.attackVsPp.saturation > 0 },
    { features: makeFeatures({ lightness: 1 }), label: "あかるい", effectText: "速度↑ 回避↓", evidence: AXIS_WEIGHTS.evasionVsSpeed.lightness < 0 },
    { features: makeFeatures({ lightness: -1 }), label: "くらい", effectText: "回避↑ 速度↓", evidence: AXIS_WEIGHTS.evasionVsSpeed.lightness < 0 },
    { features: makeFeatures({ paletteSpread: 1 }), label: "カラフル", effectText: "PP↑ 攻撃↓", evidence: AXIS_WEIGHTS.attackVsPp.paletteSpread < 0 },
    { features: makeFeatures({ fillRatio: 1 }), label: "べたぬり", effectText: "HP↑ 防御↓", evidence: AXIS_WEIGHTS.defenseVsHp.fillRatio < 0 },
    { features: makeFeatures({ fillRatio: -1 }), label: "せんがき", effectText: "防御↑ HP↓", evidence: AXIS_WEIGHTS.defenseVsHp.fillRatio < 0 },
    { features: makeFeatures({ thickRatio: 1 }), label: "ふとい", effectText: "防御↑ HP↓", evidence: AXIS_WEIGHTS.defenseVsHp.thickRatio > 0 },
    { features: makeFeatures({ thickRatio: -1 }), label: "ほそい", effectText: "HP↑ 防御↓", evidence: AXIS_WEIGHTS.defenseVsHp.thickRatio > 0 },
  ] as const;

  for (const entry of cases) {
    assert.ok(entry.evidence);
    const tag = buildDrawingTags(entry.features, 1)[0];
    assert.equal(tag.label, entry.label);
    assert.equal(tag.effectText, entry.effectText);
  }
});
