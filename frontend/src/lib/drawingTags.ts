import { AXIS_WEIGHTS, type DrawingFeatures } from "@/lib/statCalculator";

export interface DrawingTag {
  id: string;
  label: string;
  effectText: string;
}

interface DrawingTagDefinition {
  feature: keyof DrawingFeatures;
  positive: DrawingTag;
  negative?: DrawingTag;
}

export const TAG_THRESHOLD = 0.35;

const PLAIN_TAG: DrawingTag = {
  id: "plain",
  label: "ふつう",
  effectText: "くせのない絵",
};

const DRAWING_TAG_DEFINITIONS: readonly DrawingTagDefinition[] = [
  {
    feature: "curvature",
    positive: { id: "round", label: "まるい", effectText: "回避↑ 攻撃↓" },
    negative: { id: "angular", label: "かくばった", effectText: "攻撃↑ 回避↓" },
  },
  {
    feature: "stability",
    positive: { id: "stable", label: "どっしり", effectText: "防御↑ HP↓" },
    negative: { id: "tilted", label: "ななめ", effectText: "HP↑ 防御↓" },
  },
  {
    feature: "density",
    positive: { id: "dense", label: "ぎっしり", effectText: "速度↑ 回避↓" },
    negative: { id: "airy", label: "すかすか", effectText: "回避↑ 速度↓" },
  },
  {
    feature: "aspect",
    positive: { id: "wide", label: "よこなが", effectText: "防御↑ HP↓" },
    negative: { id: "tall", label: "たてなが", effectText: "HP↑ 防御↓" },
  },
  {
    feature: "offCenter",
    positive: { id: "off-center", label: "かたよった", effectText: "回避↑ 速度↓" },
  },
  {
    feature: "saturation",
    positive: { id: "vivid", label: "あざやか", effectText: "攻撃↑ PP↓" },
    negative: { id: "muted", label: "しぶい", effectText: "PP↑ 攻撃↓" },
  },
  {
    feature: "lightness",
    positive: { id: "bright", label: "あかるい", effectText: "速度↑ 回避↓" },
    negative: { id: "dark", label: "くらい", effectText: "回避↑ 速度↓" },
  },
  {
    feature: "paletteSpread",
    positive: { id: "colorful", label: "カラフル", effectText: "PP↑ 攻撃↓" },
  },
  {
    feature: "fillRatio",
    positive: { id: "filled", label: "べたぬり", effectText: "HP↑ 防御↓" },
    negative: { id: "lined", label: "せんがき", effectText: "防御↑ HP↓" },
  },
  {
    feature: "thickRatio",
    positive: { id: "thick", label: "ふとい", effectText: "防御↑ HP↓" },
    negative: { id: "thin", label: "ほそい", effectText: "HP↑ 防御↓" },
  },
] as const;

const TAGS_BY_LABEL = new Map<string, DrawingTag>(
  [PLAIN_TAG, ...DRAWING_TAG_DEFINITIONS.flatMap((definition) => [definition.positive, definition.negative].filter(Boolean) as DrawingTag[])]
    .map((tag) => [tag.label, tag]),
);

function toSignedFeatureValue(feature: keyof DrawingFeatures, value: number) {
  if (feature === "offCenter" || feature === "paletteSpread") {
    return value * 2 - 1;
  }
  return value;
}

export function getDrawingTagByLabel(label: string): DrawingTag | undefined {
  return TAGS_BY_LABEL.get(label);
}

export function buildDrawingTags(features: DrawingFeatures, maxTags = 2): DrawingTag[] {
  const limit = Math.max(1, Math.floor(maxTags));
  const candidates = DRAWING_TAG_DEFINITIONS
    .map((definition, index) => {
      const signedValue = toSignedFeatureValue(definition.feature, features[definition.feature]);
      if (Math.abs(signedValue) < TAG_THRESHOLD) return null;
      if (signedValue < 0 && !definition.negative) return null;
      return {
        index,
        weight: Math.abs(signedValue),
        tag: signedValue >= 0 ? definition.positive : definition.negative!,
      };
    })
    .filter((candidate): candidate is { index: number; weight: number; tag: DrawingTag } => candidate !== null)
    .sort((left, right) => right.weight - left.weight || left.index - right.index)
    .slice(0, limit)
    .map((candidate) => candidate.tag);

  return candidates.length > 0 ? candidates : [PLAIN_TAG];
}

export const DRAWING_TAG_EFFECT_SOURCES = {
  curvature: {
    positive: [AXIS_WEIGHTS.evasionVsSpeed.curvature, AXIS_WEIGHTS.attackVsPp.curvature],
    negative: [-AXIS_WEIGHTS.attackVsPp.curvature, -AXIS_WEIGHTS.evasionVsSpeed.curvature],
  },
  stability: {
    positive: [AXIS_WEIGHTS.defenseVsHp.stability],
    negative: [-AXIS_WEIGHTS.defenseVsHp.stability],
  },
  density: {
    positive: [-AXIS_WEIGHTS.evasionVsSpeed.density],
    negative: [AXIS_WEIGHTS.evasionVsSpeed.density],
  },
  aspect: {
    positive: [AXIS_WEIGHTS.defenseVsHp.aspect],
    negative: [-AXIS_WEIGHTS.defenseVsHp.aspect],
  },
  offCenter: {
    positive: [AXIS_WEIGHTS.evasionVsSpeed.offCenter],
  },
  saturation: {
    positive: [AXIS_WEIGHTS.attackVsPp.saturation],
    negative: [-AXIS_WEIGHTS.attackVsPp.saturation],
  },
  lightness: {
    positive: [-AXIS_WEIGHTS.evasionVsSpeed.lightness],
    negative: [AXIS_WEIGHTS.evasionVsSpeed.lightness],
  },
  paletteSpread: {
    positive: [-AXIS_WEIGHTS.attackVsPp.paletteSpread],
  },
  fillRatio: {
    positive: [-AXIS_WEIGHTS.defenseVsHp.fillRatio],
    negative: [AXIS_WEIGHTS.defenseVsHp.fillRatio],
  },
  thickRatio: {
    positive: [AXIS_WEIGHTS.defenseVsHp.thickRatio],
    negative: [-AXIS_WEIGHTS.defenseVsHp.thickRatio],
  },
} as const;
