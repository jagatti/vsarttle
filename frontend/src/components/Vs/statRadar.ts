import type { CharacterStats } from "@/types/game";

export type RadarStatKey = "hp" | "pp" | "attack" | "defense" | "speed" | "evasion";

export interface RadarBaseStats {
  hp: number;
  pp: number;
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
}

export interface RadarVertex {
  key: RadarStatKey;
  label: string;
  angle: number;
  ratio: number;
  radius: number;
  x: number;
  y: number;
  value: number;
  baseValue: number;
  delta: number;
}

const RATIO_MIN = 0.88;
const RATIO_MAX = 1.12;
const RADIUS_MIN = 0.35;
const RADIUS_MAX = 1;
const SPEED_RATIO_PER_POINT = 0.12;
const EVASION_RATIO_PER_POINT = 0.12 / 0.04;

export const BASE_RADIUS = 0.675;

export const RADAR_STAT_ORDER: readonly RadarStatKey[] = ["hp", "pp", "attack", "defense", "speed", "evasion"];

export const RADAR_STAT_LABELS: Record<RadarStatKey, string> = {
  hp: "HP",
  pp: "PP",
  attack: "攻撃",
  defense: "防御",
  speed: "速度",
  evasion: "回避",
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function getRadarComparableRatio(key: RadarStatKey, stats: CharacterStats, base: RadarBaseStats): number {
  if (key === "speed") {
    return 1 + (stats.speed - base.speed) * SPEED_RATIO_PER_POINT;
  }
  if (key === "evasion") {
    return 1 + (stats.evasion - base.evasion) * EVASION_RATIO_PER_POINT;
  }
  return stats[key] / Math.max(1, base[key]);
}

export function mapRadarRatioToRadius(ratio: number): number {
  const clamped = clamp(ratio, RATIO_MIN, RATIO_MAX);
  return RADIUS_MIN + ((clamped - RATIO_MIN) / (RATIO_MAX - RATIO_MIN)) * (RADIUS_MAX - RADIUS_MIN);
}

export function getMostDivergentRadarStatKey(stats: CharacterStats, base: RadarBaseStats): RadarStatKey {
  return RADAR_STAT_ORDER.reduce((best, key) => {
    const deviation = Math.abs(getRadarComparableRatio(key, stats, base) - 1);
    const bestDeviation = Math.abs(getRadarComparableRatio(best, stats, base) - 1);
    return deviation > bestDeviation ? key : best;
  }, RADAR_STAT_ORDER[0]);
}

export function buildRadarVertices(
  stats: CharacterStats,
  base: RadarBaseStats,
  outerRadius: number,
  centerX = outerRadius,
  centerY = outerRadius,
): RadarVertex[] {
  return RADAR_STAT_ORDER.map((key, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / RADAR_STAT_ORDER.length;
    const ratio = getRadarComparableRatio(key, stats, base);
    const radius = mapRadarRatioToRadius(ratio);
    const px = radius * outerRadius;
    return {
      key,
      label: RADAR_STAT_LABELS[key],
      angle,
      ratio,
      radius,
      x: centerX + Math.cos(angle) * px,
      y: centerY + Math.sin(angle) * px,
      value: stats[key],
      baseValue: base[key],
      delta: stats[key] - base[key],
    };
  });
}

export function buildRadarPolygonPoints(vertices: readonly Pick<RadarVertex, "x" | "y">[]): string {
  return vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(" ");
}

export function buildBaseRadarVertices(
  outerRadius: number,
  centerX = outerRadius,
  centerY = outerRadius,
  normalizedRadius = BASE_RADIUS,
): { x: number; y: number }[] {
  return RADAR_STAT_ORDER.map((_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / RADAR_STAT_ORDER.length;
    const px = normalizedRadius * outerRadius;
    return {
      x: centerX + Math.cos(angle) * px,
      y: centerY + Math.sin(angle) * px,
    };
  });
}
