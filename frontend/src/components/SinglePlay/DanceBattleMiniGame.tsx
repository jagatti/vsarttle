"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CharacterImage } from "@/components/Battle/CharacterImage";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { getBossData } from "@/data/bosses";
import { SEED_GHOSTS } from "@/data/seed-ghosts";
import {
  createDanceSequence,
  addDanceGauge,
  applyDanceStaminaJudgment,
  DANCE_BAR_DURATION_MS,
  DANCE_FEVER_BAR_DURATION_MS,
  DANCE_FEVER_TRANSITION_DELAY_MS,
  DANCE_READY_DURATION_MS,
  DANCE_RESULT_DURATION_MS,
  DANCE_RESULT_SETTLE_MS,
  DANCE_SPECTATOR_READY_DURATION_MS,
  DANCE_PHASE_LABELS,
  getDanceActionScore,
  getDanceCpuJudgment,
  getDanceCpuMode,
  getDanceGaugePoints,
  getDanceGoal,
  getDanceFeverLimit,
  getDanceRecovery,
  getDanceRoundDurationMs,
  isDanceFeverAllowed,
  isDanceFinalKeyWindow,
  getDanceStamina,
  getDanceStaminaAfter,
  getDanceTargetTime,
  getDanceVisibleModes,
  judgeDanceTiming,
  resolveDanceProgression,
  type DanceJudgment,
  type DanceKey,
  type DanceMode,
  type DancePhase,
} from "@/lib/danceBattle";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { removeEdgeBackgroundPixels } from "@/lib/danceBattleImage";
import { resolveCharacterImageUrl } from "@/lib/imageUrl";
import { pickRandomGhostFromPool } from "@/lib/ghosts";
import type { GhostRecord } from "@/lib/persistenceTypes";
import { soundManager } from "@/lib/soundManager";
import { analyzeDrawing } from "@/lib/statCalculator";
import type { CharacterStats, CharacterType, DrawingData } from "@/types/game";

type DanceStage = "configure" | "drawing" | "loading" | "vs" | "playing" | "result";
type DanceMember = {
  id: string;
  nickname: string;
  image: string;
  stats: CharacterStats;
  characterType: CharacterType;
  boss: boolean;
};
type DanceAction = {
  mode: DanceMode;
  sequence: DanceKey[];
  judgments: DanceJudgment[];
  startedAt: number;
  targetAt: number;
  index: number;
  multiplied: boolean;
  fever: boolean;
};

type DanceLanes = Record<DanceMode, DanceKey[]>;

const KEY_LABELS: Record<DanceKey, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  X: "X",
};
const CIRCLED_NUMBERS = ["⓪", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
const DANCE_BGM = "/sounds/bgm/boss4_loop.mp3";
const FINAL_DANCE_BGM = "/sounds/bgm/boss5-3_loop.mp3";
const TEAM_COLORS = { red: "#d8564f", blue: "#4f8ac9" };

function randomBoss(): DanceMember {
  const floor = Math.floor(Math.random() * 5) + 1;
  const phase = floor === 5 && Math.random() < 0.35 ? 2 : 1;
  const boss = getBossData(floor, phase, "normal");
  return {
    id: `dance-boss-${floor}-${phase}-${Math.random()}`,
    nickname: boss.name,
    image: boss.imageUrl,
    stats: boss.stats,
    characterType: boss.characterType,
    boss: true,
  };
}

function ghostToMember(ghost: GhostRecord, id: string): DanceMember {
  return {
    id,
    nickname: ghost.nickname,
    image: ghost.drawingThumbnail,
    stats: ghost.stats,
    characterType: ghost.characterType,
    boss: false,
  };
}

function teamStamina(members: DanceMember[]) {
  return members.map((member) => getDanceStamina(member.stats.maxHp));
}

function createDanceLanes(stars: 3 | 4 | 5): DanceLanes {
  const starts: Partial<Record<Exclude<DanceMode, "recovery">, DanceKey>> = {
    normal: "ArrowDown",
    multiplier: "ArrowLeft",
  };
  return {
    recovery: createDanceSequence("recovery", stars, Math.random, starts),
    normal: createDanceSequence("normal", stars, Math.random, starts),
    multiplier: createDanceSequence("multiplier", stars, Math.random, starts),
  };
}

export function DanceBattleMiniGame(props: {
  onBack: () => void;
  playerProfile: { playerId: string; nickname: string };
}) {
  const [stage, setStage] = useState<DanceStage>("configure");
  const [stars, setStars] = useState<3 | 4 | 5>(3);
  const [teamSize, setTeamSize] = useState<1 | 2 | 3>(1);
  const [teams, setTeams] = useState<{ red: DanceMember[]; blue: DanceMember[] }>({ red: [], blue: [] });
  const [transparentImages, setTransparentImages] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<DancePhase>("a");
  const [lastStep, setLastStep] = useState<"center" | "backline">("center");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [redScore, setRedScore] = useState(0);
  const [blueScore, setBlueScore] = useState(0);
  const [redStamina, setRedStamina] = useState<number[]>([]);
  const [blueStamina, setBlueStamina] = useState<number[]>([]);
  const [redStreaks, setRedStreaks] = useState<number[]>([]);
  const [, setBlueStreaks] = useState<number[]>([]);
  const [redCenter, setRedCenter] = useState(0);
  const [blueCenter, setBlueCenter] = useState(0);
  const [centerBaseScores, setCenterBaseScores] = useState({ red: 0, blue: 0 });
  const [activeAction, setActiveAction] = useState<DanceAction | null>(null);
  const [lastJudgment, setLastJudgment] = useState<DanceJudgment | null>(null);
  const [lastJudgmentMode, setLastJudgmentMode] = useState<DanceMode | null>(null);
  const [lastJudgmentId, setLastJudgmentId] = useState(0);
  const [feverProgress, setFeverProgress] = useState<{ count: number; score: number } | null>(null);
  const [laneSequences, setLaneSequences] = useState<DanceLanes>(() => createDanceLanes(3));
  const [keysRevealed, setKeysRevealed] = useState(false);
  const [roundStartedAt, setRoundStartedAt] = useState(0);
  const [clock, setClock] = useState(0);
  const [staminaChange, setStaminaChange] = useState<number | null>(null);
  const [outcomeLabels, setOutcomeLabels] = useState<Record<string, { text: string; kind: string }>>({});
  const [scoreDelta, setScoreDelta] = useState<{ red: number; blue: number } | null>(null);
  const [scoreDeltaGauge, setScoreDeltaGauge] = useState<{ red: number; blue: number } | null>(null);
  const [scoreDeltaScaled, setScoreDeltaScaled] = useState(false);
  const [result, setResult] = useState<"red" | "blue" | null>(null);
  const [swapTeam, setSwapTeam] = useState<"red" | "blue" | null>(null);
  const redScoreRef = useRef(0);
  const blueScoreRef = useRef(0);
  const redStaminaRef = useRef<number[]>([]);
  const blueStaminaRef = useRef<number[]>([]);
  const redStreaksRef = useRef<number[]>([]);
  const blueStreaksRef = useRef<number[]>([]);
  const actionRef = useRef<DanceAction | null>(null);
  const phaseRef = useRef<DancePhase>("a");
  const centerTeamRef = useRef<"red" | "blue">("red");
  const centerUsedThirdRef = useRef(false);
  const advanceInputRef = useRef<(judgment: DanceJudgment) => void>(() => {});
  const autoResolveRef = useRef<() => void>(() => {});
  const deadlineRef = useRef<number | null>(null);
  const actionDeadlineRef = useRef<number | null>(null);
  const roundSettlingRef = useRef(false);
  const feverTransitionRef = useRef(false);
  const finalDanceBgmPlayedRef = useRef(false);

  const goal = getDanceGoal(stars);
  const playerIsBackline = centerTeamRef.current !== "red" || (teamSize > 1 && redCenter !== 0);
  const playerParticipates = phase === "a" ||
    (phase === "c" && centerTeamRef.current === "red" && redCenter === 0) ||
    (phase === "b" && playerIsBackline) ||
    (phase === "last" && lastStep === "center" && centerTeamRef.current === "red" && redCenter === 0) ||
    (phase === "last" && lastStep === "backline" && centerTeamRef.current === "blue");

  useEffect(() => {
    if (!teams.red.length) return;
    let cancelled = false;
    for (const member of [...teams.red, ...teams.blue]) {
      const image = new Image();
      image.onload = () => {
        if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
        try {
          const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return;
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          let transparentPixels = 0;
          for (let index = 3; index < pixels.data.length; index += 4) {
            if (pixels.data[index] !== 255) transparentPixels += 1;
          }
          if (transparentPixels > canvas.width * canvas.height * 0.01) return;
          removeEdgeBackgroundPixels(pixels.data, canvas.width, canvas.height);
          context.putImageData(pixels, 0, 0);
          if (!cancelled) setTransparentImages((current) => ({ ...current, [member.id]: canvas.toDataURL("image/png") }));
        } catch {
          return;
        }
      };
      image.src = resolveCharacterImageUrl(member.image);
    }
    return () => { cancelled = true; };
  }, [teams]);

  useEffect(() => {
    if (stage !== "playing") return;
    const startedAt = performance.now();
    setRoundStartedAt(startedAt);
    setLaneSequences(createDanceLanes(stars));
    setKeysRevealed(false);
    setLastJudgment(null);
    if (phase === "a" || phase === "c" || (phase === "last" && lastStep === "center")) {
      setOutcomeLabels({});
    }
    actionRef.current = null;
    roundSettlingRef.current = false;
    setActiveAction(null);
    const revealTimer = window.setTimeout(() => setKeysRevealed(true), 1200);
    deadlineRef.current = window.setTimeout(() => {
      if (!playerParticipates) {
        autoResolveRef.current();
        return;
      }
      if (!actionRef.current) {
        const missedAction: DanceAction = {
          mode: "normal",
          sequence: ["ArrowDown"],
          judgments: [],
          startedAt: startedAt + 1500,
          targetAt: getDanceTargetTime(startedAt + 1500, 0),
          index: 0,
          multiplied: false,
          fever: false,
        };
        actionRef.current = missedAction;
      }
      if (!actionRef.current || !actionRef.current.fever) advanceInputRef.current("MISS");
    }, getDanceRoundDurationMs(playerParticipates));
    return () => {
      window.clearTimeout(revealTimer);
      if (deadlineRef.current !== null) window.clearTimeout(deadlineRef.current);
    };
  }, [lastStep, phase, phaseIndex, playerParticipates, stage, stars]);

  useEffect(() => {
    if (stage !== "playing") return;
    let frame = 0;
    const tick = () => {
      setClock(performance.now());
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [stage]);

  const stopActiveAction = useCallback(() => {
    actionRef.current = null;
    setActiveAction(null);
  }, []);

  useEffect(() => () => soundManager.stopBgm(), []);

  useEffect(() => {
    if (stage === "playing") {
      if (phase === "last") finalDanceBgmPlayedRef.current = true;
      soundManager.playBgm(finalDanceBgmPlayedRef.current ? FINAL_DANCE_BGM : DANCE_BGM);
    }
    else if (stage === "vs") soundManager.playBgm(DANCE_BGM);
    else if (stage === "result" && result) {
      soundManager.stopBgm();
      soundManager.playSe(result === "red" ? "/sounds/se/win.mp3" : "/sounds/se/lose.mp3");
    }
  }, [phase, result, stage]);

  useEffect(() => {
    if (stage !== "vs" && stage !== "playing" && stage !== "result") return;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "vs") return;
    const timer = window.setTimeout(() => setStage("playing"), 3000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const createOpponent = useCallback(async (index: number): Promise<DanceMember> => {
    if (Math.random() < 0.2) return randomBoss();
    try {
      const response = await fetch(`/api/ghosts/random?excludePlayerId=${encodeURIComponent(props.playerProfile.playerId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("ghost fetch failed");
      const body = await response.json() as { ghost?: GhostRecord };
      if (!body.ghost) throw new Error("ghost missing");
      return ghostToMember(body.ghost, `dance-ghost-${index}`);
    } catch {
      const ghost = pickRandomGhostFromPool([], { random: () => Math.random() });
      const fallback = ghost.source === "seed" ? ghost : SEED_GHOSTS[index % SEED_GHOSTS.length]!;
      return ghostToMember(fallback, `dance-seed-${index}`);
    }
  }, [props.playerProfile.playerId]);

  const startDrawing = () => {
    soundManager.playSe("/sounds/se/button.mp3");
    setStage("drawing");
  };

  const finishDrawing = useCallback(async (payload: { drawing: DrawingData; imageData: ImageData }) => {
    setStage("loading");
    const analysis = analyzeDrawing(payload.drawing, payload.imageData);
    const player: DanceMember = {
      id: "dance-player",
      nickname: props.playerProfile.nickname,
      image: drawingToDataUrl(payload.drawing),
      stats: analysis.stats,
      characterType: analysis.trend,
      boss: false,
    };
    const npcCount = teamSize * 2 - 1;
    const opponents = await Promise.all(Array.from({ length: npcCount }, (_, index) => createOpponent(index)));
    const red = [player, ...opponents.slice(0, teamSize - 1)];
    const blue = opponents.slice(teamSize - 1);
    setTransparentImages({});
    setTeams({ red, blue });
    redStaminaRef.current = teamStamina(red);
    blueStaminaRef.current = teamStamina(blue);
    setRedStamina(redStaminaRef.current);
    setBlueStamina(blueStaminaRef.current);
    setPhase("a");
    phaseRef.current = "a";
    setPhaseIndex(0);
    setRedScore(0);
    setBlueScore(0);
    redScoreRef.current = 0;
    blueScoreRef.current = 0;
    setRedCenter(0);
    setBlueCenter(0);
    setCenterBaseScores({ red: 0, blue: 0 });
    centerTeamRef.current = "red";
    centerUsedThirdRef.current = false;
    finalDanceBgmPlayedRef.current = false;
    setLastStep("center");
    redStreaksRef.current = red.map(() => 0);
    blueStreaksRef.current = blue.map(() => 0);
    setRedStreaks(redStreaksRef.current);
    setBlueStreaks(blueStreaksRef.current);
    setResult(null);
    setStage("vs");
  }, [createOpponent, props.playerProfile.nickname, teamSize]);

  const setupNewAction = useCallback((mode: DanceMode, firstKey: DanceKey) => {
    if (stage !== "playing" || actionRef.current) return;
    const feverAllowed = isDanceFeverAllowed(phaseRef.current, lastStep, centerUsedThirdRef.current);
    const fever = mode === "multiplier" && (redStreaksRef.current[0] ?? 0) >= 2 && feverAllowed;
    const startedAt = roundStartedAt + DANCE_READY_DURATION_MS;
    const next: DanceAction = {
      mode,
      sequence: laneSequences[mode],
      judgments: [],
      startedAt,
      targetAt: getDanceTargetTime(startedAt, 0),
      index: firstKey === laneSequences[mode][0] ? 1 : 0,
      multiplied: mode === "multiplier",
      fever,
    };
    actionRef.current = next;
    setActiveAction(next);
    setLastJudgment(null);
    setLastJudgmentMode(null);
    setFeverProgress(null);
  }, [laneSequences, lastStep, roundStartedAt, stage]);

  const resolveCompletedAction = useCallback((mode: DanceMode, judgments: DanceJudgment[]) => {
    if (roundSettlingRef.current) return;
    roundSettlingRef.current = true;
    const currentPhase = phaseRef.current;
    const activeIndexes = (members: DanceMember[], side: "red" | "blue") => {
      const center = side === "red" ? redCenter : blueCenter;
      if (currentPhase === "last") {
        if (lastStep === "center") return side === centerTeamRef.current ? [center] : [];
        return side === centerTeamRef.current ? [] : members.map((_, index) => index);
      }
      if (currentPhase === "a") return members.map((_, index) => index);
      if (currentPhase === "c") return side === centerTeamRef.current ? [center] : [];
      return side === centerTeamRef.current
        ? members.map((_, index) => index).filter((index) => index !== center)
        : members.map((_, index) => index);
    };
    const redIndexes = activeIndexes(teams.red, "red");
    const blueIndexes = activeIndexes(teams.blue, "blue");
    const outcomes = (["red", "blue"] as const).flatMap((side) => {
      const members = teams[side];
      const indexes = side === "red" ? redIndexes : blueIndexes;
      return indexes.map((index) => {
        const member = members[index]!;
        const stamina = (side === "red" ? redStaminaRef.current : blueStaminaRef.current)[index] ?? 0;
        const streak = (side === "red" ? redStreaksRef.current : blueStreaksRef.current)[index] ?? 0;
        const isPlayer = side === "red" && index === 0 && playerParticipates;
        const actionMode = isPlayer ? mode : getDanceCpuMode(stamina, streak);
        const feverAllowed = isDanceFeverAllowed(currentPhase, lastStep, centerUsedThirdRef.current);
        const fever = actionMode === "multiplier" && streak >= 2 && feverAllowed;
        const actionJudgments = isPlayer
          ? judgments
          : (() => {
            const count = fever ? getDanceFeverLimit(stars) : 1;
            const rolls: DanceJudgment[] = [];
            for (let attempt = 0; attempt < count; attempt += 1) {
              const roll = applyDanceStaminaJudgment(
                getDanceCpuJudgment(Math.random, member.boss),
                stamina,
                actionMode,
              );
              rolls.push(roll);
              if (roll === "MISS") break;
            }
            return rolls;
          })();
        const normalizedJudgments = actionJudgments.map((judgment) =>
          applyDanceStaminaJudgment(judgment, stamina, actionMode));
        const base = actionMode === "recovery" && !normalizedJudgments.includes("MISS")
          ? 0
          : getDanceActionScore(normalizedJudgments, "normal");
        const successes = normalizedJudgments.filter((judgment) => judgment !== "MISS").length;
        return {
          id: member.id,
          side,
          index,
          member,
          mode: actionMode,
          judgments: normalizedJudgments,
          base,
          gauge: getDanceGaugePoints(base, actionMode),
          stamina: getDanceStaminaAfter(
            stamina,
            member.stats,
            actionMode,
            fever ? successes : 0,
            normalizedJudgments.includes("MISS"),
          ),
          fever,
        };
      });
    });
    const redOutcomes = outcomes.filter((outcome) => outcome.side === "red");
    const blueOutcomes = outcomes.filter((outcome) => outcome.side === "blue");
    const cpuOutcomes = outcomes.filter((outcome) => !(outcome.side === "red" && outcome.index === 0 && playerParticipates));
    if (cpuOutcomes.some((outcome) => outcome.mode === "recovery")) {
      soundManager.playSe("/sounds/se/charge.mp3");
    } else if (cpuOutcomes.some((outcome) =>
      outcome.judgments.some((judgment) => judgment === "BAD" || judgment === "MISS"))) {
      soundManager.playSe("/sounds/se/ng.mp3");
    }
    const getOutcomeLabel = (outcome: typeof outcomes[number], judgments = outcome.judgments) => {
      const score = outcome.mode === "recovery" ? 0 : getDanceActionScore(judgments, "normal");
      if (outcome.fever) {
        const count = judgments.filter((entry) => entry !== "MISS").length;
        const kind = count >= getDanceFeverLimit(stars)
          ? "fever-best"
          : count >= Math.ceil(getDanceFeverLimit(stars) / 2) ? "fever-middle" : "fever-low";
        return {
          kind,
          text: `🔥${CIRCLED_NUMBERS[Math.min(CIRCLED_NUMBERS.length - 1, count)]}${score}`,
        };
      }
      const last = judgments.at(-1) ?? "MISS";
      return { kind: last.toLowerCase(), text: `${last} ${score >= 0 ? "+" : ""}${score}` };
    };
    const cpuTargetAt = roundStartedAt +
      (playerParticipates ? DANCE_READY_DURATION_MS : DANCE_SPECTATOR_READY_DURATION_MS) +
      DANCE_BAR_DURATION_MS;
    let latestCpuFinishAt = cpuTargetAt + DANCE_RESULT_SETTLE_MS;
    const playerOutcomes = outcomes.filter((outcome) =>
      outcome.side === "red" && outcome.index === 0 && playerParticipates);
    setOutcomeLabels((current) => ({
      ...current,
      ...Object.fromEntries(playerOutcomes.map((outcome) => [outcome.id, getOutcomeLabel(outcome)])),
    }));
    cpuOutcomes.forEach((outcome) => {
      if (outcome.fever) {
        outcome.judgments.forEach((_, index) => {
          const partial = outcome.judgments.slice(0, index + 1);
          window.setTimeout(() => {
            setOutcomeLabels((current) => ({ ...current, [outcome.id]: getOutcomeLabel(outcome, partial) }));
          }, Math.max(0, cpuTargetAt + index * DANCE_FEVER_BAR_DURATION_MS - performance.now()));
        });
        latestCpuFinishAt = Math.max(
          latestCpuFinishAt,
          cpuTargetAt + (outcome.judgments.length - 1) * DANCE_FEVER_BAR_DURATION_MS + DANCE_RESULT_SETTLE_MS,
        );
      } else {
        window.setTimeout(() => {
          setOutcomeLabels((current) => ({ ...current, [outcome.id]: getOutcomeLabel(outcome) }));
        }, Math.max(0, cpuTargetAt - performance.now()));
      }
    });
    const actualRedBase = redOutcomes.reduce((sum, outcome) => sum + outcome.base, 0);
    const actualBlueBase = blueOutcomes.reduce((sum, outcome) => sum + outcome.base, 0);
    const redValue = redOutcomes.reduce((sum, outcome) => sum + outcome.gauge, 0);
    const blueValue = blueOutcomes.reduce((sum, outcome) => sum + outcome.gauge, 0);
    const nextRedStamina = redStaminaRef.current.map((value, index) =>
      redOutcomes.find((outcome) => outcome.index === index)?.stamina ?? value);
    const nextBlueStamina = blueStaminaRef.current.map((value, index) =>
      blueOutcomes.find((outcome) => outcome.index === index)?.stamina ?? value);
    const nextRedStreaks = redStreaksRef.current.map((value, index) => {
      const outcome = redOutcomes.find((entry) => entry.index === index);
      if (!outcome || outcome.mode === "recovery") return value;
      return outcome.judgments.includes("MISS") ? 0 : value + 1;
    });
    const nextBlueStreaks = blueStreaksRef.current.map((value, index) => {
      const outcome = blueOutcomes.find((entry) => entry.index === index);
      if (!outcome || outcome.mode === "recovery") return value;
      return outcome.judgments.includes("MISS") ? 0 : value + 1;
    });
    const nextRedScore = addDanceGauge(redScoreRef.current, redValue, goal);
    const nextBlueScore = addDanceGauge(blueScoreRef.current, blueValue, goal);
    redScoreRef.current = nextRedScore;
    blueScoreRef.current = nextBlueScore;
    redStaminaRef.current = nextRedStamina;
    blueStaminaRef.current = nextBlueStamina;
    redStreaksRef.current = nextRedStreaks;
    blueStreaksRef.current = nextBlueStreaks;
    setRedStamina(nextRedStamina);
    setBlueStamina(nextBlueStamina);
    setRedStreaks(nextRedStreaks);
    setBlueStreaks(nextBlueStreaks);
    const playerOutcome = redOutcomes.find((outcome) => outcome.index === 0);
    if (playerOutcome && playerParticipates) {
      const oldStamina = redStamina[0] ?? 0;
      setStaminaChange(playerOutcome.stamina - oldStamina);
    }
    const cpuSettleDelay = Math.max(0, latestCpuFinishAt - performance.now());
    const resultDelay = Math.max(DANCE_RESULT_DURATION_MS, cpuSettleDelay + DANCE_RESULT_DURATION_MS);
    window.setTimeout(() => {
      setScoreDelta({ red: actualRedBase, blue: actualBlueBase });
      setScoreDeltaGauge({ red: redValue, blue: blueValue });
      setScoreDeltaScaled(false);
      setRedScore(nextRedScore);
      setBlueScore(nextBlueScore);
      window.setTimeout(() => setScoreDeltaScaled(true), 500);
    }, cpuSettleDelay);
    const roster = [
      ...teams.red.map((member) => ({ id: member.id, team: "red" as const })),
      ...teams.blue.map((member) => ({ id: member.id, team: "blue" as const })),
    ];
    const centerIndex = centerTeamRef.current === "red" ? redCenter : blueCenter;
    const centerMembers = teams[centerTeamRef.current];
    const currentCenterId = centerMembers[centerIndex]?.id;
    const progression = resolveDanceProgression({
      phase: currentPhase,
      lastStep,
      center: currentCenterId && currentPhase !== "a"
        ? { id: currentCenterId, team: centerTeamRef.current, base: centerBaseScores[centerTeamRef.current] }
        : null,
      centerUsedThird: centerUsedThirdRef.current,
      scores: { red: nextRedScore, blue: nextBlueScore },
      goal,
    }, outcomes.map((outcome) => ({
      id: outcome.id,
      team: outcome.side,
      mode: outcome.mode,
      base: outcome.base,
      missed: outcome.judgments.includes("MISS"),
    })), roster);
    window.setTimeout(() => {
      if (progression.winner) {
        setResult(progression.winner);
        setStage("result");
        return;
      }
      const previousCenterId = currentCenterId;
      if (progression.center) {
        centerTeamRef.current = progression.center.team;
        const nextIndex = teams[progression.center.team].findIndex((member) => member.id === progression.center!.id);
        setRedCenter(progression.center.team === "red" ? nextIndex : redCenter);
        setBlueCenter(progression.center.team === "blue" ? nextIndex : blueCenter);
        if (progression.center.id !== previousCenterId) {
          soundManager.playSe("/sounds/se/magic_small.mp3");
          setSwapTeam(progression.center.team);
          window.setTimeout(() => setSwapTeam(null), 650);
        }
      } else {
        centerTeamRef.current = "red";
        setRedCenter(0);
        setBlueCenter(0);
      }
      centerUsedThirdRef.current = progression.centerUsedThird;
      setCenterBaseScores({
        red: progression.center?.team === "red" ? progression.center.base : 0,
        blue: progression.center?.team === "blue" ? progression.center.base : 0,
      });
      setLastStep(progression.lastStep);
      setPhase(progression.phase);
      phaseRef.current = progression.phase;
      setPhaseIndex((value) => value + 1);
    }, resultDelay);
  }, [
    blueCenter, centerBaseScores, goal, lastStep, playerParticipates, redCenter,
    redStamina, roundStartedAt, stars, teams,
  ]);

  autoResolveRef.current = () => resolveCompletedAction("normal", []);

  const advanceDanceKey = useCallback((judgment: DanceJudgment) => {
    const current = actionRef.current;
    if (!current || feverTransitionRef.current) return;
    const judged = applyDanceStaminaJudgment(judgment, redStaminaRef.current[0] ?? 0, current.mode);
    if (judged === "MISS" || judged === "BAD") soundManager.playSe("/sounds/se/ng.mp3");
    else soundManager.playSe("/sounds/se/button.mp3");
    setLastJudgment(judged);
    setLastJudgmentMode(current.mode);
    setLastJudgmentId((value) => value + 1);
    const accumulated = [...current.judgments, judged];
    if (current.fever) {
      setFeverProgress({
        count: accumulated.filter((entry) => entry !== "MISS").length,
        score: getDanceActionScore(accumulated, "normal"),
      });
    }
    if (current.fever && judged !== "MISS" && accumulated.length < getDanceFeverLimit(stars)) {
      const isInitialFeverKey = current.judgments.length === 0;
      const nextStart = performance.now() +
        (isInitialFeverKey ? DANCE_FEVER_TRANSITION_DELAY_MS : 0);
      const next: DanceAction = {
        ...current,
        sequence: [(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const)[Math.floor(Math.random() * 4)]!],
        judgments: accumulated,
        startedAt: nextStart,
        targetAt: nextStart + DANCE_FEVER_BAR_DURATION_MS,
        index: 0,
      };
      actionRef.current = next;
      if (deadlineRef.current !== null) window.clearTimeout(deadlineRef.current);
      deadlineRef.current = null;
      if (actionDeadlineRef.current !== null) window.clearTimeout(actionDeadlineRef.current);
      if (isInitialFeverKey) {
        feverTransitionRef.current = true;
        window.setTimeout(() => {
          feverTransitionRef.current = false;
          setActiveAction(next);
        }, DANCE_FEVER_TRANSITION_DELAY_MS);
      } else {
        setActiveAction(next);
      }
      return;
    }
    if (deadlineRef.current !== null) window.clearTimeout(deadlineRef.current);
    setFeverProgress(null);
    stopActiveAction();
    resolveCompletedAction(current.mode, accumulated);
  }, [resolveCompletedAction, stars, stopActiveAction]);

  const registerInput = useCallback((key: DanceKey) => {
    if (stage !== "playing" || !keysRevealed || !playerParticipates ||
      roundSettlingRef.current || feverTransitionRef.current) return;
    const current = actionRef.current;
    if (!current) {
      const mode = (Object.keys(laneSequences) as DanceMode[])
        .find((candidate) => laneSequences[candidate][0] === key);
      if (!mode) return;
      setupNewAction(mode, key);
      soundManager.playSe(mode === "recovery" ? "/sounds/se/charge.mp3" : "/sounds/se/button.mp3");
      return;
    }
    const expected = current.sequence[current.index];
    if (key !== expected) {
      soundManager.playSe("/sounds/se/ng.mp3");
      const reset = { ...current, index: 0 };
      actionRef.current = reset;
      setActiveAction(reset);
      return;
    }
    if (current.index < current.sequence.length - 1) {
      soundManager.playSe("/sounds/se/button.mp3");
      const next = { ...current, index: current.index + 1 };
      actionRef.current = next;
      setActiveAction(next);
      return;
    }
    const diff = performance.now() - current.targetAt;
    if (!isDanceFinalKeyWindow(diff)) return;
    advanceDanceKey(judgeDanceTiming(diff));
  }, [advanceDanceKey, keysRevealed, laneSequences, playerParticipates, setupNewAction, stage]);

  advanceInputRef.current = advanceDanceKey;

  useEffect(() => {
    if (!activeAction) return;
    if (actionDeadlineRef.current !== null) window.clearTimeout(actionDeadlineRef.current);
    actionDeadlineRef.current = window.setTimeout(
      () => advanceInputRef.current("MISS"),
      Math.max(0, activeAction.targetAt + 300 - performance.now()),
    );
    return () => {
      if (actionDeadlineRef.current !== null) window.clearTimeout(actionDeadlineRef.current);
    };
  }, [activeAction]);

  useEffect(() => {
    if (stage !== "playing") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const keyMap: Record<string, DanceKey> = {
        ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft",
        ArrowRight: "ArrowRight", x: "X", X: "X",
      };
      const key = keyMap[event.key];
      if (key) {
        event.preventDefault();
        registerInput(key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [registerInput, stage]);

  const centerIndex = centerTeamRef.current === "red" ? redCenter : blueCenter;
  const centerMember = phase === "a" ? null : teams[centerTeamRef.current][centerIndex] ?? null;
  const feverReady = (redStreaks[0] ?? 0) >= 2 &&
    (phase === "a" || phase === "c" || (phase === "last" && lastStep === "center") || centerUsedThirdRef.current);
  const isDancing = (side: "red" | "blue", index: number) => {
    if (phase === "a") return true;
    const isCenter = side === centerTeamRef.current && index === centerIndex;
    if (phase === "c" || (phase === "last" && lastStep === "center")) return isCenter;
    if (phase === "last") return side !== centerTeamRef.current;
    return !isCenter;
  };
  const renderMember = (side: "red" | "blue", index: number) => {
    const member = teams[side][index];
    if (!member) return null;
    const isCenter = centerMember?.id === member.id;
    const stamina = (side === "red" ? redStamina : blueStamina)[index] ?? 0;
    const dancing = stage === "playing" && isDancing(side, index);
    const judgment = side === "red" && index === 0 ? lastJudgment : null;
    const outcome = outcomeLabels[member.id];
    const feverLabel = side === "red" && index === 0 && activeAction?.fever && feverProgress
      ? `🔥${CIRCLED_NUMBERS[Math.min(CIRCLED_NUMBERS.length - 1, feverProgress.count)]}${feverProgress.score}`
      : outcome?.kind.startsWith("fever-") ? outcome.text : null;
    const activeFeverCount = feverProgress?.count ?? 0;
    const activeFeverKind = activeFeverCount >= getDanceFeverLimit(stars)
      ? "fever-best"
      : activeFeverCount >= Math.ceil(getDanceFeverLimit(stars) / 2) ? "fever-middle" : "fever-low";
    return (
      <figure
        key={member.id}
        className={`dance-member${isCenter ? " dance-member-center" : ""}${swapTeam === side ? " dance-member-switch" : ""}${dancing ? " dance-member-active" : " dance-member-idle"}`}
        style={{ ["--dance-team-color" as string]: TEAM_COLORS[side] }}
      >
        {feverLabel && <strong key={lastJudgmentId} className={`dance-judgement dance-judgement-${outcome?.kind ?? activeFeverKind}`}>{feverLabel}</strong>}
        {outcome && !outcome.kind.startsWith("fever-") && <strong className={`dance-judgement dance-judgement-${outcome.kind}`}>{outcome.text}</strong>}
        {judgment && !outcome && <strong className={`dance-judgement dance-judgement-${judgment.toLowerCase()}`}>{judgment}</strong>}
        {(feverLabel ?? outcome?.text) && <strong className="dance-points">{feverLabel ?? outcome?.text}</strong>}
        <figcaption>{isCenter ? "👑 " : ""}{member.nickname}{member.boss ? " ★" : ""}　⚡{stamina}</figcaption>
        <CharacterImage src={transparentImages[member.id] ?? member.image} alt={member.nickname} />
      </figure>
    );
  };
  const renderBackline = (side: "red" | "blue") => (
    <div className={`dance-backline dance-backline-${side}`}>
      <h3>{side === "red" ? "RED" : "BLUE"}</h3>
      {teams[side].map((member, index) => {
        if (centerMember?.id === member.id) return null;
        return renderMember(side, index);
      })}
    </div>
  );

  if (stage === "configure") {
    return (
      <section className="difficulty-screen dance-setup" aria-labelledby="dance-title">
        <h2 id="dance-title" className="difficulty-heading">煌け!ダンス★バトル</h2>
        <p>難易度とチーム人数を選んで、ラクガキたちのダンスバトルへ！</p>
        <label className="dance-select-row">
          難易度
          <select value={stars} onChange={(event) => setStars(Number(event.target.value) as 3 | 4 | 5)}>
            <option value={3}>★★★</option><option value={4}>★★★★</option><option value={5}>★★★★★</option>
          </select>
        </label>
        <div className="dance-team-size" aria-label="チーム人数">
          {([1, 2, 3] as const).map((size) => (
            <button key={size} className={teamSize === size ? "dance-choice-selected" : ""} onClick={() => setTeamSize(size)}>
              {size} 対 {size}
            </button>
          ))}
        </div>
        <div className="difficulty-menu">
          <button className="title-menu-button difficulty-button" onClick={startDrawing}>🎨 おえかきして始める</button>
          <button className="title-menu-button difficulty-back" onClick={props.onBack}>ゲーム選択へ戻る</button>
        </div>
      </section>
    );
  }

  if (stage === "drawing") {
    return (
      <section className="dance-drawing">
        <header className="dance-heading-row">
          <h2>煌け!ダンス★バトル — おえかきパート</h2>
          <button className="title-menu-button difficulty-back" onClick={props.onBack}>ゲーム選択へ戻る</button>
        </header>
        <div className="drawing-mode-layout">
          <div className="drawing-mode-panel">
            <DrawPanel
              seconds={300}
              completeLabel="ダンスバトルへ"
              onComplete={(payload) => void finishDrawing(payload)}
            />
          </div>
        </div>
      </section>
    );
  }

  if (stage === "loading") {
    return <section className="dance-loading" role="status">対戦ラクガキを集めています…</section>;
  }

  if (stage === "vs") {
    return (
      <section className="dance-arena dance-vs" aria-label="対戦チーム">
        <div className="dance-vs-banner"><h2>VS</h2><strong>煌け!ダンス★バトル</strong></div>
        <div className="dance-vs-teams">
          <div><h3>RED TEAM</h3>{teams.red.map((member) => (
            <span key={member.id}>
              <CharacterImage src={transparentImages[member.id] ?? member.image} alt={member.nickname} />
            </span>
          ))}</div>
          <div><h3>BLUE TEAM</h3>{teams.blue.map((member) => (
            <span key={member.id}>
              <CharacterImage src={transparentImages[member.id] ?? member.image} alt={member.nickname} />
            </span>
          ))}</div>
        </div>
        <p>ダンスバトル開始！</p>
      </section>
    );
  }

  if (stage === "result") {
    return (
      <section className="dance-arena dance-result">
        <h2>{result === "red" ? "RED TEAM の勝利！" : "BLUE TEAM の勝利！"}</h2>
        <div className="dance-scoreboard"><span>RED {redScore}</span><span>BLUE {blueScore}</span></div>
        <p>目標ポイント {goal} — {stars === 5 ? "★★★★★" : "★".repeat(stars)}</p>
        <button className="title-menu-button difficulty-button" onClick={props.onBack}>ミニゲーム選択へ戻る</button>
      </section>
    );
  }

  return (
    <section className="dance-arena" aria-label="ダンスバトル">
      <header className="dance-game-header">
        <strong>煌け!ダンス★バトル</strong>
        <span>
          {phase === "last" ? "★LAST DANCE" : DANCE_PHASE_LABELS[phase]} · {stars === 5 ? "★★★★★" : "★".repeat(stars)}
          {((phase === "b") || (phase === "last" && lastStep === "backline")) && !centerUsedThirdRef.current ? " · フィーバー無効" : ""}
        </span>
        <button className="dance-exit" onClick={() => { stopActiveAction(); props.onBack(); }}>選択へ戻る</button>
      </header>
      <div className="dance-hud">
        {(["red", "blue"] as const).map((side) => {
          const score = side === "red" ? redScore : blueScore;
          const delta = scoreDelta?.[side] ?? null;
          const scaledDelta = scoreDeltaGauge?.[side] ?? delta;
          const shownDelta = scoreDeltaScaled ? scaledDelta : delta;
          return (
            <section key={side} className={`dance-hud-team dance-hud-${side}`}>
              <h2>{side === centerTeamRef.current ? "👑 " : ""}{side === "red" ? "RED" : "BLUE"} TEAM {phase === "last" && side === centerTeamRef.current ? "★LAST DANCE" : ""}</h2>
              <div className="dance-hud-score">{score}/{goal}{delta !== null && delta !== 0 && (
                <span className={scoreDeltaScaled ? "dance-delta-scaled" : ""}>
                  {shownDelta !== null && shownDelta >= 0 ? "+" : "−"}{Math.abs(shownDelta ?? 0)}
                </span>
              )}</div>
              <div className="dance-goal-track" role="progressbar" aria-label={`${side} team goal`} aria-valuenow={score} aria-valuemax={goal}>
                <span style={{ width: `${Math.min(100, score / goal * 100)}%` }} />
              </div>
              {side === "red" && teams.red[0] && (
                <div className="dance-player-stamina">
                  <strong>⚡あなたのスタミナ {redStamina[0] ?? 0}/{getDanceStamina(teams.red[0].stats.maxHp)}</strong>
                  <span className="dance-stamina-track"><i style={{ width: `${(redStamina[0] ?? 0) / getDanceStamina(teams.red[0].stats.maxHp) * 100}%` }} /></span>
                  {staminaChange !== null && <small className={staminaChange >= 0 ? "dance-recovery-change" : "dance-spend-change"}>{staminaChange >= 0 ? "+" : ""}{staminaChange}</small>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="dance-stage">
        {renderBackline("red")}
        <div className="dance-center-position">
          {centerMember ? renderMember(centerTeamRef.current, centerIndex) : <span>中央決定戦</span>}
        </div>
        {renderBackline("blue")}
      </div>
      <div className="dance-play-controls">
        <p className="dance-status" aria-live="polite">
          {!playerParticipates ? "観戦中…" : !keysRevealed ? "READY…" : activeAction
            ? activeAction.fever && activeAction.judgments.length > 0
              ? `🔥FEVER ${CIRCLED_NUMBERS[Math.min(CIRCLED_NUMBERS.length - 1, activeAction.judgments.length)]}${getDanceActionScore(activeAction.judgments, "normal")}　${activeAction.judgments.length + 1}/${getDanceFeverLimit(stars)}`
              : `キーを順番に入力　${activeAction.index + 1}/${activeAction.sequence.length}`
            : feverReady ? "🔥FEVER READY（3段目で発動）— 最初のキーで段を選ぼう" : "最初のキーで段を選ぼう（金枠のキー）"}
          {playerParticipates && !activeAction?.fever && lastJudgment ? `　${lastJudgment}` : ""}
        </p>
        <div className="dance-lanes" aria-label="入力レーン">
          {getDanceVisibleModes(
            playerParticipates,
            Boolean(activeAction?.fever && activeAction.judgments.length > 0),
          ).map((mode) => {
            const label = mode === "recovery"
              ? "1.回復 +10"
              : mode === "normal"
                ? "2.×1.0 −4"
                : activeAction?.fever && activeAction.judgments.length > 0
                  ? `🔥FEVER ${activeAction.judgments.length + 1}/${getDanceFeverLimit(stars)} −7`
                  : feverReady ? "🔥FEVER READY −7" : "3.×1.2 −7";
            const sequence = activeAction?.mode === mode && activeAction.fever && activeAction.judgments.length > 0
              ? activeAction.sequence
              : laneSequences[mode];
            const barStart = activeAction?.startedAt ?? roundStartedAt + DANCE_READY_DURATION_MS;
            const barDuration = activeAction?.fever && activeAction.judgments.length > 0
              ? DANCE_FEVER_BAR_DURATION_MS : DANCE_BAR_DURATION_MS;
            const progress = Math.min(1.08, Math.max(0, (clock - barStart) / barDuration));
            return (
              <div key={mode} className={`dance-lane dance-lane-${mode}${activeAction?.mode === mode ? " dance-lane-selected" : ""}`}>
                <strong>{label}{mode === "recovery" ? ` (+${getDanceRecovery(teams.red[0]?.stats.maxPp ?? 0)})` : ""}</strong>
                <div className="dance-lane-track">
                  <div className="dance-lane-keys">
                    {sequence.map((key, index) => (
                      <span key={`${mode}-${index}`} className={[
                        "dance-lane-key",
                        index === 0 ? "dance-first-key" : "",
                        index === sequence.length - 1 ? "dance-key-fin" : "",
                        activeAction?.mode === mode && index < activeAction.index ? "dance-key-done" : "",
                        !keysRevealed ? "dance-key-hidden" : "",
                      ].filter(Boolean).join(" ")}>
                        {keysRevealed ? KEY_LABELS[key] : "?"}
                        {index === sequence.length - 1 && lastJudgmentMode === mode && lastJudgment && (
                          <strong key={lastJudgmentId} className={`dance-lane-judgement dance-judgement-${lastJudgment.toLowerCase()}`}>
                            {lastJudgment} {getDanceActionScore([lastJudgment], mode) >= 0 ? "+" : ""}{getDanceActionScore([lastJudgment], mode)}
                          </strong>
                        )}
                        {index === sequence.length - 1 && (
                          <span className="dance-center-line"><i>▼</i><b>▲</b></span>
                        )}
                      </span>
                    ))}
                    {(!activeAction || activeAction.mode === mode) && (
                      <span className="dance-bar-path">
                        <i className="dance-bar" style={{
                          left: `${progress * 100}%`,
                          opacity: clock >= barStart && progress <= 1.04 ? 1 : 0,
                        }} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {playerParticipates && (
          <>
            <div className="dance-keypad" aria-label="ダンス操作パッド">
              {(["ArrowUp", "ArrowLeft", "X", "ArrowRight", "ArrowDown"] as const).map((key) => (
                <button key={key} onClick={() => registerInput(key)} aria-label={KEY_LABELS[key]}>{KEY_LABELS[key]}</button>
              ))}
            </div>
            <p className="dance-input-help">最初のキーで段を選ぼう（金枠のキー）</p>
          </>
        )}
      </div>
      <div className="dance-round-note">ラウンド {phaseIndex + 1}</div>
    </section>
  );
}
