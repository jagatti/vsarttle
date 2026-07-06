import type { CharacterStats, DrawingData } from "@/types/game";

interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

type ColorTrend = "attack" | "magic" | "defense" | "balanced";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
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

function detectTrend(imageData: ImageDataLike): { trend: ColorTrend; trendRatio: number; uniqueColors: number; filledPixels: number } {
  let filledPixels = 0;
  let attackCount = 0;
  let magicCount = 0;
  let defenseCount = 0;
  const colorSet = new Set<string>();

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    const a = imageData.data[i + 3];
    if (a < 8) continue;
    filledPixels += 1;
    colorSet.add(`${r},${g},${b}`);

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 20 || max < 70) {
      defenseCount += 1;
      continue;
    }

    const hue = toHue(r, g, b);
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

  const totals = [attackCount, magicCount, defenseCount].sort((a, b) => b - a);
  const dominant = totals[0] ?? 0;
  const second = totals[1] ?? 0;
  const trendRatio = filledPixels > 0 ? clamp((dominant - second) / filledPixels, 0, 1) : 0;

  if (dominant === 0) {
    return { trend: "balanced", trendRatio: 0, uniqueColors: colorSet.size, filledPixels };
  }

  let trend: ColorTrend = "balanced";
  if (dominant === attackCount) trend = "attack";
  if (dominant === magicCount) trend = "magic";
  if (dominant === defenseCount) trend = "defense";

  return { trend, trendRatio, uniqueColors: colorSet.size, filledPixels };
}

function calculateStrokeMetrics(drawing: DrawingData): { strokeDistance: number; avgStrokeSize: number } {
  let strokeDistance = 0;
  let strokeSizeTotal = 0;
  let strokeCount = 0;

  for (const layer of drawing.layers) {
    for (const stroke of layer.strokes) {
      strokeCount += 1;
      strokeSizeTotal += stroke.size;
      for (let i = 1; i < stroke.points.length; i += 1) {
        strokeDistance += distance(stroke.points[i - 1], stroke.points[i]);
      }
    }
  }

  return {
    strokeDistance,
    avgStrokeSize: strokeCount > 0 ? strokeSizeTotal / strokeCount : 1,
  };
}

export function calculateStatsFromDrawing(drawing: DrawingData, imageData: ImageDataLike): CharacterStats {
  const trendInfo = detectTrend(imageData);
  const strokeMetrics = calculateStrokeMetrics(drawing);
  const coverage = imageData.width * imageData.height > 0 ? trendInfo.filledPixels / (imageData.width * imageData.height) : 0;
  const detailScore = clamp((trendInfo.uniqueColors / 25) * 0.4 + (strokeMetrics.strokeDistance / 5000) * 0.6, 0, 1);
  const volumeScore = clamp(coverage * 2.2 + strokeMetrics.avgStrokeSize / 40, 0, 1);
  const bias = trendInfo.trendRatio * 0.8;

  let hp = 130 + volumeScore * 150;
  let pp = 25 + detailScore * 25;
  let attack = 90 + volumeScore * 110;
  let defense = 80 + (1 - detailScore * 0.4) * 120;
  let speed = 24 + detailScore * 22;
  let evasion = 0.035 + detailScore * 0.06;

  if (trendInfo.trend === "attack") {
    attack += 55 * bias;
    speed += 10 * bias;
    hp -= 50 * bias;
    pp -= 8 * bias;
    defense -= 35 * bias;
    evasion -= 0.015 * bias;
  } else if (trendInfo.trend === "magic") {
    pp += 16 * bias;
    evasion += 0.02 * bias;
    hp -= 35 * bias;
    attack -= 25 * bias;
    defense -= 28 * bias;
    speed -= 4 * bias;
  } else if (trendInfo.trend === "defense") {
    hp += 60 * bias;
    defense += 55 * bias;
    pp -= 10 * bias;
    attack -= 30 * bias;
    speed -= 7 * bias;
    evasion -= 0.01 * bias;
  }

  hp = clamp(Math.round(hp), 30, 300);
  pp = clamp(Math.round(pp), 20, 50);
  attack = clamp(Math.round(attack), 50, 200);
  defense = clamp(Math.round(defense), 50, 200);
  speed = clamp(Math.round(speed), 20, 50);
  evasion = clamp(Number(evasion.toFixed(3)), 0.03, 0.1);

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
