import { DEFENSE_SCALE } from "@/lib/battleLogic";
import type { CharacterStats, DrawingData } from "@/types/game";

interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type ColorTrend = "attack" | "magic" | "defense" | "balanced";

export interface DrawingFeatures {
  curvature: number;
  stability: number;
  density: number;
  aspect: number;
  offCenter: number;
  saturation: number;
  lightness: number;
  paletteSpread: number;
  fillRatio: number;
  thickRatio: number;
}

export interface DrawingAxes {
  sA: number;
  sB: number;
  sC: number;
}

export interface DrawingWeights {
  attack: number;
  magic: number;
  defense: number;
}

export interface BaseStatProfile {
  hp: number;
  pp: number;
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
}

export interface DrawingAnalysis {
  trend: ColorTrend;
  weights: DrawingWeights;
  purity: number;
  features: DrawingFeatures;
  axes: DrawingAxes;
  base: BaseStatProfile;
  stats: CharacterStats;
}

interface TrendInfo {
  trend: ColorTrend;
  trendRatio: number;
  filledPixels: number;
  attackCount: number;
  magicCount: number;
  defenseCount: number;
  density: number;
  aspect: number;
  offCenter: number;
  avgSaturation: number;
  avgLightness: number;
  paletteSpread: number;
}

interface StrokeMetrics {
  curvature: number;
  stability: number;
  thickRatio: number;
  fillRatio: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (start: number, end: number, amount: number) => start + (end - start) * amount;

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const normalizeAngleDelta = (left: number, right: number) => {
  const tau = Math.PI * 2;
  const delta = Math.abs(left - right) % tau;
  return delta > Math.PI ? tau - delta : delta;
};

const distanceToAxis = (angle: number) => {
  const halfPi = Math.PI / 2;
  const normalized = ((angle % halfPi) + halfPi) % halfPi;
  return Math.min(normalized, halfPi - normalized);
};

const toHue = (r: number, g: number, b: number): number => {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  if (d === 0) return 0;
  if (max === rr) return ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
  if (max === gg) return ((bb - rr) / d + 2) * 60;
  return ((rr - gg) / d + 4) * 60;
};

export const FEATURE_NEUTRAL = {
  curvature: 0.5,
  stability: 0.5,
  density: 0.35,
  saturation: 0.5,
  lightness: 0.5,
  fillRatio: 0.5,
  thickRatio: 0.5,
} as const;

export const AXIS_WEIGHTS = {
  attackVsPp: {
    curvature: -0.5,
    saturation: 0.4,
    paletteSpread: -0.4,
    thickRatio: -0.2,
  },
  defenseVsHp: {
    stability: 0.4,
    aspect: 0.3,
    thickRatio: 0.3,
    fillRatio: -0.3,
    density: -0.2,
  },
  speedVsEvasion: {
    curvature: 0.5,
    offCenter: 0.4,
    density: -0.3,
    lightness: -0.2,
  },
} as const;

const AXIS_VARIANCE = {
  attackPp: 0.12,
  defense: 0.12,
  evasionUp: 0.04,
  evasionDown: 0.01,
} as const;

const EMPTY_WEIGHTS: DrawingWeights = { attack: 0, magic: 0, defense: 0 };
const NEUTRAL_FEATURES: DrawingFeatures = {
  curvature: 0,
  stability: 0,
  density: 0,
  aspect: 0,
  offCenter: 0.5,
  saturation: 0,
  lightness: 0,
  paletteSpread: 0,
  fillRatio: 0,
  thickRatio: 0,
};

const trendKeys = ["attack", "magic", "defense"] as const satisfies readonly Exclude<ColorTrend, "balanced">[];
const statKeys = ["hp", "pp", "attack", "defense", "speed", "evasion"] as const satisfies readonly (keyof BaseStatProfile)[];

const emptyBaseStats = (): BaseStatProfile => ({
  hp: 0,
  pp: 0,
  attack: 0,
  defense: 0,
  speed: 0,
  evasion: 0,
});

function detectTrend(imageData: ImageDataLike): TrendInfo {
  let filledPixels = 0;
  let attackCount = 0;
  let magicCount = 0;
  let defenseCount = 0;
  let minX = imageData.width;
  let minY = imageData.height;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let saturationSum = 0;
  let lightnessSum = 0;
  const paletteBins = new Set<number>();

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    const a = imageData.data[i + 3];
    if (a < 8) continue;

    const pixelIndex = i / 4;
    const x = pixelIndex % imageData.width;
    const y = Math.floor(pixelIndex / imageData.width);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const lightness = (max + min) / (2 * 255);
    const hue = toHue(r, g, b);
    const hueBin = Math.floor(hue / 30) % 12;
    const satBin = saturation >= 0.5 ? 1 : 0;
    const lightBin = lightness >= 0.5 ? 1 : 0;

    filledPixels += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    sumX += x;
    sumY += y;
    saturationSum += saturation;
    lightnessSum += lightness;
    paletteBins.add(hueBin + satBin * 12 + lightBin * 24);

    if (max - min < 20 || max < 70) {
      defenseCount += 1;
      continue;
    }

    if (hue <= 50 || hue >= 330) {
      attackCount += 1;
    } else if (hue >= 80 && hue <= 220) {
      magicCount += 1;
    } else if (hue >= 240 && hue < 330) {
      magicCount += 1;
    } else {
      defenseCount += 1;
    }
  }

  if (filledPixels === 0) {
    return {
      trend: "balanced",
      trendRatio: 0,
      filledPixels: 0,
      attackCount: 0,
      magicCount: 0,
      defenseCount: 0,
      density: 0,
      aspect: 0,
      offCenter: 0.5,
      avgSaturation: FEATURE_NEUTRAL.saturation,
      avgLightness: FEATURE_NEUTRAL.lightness,
      paletteSpread: 0,
    };
  }

  const bboxWidth = Math.max(1, maxX - minX + 1);
  const bboxHeight = Math.max(1, maxY - minY + 1);
  const bboxArea = bboxWidth * bboxHeight;
  const dominant = Math.max(attackCount, magicCount, defenseCount);
  const second = [...trendKeys.map((key) => ({ key, count: { attack: attackCount, magic: magicCount, defense: defenseCount }[key] }))].sort(
    (left, right) => right.count - left.count,
  )[1]?.count ?? 0;
  const trendRatio = clamp((dominant - second) / filledPixels, 0, 1);

  let trend: ColorTrend = "balanced";
  if (dominant === attackCount) trend = "attack";
  if (dominant === magicCount) trend = "magic";
  if (dominant === defenseCount) trend = "defense";

  return {
    trend,
    trendRatio,
    filledPixels,
    attackCount,
    magicCount,
    defenseCount,
    density: clamp(filledPixels / bboxArea, 0, 1),
    aspect: clamp(Math.log2(bboxWidth / bboxHeight), -1, 1),
    offCenter: clamp(
      distance(
        { x: sumX / filledPixels, y: sumY / filledPixels },
        { x: (imageData.width - 1) / 2, y: (imageData.height - 1) / 2 },
      ) / Math.max(1, Math.hypot(imageData.width, imageData.height) / 2),
      0,
      1,
    ),
    avgSaturation: saturationSum / filledPixels,
    avgLightness: lightnessSum / filledPixels,
    paletteSpread: clamp((paletteBins.size - 1) / 5, 0, 1),
  };
}

function calculateStrokeMetrics(drawing: DrawingData): StrokeMetrics {
  let totalLineLength = 0;
  let thickLineLength = 0;
  let axisAlignedLength = 0;
  let angleDeltaSum = 0;
  let angleDeltaWeight = 0;
  let straightnessSum = 0;
  let straightnessWeight = 0;
  let fillPixels = 0;
  let lineInkEstimate = 0;

  for (const layer of drawing.layers) {
    for (const stroke of layer.strokes) {
      if (stroke.tool === "eraser") continue;
      if (stroke.tool === "fill") {
        fillPixels += stroke.fillSpans?.reduce((sum, span) => sum + Math.max(0, span.x2 - span.x1 + 1), 0) ?? 0;
        continue;
      }
      if (stroke.points.length < 2) continue;

      let pathLength = 0;
      let previousAngle: number | null = null;

      for (let i = 1; i < stroke.points.length; i += 1) {
        const start = stroke.points[i - 1];
        const end = stroke.points[i];
        const segmentLength = distance(start, end);
        if (segmentLength <= 0) continue;

        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        pathLength += segmentLength;
        totalLineLength += segmentLength;
        lineInkEstimate += segmentLength * stroke.size;
        if (stroke.size >= 8) thickLineLength += segmentLength;
        if (distanceToAxis(angle) <= Math.PI / 9) axisAlignedLength += segmentLength;
        if (previousAngle !== null) {
          angleDeltaSum += Math.min(normalizeAngleDelta(angle, previousAngle), Math.PI / 2) * segmentLength;
          angleDeltaWeight += segmentLength;
        }
        previousAngle = angle;
      }

      if (pathLength > 0) {
        straightnessSum += clamp(distance(stroke.points[0], stroke.points[stroke.points.length - 1]) / pathLength, 0, 1) * pathLength;
        straightnessWeight += pathLength;
      }
    }
  }

  if (totalLineLength === 0) {
    return {
      curvature: FEATURE_NEUTRAL.curvature,
      stability: FEATURE_NEUTRAL.stability,
      thickRatio: FEATURE_NEUTRAL.thickRatio,
      fillRatio: FEATURE_NEUTRAL.fillRatio,
    };
  }

  const averageAngleDelta = angleDeltaWeight > 0 ? angleDeltaSum / angleDeltaWeight : 0;
  const angleCurvature = clamp(averageAngleDelta / (Math.PI / 2), 0, 1);
  const averageStraightness = straightnessWeight > 0 ? straightnessSum / straightnessWeight : 1;
  const averageLineWidth = lineInkEstimate / totalLineLength;

  return {
    curvature: clamp((angleCurvature + (1 - averageStraightness)) * 0.5, 0, 1),
    stability: clamp(axisAlignedLength / totalLineLength, 0, 1),
    thickRatio: clamp(thickLineLength / totalLineLength, 0, 1),
    fillRatio: clamp(fillPixels / (fillPixels + totalLineLength * averageLineWidth), 0, 1),
  };
}

const normalizeFeature = (value: number, neutral: number) => clamp((value - neutral) * 2, -1, 1);

function normalizeFeatures(trendInfo: TrendInfo, strokeMetrics: StrokeMetrics): DrawingFeatures {
  return {
    curvature: normalizeFeature(strokeMetrics.curvature, FEATURE_NEUTRAL.curvature),
    stability: normalizeFeature(strokeMetrics.stability, FEATURE_NEUTRAL.stability),
    density: normalizeFeature(trendInfo.density, FEATURE_NEUTRAL.density),
    aspect: trendInfo.aspect,
    offCenter: trendInfo.offCenter,
    saturation: normalizeFeature(trendInfo.avgSaturation, FEATURE_NEUTRAL.saturation),
    lightness: normalizeFeature(trendInfo.avgLightness, FEATURE_NEUTRAL.lightness),
    paletteSpread: trendInfo.paletteSpread,
    fillRatio: normalizeFeature(strokeMetrics.fillRatio, FEATURE_NEUTRAL.fillRatio),
    thickRatio: normalizeFeature(strokeMetrics.thickRatio, FEATURE_NEUTRAL.thickRatio),
  };
}

export const BASE_STATS: Record<ColorTrend, BaseStatProfile> = {
  balanced: { hp: 300, pp: 65, attack: 120, defense: 110, speed: 6, evasion: 0.01 },
  attack: { hp: 290, pp: 50, attack: 199, defense: 100, speed: 6, evasion: 0.01 },
  magic: { hp: 290, pp: 90, attack: 100, defense: 100, speed: 7, evasion: 0.01 },
  defense: { hp: 310, pp: 50, attack: 85, defense: 150, speed: 5, evasion: 0.01 },
};

function blendBaseStats(trendInfo: TrendInfo): { base: BaseStatProfile; weights: DrawingWeights; purity: number } {
  if (trendInfo.filledPixels === 0) {
    return {
      base: { ...BASE_STATS.balanced },
      weights: EMPTY_WEIGHTS,
      purity: 0,
    };
  }

  const weights: DrawingWeights = {
    attack: trendInfo.attackCount / trendInfo.filledPixels,
    magic: trendInfo.magicCount / trendInfo.filledPixels,
    defense: trendInfo.defenseCount / trendInfo.filledPixels,
  };
  const purity = trendInfo.trendRatio;
  const blendAmount = 0.5 + 0.5 * purity;
  const blended = statKeys.reduce((stats, stat) => {
    stats[stat] = trendKeys.reduce((sum, trend) => sum + weights[trend] * BASE_STATS[trend][stat], 0);
    return stats;
  }, emptyBaseStats());

  const base = statKeys.reduce((stats, stat) => {
    stats[stat] = lerp(BASE_STATS.balanced[stat], blended[stat], blendAmount);
    return stats;
  }, emptyBaseStats());

  return { base, weights, purity };
}

function computeAxes(features: DrawingFeatures): DrawingAxes {
  return {
    sA: clamp(
      AXIS_WEIGHTS.attackVsPp.curvature * features.curvature +
        AXIS_WEIGHTS.attackVsPp.saturation * features.saturation +
        AXIS_WEIGHTS.attackVsPp.paletteSpread * features.paletteSpread +
        AXIS_WEIGHTS.attackVsPp.thickRatio * features.thickRatio,
      -1,
      1,
    ),
    sB: clamp(
      AXIS_WEIGHTS.defenseVsHp.stability * features.stability +
        AXIS_WEIGHTS.defenseVsHp.aspect * features.aspect +
        AXIS_WEIGHTS.defenseVsHp.thickRatio * features.thickRatio +
        AXIS_WEIGHTS.defenseVsHp.fillRatio * features.fillRatio +
        AXIS_WEIGHTS.defenseVsHp.density * features.density,
      -1,
      1,
    ),
    sC: clamp(
      AXIS_WEIGHTS.speedVsEvasion.curvature * features.curvature +
        AXIS_WEIGHTS.speedVsEvasion.offCenter * (features.offCenter * 2 - 1) +
        AXIS_WEIGHTS.speedVsEvasion.density * features.density +
        AXIS_WEIGHTS.speedVsEvasion.lightness * features.lightness,
      -1,
      1,
    ),
  };
}

export function deriveStatsFromBase(base: BaseStatProfile, axes: DrawingAxes): CharacterStats {
  const attackFactor = 1 + AXIS_VARIANCE.attackPp * clamp(axes.sA, -1, 1);
  const defenseFactor = 1 + AXIS_VARIANCE.defense * clamp(axes.sB, -1, 1);
  const defense = Math.max(1, Math.round(base.defense * defenseFactor));
  const targetEffectiveHp = base.hp * (DEFENSE_SCALE + base.defense) / DEFENSE_SCALE;
  const hp = Math.max(1, Math.round(targetEffectiveHp * DEFENSE_SCALE / (DEFENSE_SCALE + defense)));
  const pp = Math.max(1, Math.round(base.pp * (1 - AXIS_VARIANCE.attackPp * clamp(axes.sA, -1, 1))));
  const attack = Math.max(1, Math.round(base.attack * attackFactor));
  const speed = Math.max(1, Math.round(base.speed - Math.round(clamp(axes.sC, -1, 1))));
  const evasion = clamp(
    base.evasion +
      AXIS_VARIANCE.evasionUp * Math.max(0, axes.sC) -
      AXIS_VARIANCE.evasionDown * Math.max(0, -axes.sC),
    0,
    0.05,
  );

  return {
    hp,
    maxHp: hp,
    pp,
    maxPp: pp,
    attack,
    defense,
    speed,
    evasion,
  };
}

export function analyzeDrawing(drawing: DrawingData, imageData: ImageDataLike): DrawingAnalysis {
  const trendInfo = detectTrend(imageData);
  const { base, weights, purity } = blendBaseStats(trendInfo);

  if (trendInfo.filledPixels === 0) {
    const axes = { sA: 0, sB: 0, sC: 0 };
    return {
      trend: "balanced",
      weights,
      purity,
      features: NEUTRAL_FEATURES,
      axes,
      base,
      stats: deriveStatsFromBase(base, axes),
    };
  }

  const features = normalizeFeatures(trendInfo, calculateStrokeMetrics(drawing));
  const axes = computeAxes(features);

  return {
    trend: trendInfo.trend,
    weights,
    purity,
    features,
    axes,
    base,
    stats: deriveStatsFromBase(base, axes),
  };
}

export function calculateStatsFromDrawing(drawing: DrawingData, imageData: ImageDataLike): CharacterStats {
  return analyzeDrawing(drawing, imageData).stats;
}

export function detectCharacterType(imageData: ImageDataLike): ColorTrend {
  return detectTrend(imageData).trend;
}
