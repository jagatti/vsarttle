import type { CharacterStats } from "@/types/game";

export type RadarStatKey = "hp" | "pp" | "attack" | "defense" | "speed" | "evasion";
export type RadarAdvantage = "up" | "down" | "even";

export interface RadarVertex {
  key: RadarStatKey;
  label: string;
  angle: number;
  radius: number;
  x: number;
  y: number;
  value: number;
}

export const RADAR_STAT_ORDER: readonly RadarStatKey[] = ["hp", "pp", "attack", "defense", "speed", "evasion"];

export const RADAR_STAT_LABELS: Record<RadarStatKey, string> = {
  hp: "HP",
  pp: "PP",
  attack: "攻撃",
  defense: "防御",
  speed: "速度",
  evasion: "回避",
};

export const RADAR_ABSOLUTE_RANGE: Record<RadarStatKey, { min: number; max: number }> = {
  hp: { min: 240, max: 360 },
  pp: { min: 40, max: 105 },
  attack: { min: 60, max: 230 },
  defense: { min: 80, max: 175 },
  speed: { min: 3, max: 10 },
  evasion: { min: 0, max: 0.1 },
};

export const RADIUS_MIN = 0.18;
export const RADIUS_MAX = 1;
export const ADVANTAGE_THRESHOLD = 0.06;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function mapAbsoluteToRadius(key: RadarStatKey, value: number): number {
  const range = RADAR_ABSOLUTE_RANGE[key];
  const clamped = clamp(value, range.min, range.max);
  if (range.max <= range.min) {
    return RADIUS_MIN;
  }
  return RADIUS_MIN + ((clamped - range.min) / (range.max - range.min)) * (RADIUS_MAX - RADIUS_MIN);
}

export function buildRadarVertices(
  stats: CharacterStats,
  outerRadius: number,
  centerX = outerRadius,
  centerY = outerRadius,
): RadarVertex[] {
  return RADAR_STAT_ORDER.map((key, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / RADAR_STAT_ORDER.length;
    const radius = mapAbsoluteToRadius(key, stats[key]);
    const px = radius * outerRadius;
    return {
      key,
      label: RADAR_STAT_LABELS[key],
      angle,
      radius,
      x: centerX + Math.cos(angle) * px,
      y: centerY + Math.sin(angle) * px,
      value: stats[key],
    };
  });
}

export function buildRadarPolygonPoints(vertices: readonly Pick<RadarVertex, "x" | "y">[]): string {
  return vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(" ");
}

export function compareRadarStats(
  mine: CharacterStats,
  theirs: CharacterStats,
): Record<RadarStatKey, RadarAdvantage> {
  const result: Record<RadarStatKey, RadarAdvantage> = {
    hp: "even",
    pp: "even",
    attack: "even",
    defense: "even",
    speed: "even",
    evasion: "even",
  };

  for (const key of RADAR_STAT_ORDER) {
    const diff = mapAbsoluteToRadius(key, mine[key]) - mapAbsoluteToRadius(key, theirs[key]);
    result[key] = diff >= ADVANTAGE_THRESHOLD ? "up" : diff <= -ADVANTAGE_THRESHOLD ? "down" : "even";
  }

  return result;
}

export function getStrongestAdvantageKey(mine: CharacterStats, theirs: CharacterStats): RadarStatKey | null {
  let bestKey: RadarStatKey | null = null;
  let bestDiff = ADVANTAGE_THRESHOLD;

  for (const key of RADAR_STAT_ORDER) {
    const diff = mapAbsoluteToRadius(key, mine[key]) - mapAbsoluteToRadius(key, theirs[key]);
    if (diff > bestDiff) {
      bestDiff = diff;
      bestKey = key;
    }
  }

  return bestKey;
}
