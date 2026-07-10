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

// Type-specific stat ranges: each type guarantees its character's identity
const STAT_RANGES: Record<ColorTrend, {
  hp: [number, number];
  pp: [number, number];
  attack: [number, number];
  defense: [number, number];
  speed: [number, number];
  evasion: [number, number];
}> = {
  attack:   { hp: [30, 180],   pp: [30, 60],   attack: [120, 199], defense: [50, 110],  speed: [5, 9], evasion: [0.03, 0.07] },
  defense:  { hp: [150, 300],  pp: [40, 80],   attack: [50, 110],  defense: [100, 149], speed: [1, 5], evasion: [0.03, 0.05] },
  magic:    { hp: [30, 150],   pp: [60, 99],   attack: [50, 100],  defense: [50, 100],  speed: [5, 9], evasion: [0.06, 0.1]  },
  balanced: { hp: [80, 220],   pp: [40, 80],   attack: [80, 150],  defense: [80, 120],  speed: [3, 7], evasion: [0.04, 0.07] },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Pull score toward the high end of the range (characteristic "strong" stat for this type)
const pushHigh = (score: number, trendRatio: number) => clamp(score + (1 - score) * trendRatio * 0.7, 0, 1);
// Pull score toward the low end of the range (characteristic "weak" stat for this type)
const pushLow = (score: number, trendRatio: number) => clamp(score * (1 - trendRatio * 0.7), 0, 1);

export function calculateStatsFromDrawing(drawing: DrawingData, imageData: ImageDataLike): CharacterStats {
  const trendInfo = detectTrend(imageData);
  const strokeMetrics = calculateStrokeMetrics(drawing);
  const coverage = imageData.width * imageData.height > 0 ? trendInfo.filledPixels / (imageData.width * imageData.height) : 0;
  const detailScore = clamp((trendInfo.uniqueColors / 25) * 0.4 + (strokeMetrics.strokeDistance / 5000) * 0.6, 0, 1);
  const volumeScore = clamp(coverage * 2.2 + strokeMetrics.avgStrokeSize / 40, 0, 1);

  // Base score mapping follows existing tendencies:
  // attack/speed → volume-heavy; pp/evasion → detail-heavy; defense → both equally
  const baseHp = volumeScore;
  const basePp = detailScore;
  const baseAttack = volumeScore;
  const baseDefense = detailScore * 0.5 + volumeScore * 0.5;
  const baseSpeed = volumeScore;
  const baseEvasion = detailScore;

  const tR = trendInfo.trendRatio;
  let hpScore: number;
  let ppScore: number;
  let attackScore: number;
  let defenseScore: number;
  let speedScore: number;
  let evasionScore: number;

  if (trendInfo.trend === "attack") {
    // attack型: HP・PP低め、攻撃力・速さ高め
    hpScore      = pushLow(baseHp, tR);
    ppScore      = pushLow(basePp, tR);
    attackScore  = pushHigh(baseAttack, tR);
    defenseScore = pushLow(baseDefense, tR);
    speedScore   = pushHigh(baseSpeed, tR);
    evasionScore = baseEvasion;
  } else if (trendInfo.trend === "defense") {
    // defense型: 攻撃力・回避低め、HP・防御力高め
    hpScore      = pushHigh(baseHp, tR);
    ppScore      = basePp;
    attackScore  = pushLow(baseAttack, tR);
    defenseScore = pushHigh(baseDefense, tR);
    speedScore   = pushLow(baseSpeed, tR);
    evasionScore = pushLow(baseEvasion, tR);
  } else if (trendInfo.trend === "magic") {
    // magic型: 攻撃力・防御力低め、PP・速さ・回避高め
    hpScore      = pushLow(baseHp, tR);
    ppScore      = pushHigh(basePp, tR);
    attackScore  = pushLow(baseAttack, tR);
    defenseScore = pushLow(baseDefense, tR);
    speedScore   = pushHigh(baseSpeed, tR);
    evasionScore = pushHigh(baseEvasion, tR);
  } else {
    // balanced型: 補正なし — 描き方の差が最も出やすい
    hpScore      = baseHp;
    ppScore      = basePp;
    attackScore  = baseAttack;
    defenseScore = baseDefense;
    speedScore   = baseSpeed;
    evasionScore = baseEvasion;
  }

  const ranges = STAT_RANGES[trendInfo.trend];

  const hp      = clamp(Math.round(lerp(ranges.hp[0],      ranges.hp[1],      hpScore)),      ranges.hp[0],      ranges.hp[1]);
  const pp      = clamp(Math.round(lerp(ranges.pp[0],      ranges.pp[1],      ppScore)),      ranges.pp[0],      ranges.pp[1]);
  const attack  = clamp(Math.round(lerp(ranges.attack[0],  ranges.attack[1],  attackScore)),  ranges.attack[0],  ranges.attack[1]);
  const defense = clamp(Math.round(lerp(ranges.defense[0], ranges.defense[1], defenseScore)), ranges.defense[0], ranges.defense[1]);
  const speed   = clamp(Math.round(lerp(ranges.speed[0],   ranges.speed[1],   speedScore)),   ranges.speed[0],   ranges.speed[1]);
  const evasion = clamp(Number(lerp(ranges.evasion[0], ranges.evasion[1], evasionScore).toFixed(3)), ranges.evasion[0], ranges.evasion[1]);

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

export function detectCharacterType(imageData: ImageDataLike): ColorTrend {
  return detectTrend(imageData).trend;
}
