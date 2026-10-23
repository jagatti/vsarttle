export type DanceJudgment = "PERFECT" | "GREAT" | "GOOD" | "BAD" | "MISS";
export type DanceMode = "recovery" | "normal" | "multiplier";
export type DancePhase = "a" | "c" | "b" | "last";
export type DanceKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "X";

export const DANCE_JUDGMENT_POINTS: Record<DanceJudgment, number> = {
  PERFECT: 13,
  GREAT: 10,
  GOOD: 8,
  BAD: 5,
  MISS: -3,
};

export const DANCE_PHASE_LABELS: Record<DancePhase, string> = {
  a: "オープニング — 全員ダンス",
  c: "センターダンス",
  b: "バックダンス",
  last: "FINAL DANCE",
};

const DANCE_KEYS: DanceKey[] = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

export const DANCE_MODES = ["recovery", "normal", "multiplier"] as const;
export const DANCE_ROUND_DURATION = Math.round(3000 / 1.1);
export const DANCE_ROUND_GRACE = 300;
export type DanceRound = {
  sequences: Record<DanceMode, DanceKey[]>;
  mode: DanceMode | null;
  index: number;
  startedAt: number;
  judgment: DanceJudgment | null;
};

export function createDanceRound(stars: 3 | 4 | 5, startedAt: number, random = Math.random): DanceRound {
  const sequences = Object.fromEntries(DANCE_MODES.map((mode) => [mode, createDanceSequence(mode, stars, random)])) as DanceRound["sequences"];
  const first = Math.floor(random() * DANCE_KEYS.length);
  DANCE_MODES.forEach((mode, index) => {
    sequences[mode][0] = DANCE_KEYS[(first + index) % DANCE_KEYS.length];
    if (stars === 5 && mode !== "recovery" && !sequences[mode].includes("X")) {
      sequences[mode][1] = "X";
    }
  });
  return { sequences, mode: null, index: 0, startedAt, judgment: null };
}

export function getDanceRoundProgress(round: DanceRound, now: number): number {
  return Math.min(1, Math.max(0, (now - round.startedAt) / DANCE_ROUND_DURATION));
}

export function expireDanceRound(round: DanceRound, now: number): DanceRound {
  if (round.judgment || now - round.startedAt <= DANCE_ROUND_DURATION + DANCE_ROUND_GRACE) return round;
  return { ...round, mode: round.mode ?? "normal", judgment: "MISS" };
}

export function inputDanceRound(round: DanceRound, key: DanceKey, now: number): DanceRound {
  const current = expireDanceRound(round, now);
  if (current.judgment) return current;
  const mode = current.mode ?? DANCE_MODES.find((row) => current.sequences[row][0] === key);
  if (!mode) return current;
  if (current.sequences[mode][current.index] !== key) {
    return { ...current, mode, judgment: "BAD" };
  }
  const index = current.index + 1;
  return {
    ...current,
    mode,
    index,
    judgment: index === current.sequences[mode].length
      ? judgeDanceTiming(now - current.startedAt - DANCE_ROUND_DURATION)
      : null,
  };
}

export function judgeDanceTiming(diffMs: number): DanceJudgment {
  const diff = Math.abs(diffMs);
  if (diff <= 22) return "PERFECT";
  if (diff <= 70) return "GREAT";
  if (diff <= 115) return "GOOD";
  return "BAD";
}

export function getDanceStamina(maxHp: number): number {
  return Math.ceil(Math.max(0, maxHp) / 5);
}

export function getDanceRecovery(maxPp: number): number {
  return 10 + Math.ceil(Math.max(0, maxPp) / 10);
}

export function getDanceGoal(stars: 3 | 4 | 5): number {
  return stars === 5 ? 540 : 304;
}

export function getDanceFeverLimit(stars: 3 | 4 | 5): number {
  return stars === 5 ? 8 : 4;
}

export function canActivateDanceFever(streak: number, remainingUses: number): boolean {
  return streak >= 2 || remainingUses > 0;
}

export function getDanceSequenceLength(mode: DanceMode, stars: 3 | 4 | 5): number {
  if (mode === "recovery") return 2;
  const level = stars - 2;
  return mode === "normal" ? 3 + 2 * level : 4 + 2 * level;
}

export function createDanceSequence(
  mode: DanceMode,
  stars: 3 | 4 | 5,
  random: () => number = Math.random,
): DanceKey[] {
  const length = getDanceSequenceLength(mode, stars);
  const sequence = Array.from({ length }, (_, index) => {
    if (index === 0 && mode === "recovery") return DANCE_KEYS[Math.floor(random() * DANCE_KEYS.length)]!;
    if (index === length - 1 && mode === "recovery") return "X";
    return DANCE_KEYS[Math.floor(random() * DANCE_KEYS.length)]!;
  });
  if (stars === 5 && mode !== "recovery") {
    const xCount = random() < 0.5 ? 1 : 2;
    const availableIndexes = sequence.map((_, index) => index);
    for (let index = availableIndexes.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [availableIndexes[index], availableIndexes[swapIndex]] = [availableIndexes[swapIndex]!, availableIndexes[index]!];
    }
    availableIndexes.slice(0, xCount).forEach((index) => { sequence[index] = "X"; });
  }
  return sequence;
}

export function getDanceTargetTime(startTime: number, sequenceIndex: number): number {
  const first = Math.round(3000 / 1.1);
  const interval = Math.round(1400 / 1.1);
  return startTime + first + sequenceIndex * interval;
}

export function getDanceCpuJudgment(random: () => number = Math.random, boss = false): DanceJudgment {
  const normalWeights = [20, 30, 28, 12, 10];
  const bossWeights = [32, 35, 22, 7, 4];
  const weights = boss ? bossWeights : normalWeights;
  let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
  const judgments: DanceJudgment[] = ["PERFECT", "GREAT", "GOOD", "BAD", "MISS"];
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index]!;
    if (roll < 0) return judgments[index]!;
  }
  return "MISS";
}

export function getDanceCpuMode(stamina: number, streak: number, random: () => number = Math.random): DanceMode {
  if (stamina < 10) return random() < 0.5 ? "recovery" : "normal";
  if (streak >= 2 && random() < 0.7) return "multiplier";
  return random() < 0.3 ? "recovery" : "normal";
}

export function getDanceActionScore(judgments: DanceJudgment[], mode: DanceMode): number {
  const base = judgments.reduce((sum, judgment) => sum + DANCE_JUDGMENT_POINTS[judgment], 0);
  return mode === "multiplier" ? base * 1.2 : base;
}

export function getDanceDancers(
  phase: DancePhase,
  teamSize: number,
  isRedTeam: boolean,
  centerTeam: "red" | "blue" = "red",
): number {
  if (phase === "c") return 1;
  if (phase === "last") {
    if ((isRedTeam ? "red" : "blue") === centerTeam) return 1;
    return teamSize === 1 ? 1 : teamSize - 1;
  }
  if (phase === "a") return teamSize;
  if (teamSize === 1) return isRedTeam ? 0 : 1;
  return teamSize - 1;
}
