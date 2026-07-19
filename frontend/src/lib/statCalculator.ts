import type { CharacterStats, DrawingData } from "@/types/game";

interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type ColorTrend = "attack" | "magic" | "defense" | "balanced";

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

function calculateStrokeMetrics(drawing: DrawingData): { thickStrokeTravel: number; thinStrokeTravel: number } {
  let thickStrokeTravel = 0;
  let thinStrokeTravel = 0;

  for (const layer of drawing.layers) {
    for (const stroke of layer.strokes) {
      if (stroke.tool === "eraser") continue;
      const dotTravel = Math.max(1, stroke.size * 0.5);
      if (stroke.points.length < 2) {
        if (stroke.size >= 8) thickStrokeTravel += dotTravel;
        if (stroke.size <= 4) thinStrokeTravel += dotTravel;
        continue;
      }
      for (let i = 1; i < stroke.points.length; i += 1) {
        const segDistance = distance(stroke.points[i - 1], stroke.points[i]);
        if (stroke.size >= 8) thickStrokeTravel += segDistance;
        if (stroke.size <= 4) thinStrokeTravel += segDistance;
      }
    }
  }

  return {
    thickStrokeTravel,
    thinStrokeTravel,
  };
}

const BASE_STATS: Record<ColorTrend, {
  hp: number;
  pp: number;
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
}> = {
  balanced: { hp: 250, pp: 50, attack: 100, defense: 100, speed: 6, evasion: 0.01 },
  attack:   { hp: 300, pp: 50, attack: 199, defense: 100, speed: 6, evasion: 0.01 },
  magic:    { hp: 280, pp: 90, attack: 100, defense: 100, speed: 7, evasion: 0.01 },
  defense:  { hp: 360, pp: 50, attack: 80, defense: 160, speed: 5, evasion: 0.01 },
};

function calculateHpPpBonusRates(
  drawing: DrawingData,
  trendInfo: { uniqueColors: number },
): { hpBonusRate: number; ppBonusRate: number } {
  const { thickStrokeTravel, thinStrokeTravel } = calculateStrokeMetrics(drawing);
  const diagonal = Math.max(1, Math.hypot(drawing.canvas.width, drawing.canvas.height));
  const thickTravelScore = clamp((thickStrokeTravel / diagonal) / 3, 0, 1);
  const thinTravelScore = clamp((thinStrokeTravel / diagonal) / 3, 0, 1);
  const multiColorScore = clamp((trendInfo.uniqueColors - 1) / 12, 0, 1);
  const hpBonusRate = thickTravelScore * 0.1;
  const ppBonusRate = clamp(thinTravelScore * 0.6 + multiColorScore * 0.4, 0, 1) * 0.1;
  return { hpBonusRate, ppBonusRate };
}

export function calculateStatsFromDrawing(drawing: DrawingData, imageData: ImageDataLike): CharacterStats {
  const trendInfo = detectTrend(imageData);
  const base = BASE_STATS[trendInfo.trend];
  const { hpBonusRate, ppBonusRate } = calculateHpPpBonusRates(drawing, trendInfo);
  const hp = Math.round(base.hp * (1 + hpBonusRate));
  const pp = Math.round(base.pp * (1 + ppBonusRate));

  return {
    hp,
    maxHp: hp,
    pp,
    maxPp: pp,
    attack: base.attack,
    defense: base.defense,
    speed: base.speed,
    evasion: base.evasion,
  };
}

export function detectCharacterType(imageData: ImageDataLike): ColorTrend {
  return detectTrend(imageData).trend;
}
