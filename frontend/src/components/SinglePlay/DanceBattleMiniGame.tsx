"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { CharacterImage } from "@/components/Battle/CharacterImage";
import { getBossData } from "@/data/bosses";
import { SEED_GHOSTS } from "@/data/seed-ghosts";
import {
  createDanceSequence,
  createDanceLanes,
  canActivateDanceFever,
  DANCE_PHASE_LABELS,
  getDanceActionScore,
  getDanceBarProgress,
  getDanceCpuJudgment,
  getDanceCpuMode,
  getDanceGoal,
  getDanceFeverLimit,
  getDanceRecovery,
  getDanceStamina,
  getDanceTargetTime,
  getDanceTimingJudgment,
  type DanceJudgment,
  type DanceKey,
  type DanceLane,
  type DanceMode,
  type DancePhase,
} from "@/lib/danceBattle";
import { drawingToDataUrl } from "@/lib/drawingWire";
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
  index: number;
  multiplied: boolean;
  timingStartedAt: number | null;
  timingTargetMs: number;
};
type DanceLaneOption = DanceLane & { sequence: DanceKey[] };

const KEY_LABELS: Record<DanceKey, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  X: "X",
};
const DANCE_BGM = "/sounds/bgm/boss4_loop.mp3";
const FINAL_DANCE_BGM = "/sounds/bgm/boss5-3_loop.mp3";

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

function makeJudgeList(count: number, boss: boolean) {
  return Array.from({ length: count }, () => getDanceCpuJudgment(Math.random, boss));
}

function teamStamina(members: DanceMember[]) {
  return members.map((member) => getDanceStamina(member.stats.maxHp));
}

function DancePortrait(props: {
  member: DanceMember;
  stamina: number;
  center: boolean;
  dancing: boolean;
  judgment: DanceJudgment | null;
  score: number;
  position: number;
  side: "red" | "blue";
  swapping: boolean;
}) {
  const [imageReady, setImageReady] = useState(false);
  return (
    <figure
      className={`dance-performer dance-performer-${props.side}${props.center ? " dance-performer-center" : ""}${props.dancing ? " dance-performer-dancing" : " dance-performer-idle"}${props.swapping ? " dance-performer-switch" : ""}`}
      style={{ "--performer-x": `${props.position}%`, "--performer-y": props.position % 2 ? "58%" : "68%" } as CSSProperties}
    >
      <figcaption className={props.member.id === "dance-player" ? "dance-name dance-name-player" : "dance-name"}>
        {props.center ? "👑" : ""}{props.member.nickname}{props.member.boss ? " ★" : ""} ⚡{props.stamina}
      </figcaption>
      {props.judgment && (
        <strong className="dance-performer-judgment" key={`${props.judgment}-${props.score}`}>
          {props.judgment} <span>{props.score > 0 ? "+" : ""}{props.score}</span>
        </strong>
      )}
      <div className={`dance-performer-image${imageReady ? " dance-image-ready" : ""}`}>
        <span className="dance-image-placeholder" aria-hidden="true">{props.member.nickname.slice(0, 2)}</span>
        <CharacterImage
          src={props.member.image}
          alt={props.member.nickname}
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(true)}
        />
      </div>
    </figure>
  );
}

export function DanceBattleMiniGame(props: {
  onBack: () => void;
  playerProfile: { playerId: string; nickname: string };
}) {
  const [stage, setStage] = useState<DanceStage>("configure");
  const [stars, setStars] = useState<3 | 4 | 5>(3);
  const [teamSize, setTeamSize] = useState<1 | 2 | 3>(1);
  const [teams, setTeams] = useState<{ red: DanceMember[]; blue: DanceMember[] }>({ red: [], blue: [] });
  const [phase, setPhase] = useState<DancePhase>("a");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [redScore, setRedScore] = useState(0);
  const [blueScore, setBlueScore] = useState(0);
  const [redScoreDelta, setRedScoreDelta] = useState(0);
  const [blueScoreDelta, setBlueScoreDelta] = useState(0);
  const [muted, setMuted] = useState(false);
  const [redStamina, setRedStamina] = useState<number[]>([]);
  const [blueStamina, setBlueStamina] = useState<number[]>([]);
  const [redStreak, setRedStreak] = useState(0);
  const [blueStreak, setBlueStreak] = useState(0);
  const [feverUsesRemaining, setFeverUsesRemaining] = useState(0);
  const [redCenter, setRedCenter] = useState(0);
  const [blueCenter, setBlueCenter] = useState(0);
  const [centerBaseScores, setCenterBaseScores] = useState({ red: 0, blue: 0 });
  const [activeAction, setActiveAction] = useState<DanceAction | null>(null);
  const [laneChoices, setLaneChoices] = useState<DanceLaneOption[]>([]);
  const [keysVisible, setKeysVisible] = useState(false);
  const [roundReady, setRoundReady] = useState(false);
  const [timingProgress, setTimingProgress] = useState(0);
  const [lastJudgment, setLastJudgment] = useState<DanceJudgment | null>(null);
  const [lastBlueJudgment, setLastBlueJudgment] = useState<DanceJudgment | null>(null);
  const [lastRedMode, setLastRedMode] = useState<DanceMode>("normal");
  const [lastBlueMode, setLastBlueMode] = useState<DanceMode>("normal");
  const [result, setResult] = useState<"red" | "blue" | null>(null);
  const [swapTeam, setSwapTeam] = useState<"red" | "blue" | null>(null);
  const redScoreRef = useRef(0);
  const blueScoreRef = useRef(0);
  const redStaminaRef = useRef<number[]>([]);
  const blueStaminaRef = useRef<number[]>([]);
  const feverUsesRef = useRef(0);
  const blueFeverUsesRef = useRef(0);
  const actionRef = useRef<DanceAction | null>(null);
  const phaseRef = useRef<DancePhase>("a");
  const centerTeamRef = useRef<"red" | "blue">("red");
  const previousVolumesRef = useRef({ bgm: 0.08, se: 0.12 });

  const goal = getDanceGoal(stars);
  const blueBoss = teams.blue.some((member) => member.boss);

  const stopActiveAction = useCallback(() => {
    actionRef.current = null;
    setActiveAction(null);
  }, []);

  const toggleMute = () => {
    if (muted) {
      soundManager.setBgmVolume(previousVolumesRef.current.bgm);
      soundManager.setSeVolume(previousVolumesRef.current.se);
      setMuted(false);
      return;
    }
    previousVolumesRef.current = {
      bgm: soundManager.getBgmVolume(),
      se: soundManager.getSeVolume(),
    };
    soundManager.setBgmVolume(0);
    soundManager.setSeVolume(0);
    setMuted(true);
  };

  useEffect(() => () => soundManager.stopBgm(), []);

  useEffect(() => {
    if (stage === "playing") soundManager.playBgm(phase === "last" ? FINAL_DANCE_BGM : DANCE_BGM);
    else if (stage === "vs") soundManager.playBgm(DANCE_BGM);
  }, [phase, stage]);

  useEffect(() => {
    if (stage !== "vs") return;
    const timer = window.setTimeout(() => setStage("playing"), 3000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "playing") return;
    setLaneChoices(createDanceLanes().map((lane) => ({
      ...lane,
      sequence: createDanceSequence(lane.mode, stars, Math.random, lane.firstKey),
    })));
    setKeysVisible(false);
    setRoundReady(false);
    const keysTimer = window.setTimeout(() => setKeysVisible(true), 1200);
    const readyTimer = window.setTimeout(() => setRoundReady(true), 1500);
    return () => {
      window.clearTimeout(keysTimer);
      window.clearTimeout(readyTimer);
    };
  }, [phase, phaseIndex, stars, stage]);

  useEffect(() => {
    const current = activeAction;
    if (!current?.timingStartedAt) {
      setTimingProgress(0);
      return;
    }
    const target = current.timingTargetMs;
    let frame = 0;
    const update = () => {
      setTimingProgress(getDanceBarProgress(performance.now() - current.timingStartedAt!, target));
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [activeAction]);

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
    setRedScoreDelta(0);
    setBlueScoreDelta(0);
    redScoreRef.current = 0;
    blueScoreRef.current = 0;
    setRedCenter(0);
    setBlueCenter(0);
    setCenterBaseScores({ red: 0, blue: 0 });
    setRedStreak(0);
    setBlueStreak(0);
    setFeverUsesRemaining(0);
    feverUsesRef.current = 0;
    blueFeverUsesRef.current = 0;
    setResult(null);
    setStage("vs");
  }, [createOpponent, props.playerProfile.nickname, teamSize]);

  const setupNewAction = useCallback((lane: DanceLaneOption, firstKeyPressed: boolean) => {
    const { mode } = lane;
    if (stage !== "playing" || actionRef.current) return;
    if (phase === "last" && mode !== "multiplier") return;
    if (mode === "multiplier" && phase !== "last" && !canActivateDanceFever(redStreak, feverUsesRef.current)) return;
    if (mode === "multiplier" && feverUsesRef.current === 0 && phase !== "last") {
      feverUsesRef.current = getDanceFeverLimit(stars);
      setFeverUsesRemaining(feverUsesRef.current);
    }
    const feverRound = mode === "multiplier" && phase !== "last";
    const sequence = feverRound ? [lane.firstKey] : lane.sequence;
    const index = firstKeyPressed && !feverRound ? 1 : 0;
    const timingStartedAt = feverRound || (firstKeyPressed && index >= sequence.length - 1)
      ? performance.now()
      : null;
    const feverStage = feverRound ? getDanceFeverLimit(stars) - feverUsesRef.current + 1 : 1;
    const next: DanceAction = {
      mode,
      sequence,
      judgments: [],
      index,
      multiplied: mode === "multiplier",
      timingStartedAt,
      timingTargetMs: getDanceTargetTime(0, feverStage - 1),
    };
    actionRef.current = next;
    setActiveAction(next);
    setLastJudgment(null);
    soundManager.playSe("/sounds/se/button.mp3");
  }, [phase, redStreak, stage, stars]);

  const resolveCompletedAction = useCallback((
    mode: DanceMode,
    multiplied: boolean,
    judgments: DanceJudgment[],
    cpuMode: DanceMode,
    cpuMultiplied: boolean,
    cpuJudgments: DanceJudgment[],
  ) => {
    const currentPhase = phaseRef.current;
    setLastBlueJudgment(cpuJudgments[0] ?? null);
    setLastBlueMode(cpuMode);
    const activeIndexes = (members: DanceMember[], side: "red" | "blue") => {
      const center = side === "red" ? redCenter : blueCenter;
      if (currentPhase === "last") {
        if (side === centerTeamRef.current || teamSize === 1) return [center];
        return members.map((_, index) => index).filter((index) => index !== center);
      }
      if (currentPhase === "a") return members.map((_, index) => index);
      if (currentPhase === "c") return [center];
      if (teamSize === 1) return side === "blue" ? [center] : [];
      return members.map((_, index) => index).filter((index) => index !== center);
    };
    const redIndexes = activeIndexes(teams.red, "red");
    const blueIndexes = activeIndexes(teams.blue, "blue");
    const actualRedBase = redIndexes.reduce(
      (score, index) => score + getDanceActionScore(judgments, "normal", mode === "recovery" ? 1 : redStaminaRef.current[index]!),
      0,
    );
    const actualBlueBase = blueIndexes.reduce(
      (score, index) => score + getDanceActionScore(cpuJudgments, "normal", cpuMode === "recovery" ? 1 : blueStaminaRef.current[index]!),
      0,
    );
    const redMultiplier = mode === "multiplier" && multiplied ? 1.2 : 1;
    const blueMultiplier = cpuMode === "multiplier" && cpuMultiplied ? 1.2 : 1;
    const redValue = Math.round(actualRedBase * redMultiplier);
    const blueValue = Math.round(actualBlueBase * blueMultiplier);

    const applyStamina = (current: number[], members: DanceMember[], side: "red" | "blue", dancers: number, actionMode: DanceMode, actionJudgments: DanceJudgment[]) =>
      current.map((value, index) => {
        if (!activeIndexes(members, side).includes(index) || dancers === 0) return value;
        if (actionMode === "recovery") {
          if (actionJudgments.includes("MISS")) return value;
          return Math.min(
            getDanceStamina(members[index]!.stats.maxHp),
            value + getDanceRecovery(members[index]!.stats.maxPp),
          );
        }
        return Math.max(0, value - (actionMode === "multiplier" ? 7 : 4));
      });

    if (currentPhase === "last") {
      const winner = centerTeamRef.current === "red"
        ? (centerBaseScores.red >= actualBlueBase ? "red" : "blue")
        : (actualRedBase > centerBaseScores.blue ? "red" : "blue");
      setRedScore((value) => Math.min(goal, value + redValue));
      setBlueScore((value) => Math.min(goal, value + blueValue));
      setRedScoreDelta(redValue);
      setBlueScoreDelta(blueValue);
      redScoreRef.current = Math.min(goal, redScoreRef.current + redValue);
      blueScoreRef.current = Math.min(goal, blueScoreRef.current + blueValue);
      setResult(winner);
      setStage("result");
      return;
    }

    const nextRedScore = Math.min(goal, redScoreRef.current + redValue);
    const nextBlueScore = Math.min(goal, blueScoreRef.current + blueValue);
    redScoreRef.current = nextRedScore;
    blueScoreRef.current = nextBlueScore;
    setRedScore(nextRedScore);
    setBlueScore(nextBlueScore);
    setRedScoreDelta(redValue);
    setBlueScoreDelta(blueValue);

    const nextRedStamina = applyStamina(redStaminaRef.current, teams.red, "red", redIndexes.length, mode, judgments);
    const nextBlueStamina = applyStamina(blueStaminaRef.current, teams.blue, "blue", blueIndexes.length, cpuMode, cpuJudgments);
    setRedStamina(nextRedStamina);
    setBlueStamina(nextBlueStamina);
    redStaminaRef.current = nextRedStamina;
    blueStaminaRef.current = nextBlueStamina;
    if ((mode === "recovery" && !judgments.includes("MISS")) || (cpuMode === "recovery" && !cpuJudgments.includes("MISS"))) {
      soundManager.playSe("/sounds/se/charge.mp3");
    } else if (judgments.includes("MISS") || cpuJudgments.includes("MISS") || judgments.includes("BAD") || cpuJudgments.includes("BAD")) {
      soundManager.playSe("/sounds/se/ng.mp3");
    } else soundManager.playSe("/sounds/se/button.mp3");

    const redCenterScore = currentPhase === "c" ? actualRedBase : centerBaseScores.red;
    const blueCenterScore = currentPhase === "c" ? actualBlueBase : centerBaseScores.blue;
    if (currentPhase === "c") {
      setCenterBaseScores({ red: actualRedBase, blue: actualBlueBase });
      const redMissed = judgments.includes("MISS");
      const blueMissed = cpuJudgments.includes("MISS");
      if (teamSize > 1 && redMissed) setRedCenter((value) => (value + 1) % teamSize);
      if (teamSize > 1 && blueMissed) setBlueCenter((value) => (value + 1) % teamSize);
      if (teamSize > 1 && (redMissed || blueMissed)) {
        setSwapTeam(redMissed ? "red" : "blue");
        soundManager.playSe("/sounds/se/magic_small.mp3");
        window.setTimeout(() => setSwapTeam(null), 650);
      }
    } else if (currentPhase === "b" && actualRedBase > redCenterScore && teamSize > 1) {
      setRedCenter((value) => (value + 1) % teamSize);
      setSwapTeam("red");
      soundManager.playSe("/sounds/se/magic_small.mp3");
      window.setTimeout(() => setSwapTeam(null), 650);
    } else if (currentPhase === "b" && actualBlueBase > blueCenterScore && teamSize > 1) {
      setBlueCenter((value) => (value + 1) % teamSize);
      setSwapTeam("blue");
      soundManager.playSe("/sounds/se/magic_small.mp3");
      window.setTimeout(() => setSwapTeam(null), 650);
    }

    setRedStreak((value) => judgments.every((judgment) => ["PERFECT", "GREAT", "GOOD"].includes(judgment)) ? value + 1 : 0);
    setBlueStreak((value) => cpuJudgments.every((judgment) => ["PERFECT", "GREAT", "GOOD"].includes(judgment)) ? value + 1 : 0);
    if (mode === "multiplier" && multiplied && feverUsesRef.current > 0) {
      feverUsesRef.current = judgments.includes("MISS") ? 0 : feverUsesRef.current - 1;
      setFeverUsesRemaining(feverUsesRef.current);
      if (feverUsesRef.current === 0) setRedStreak(0);
    }
    if (cpuMode === "multiplier" && cpuMultiplied && blueFeverUsesRef.current > 0) {
      blueFeverUsesRef.current -= 1;
      if (blueFeverUsesRef.current === 0) setBlueStreak(0);
    }

    if (nextRedScore >= goal || nextBlueScore >= goal) {
      const centerTeam = nextRedScore >= nextBlueScore ? "red" : "blue";
      centerTeamRef.current = centerTeam;
      setCenterBaseScores({ red: redCenterScore, blue: blueCenterScore });
      setPhase("last");
      phaseRef.current = "last";
      setLastJudgment(null);
      if (centerTeam === "red") {
        const cpuFinalMode: DanceMode = "multiplier";
        const cpuFinal = makeJudgeList(4 + 2 * (stars - 2), blueBoss);
        const cpuBacklineScore = getDanceActionScore(cpuFinal, "normal") * (teamSize === 1 ? 1 : teamSize - 1);
        const winner = redCenterScore >= cpuBacklineScore ? "red" : "blue";
        window.setTimeout(() => {
          const finalScore = getDanceActionScore(cpuFinal, cpuFinalMode) * (teamSize === 1 ? 1 : teamSize - 1);
          setBlueScore((value) => Math.min(goal, value + finalScore));
          blueScoreRef.current = Math.min(goal, blueScoreRef.current + finalScore);
          setResult(winner);
          setStage("result");
        }, 2600);
      }
      return;
    }

    const nextIndex = (["a", "c", "b"] as const).indexOf(currentPhase as "a" | "c" | "b");
    const nextPhase = (["a", "c", "b"] as const)[(nextIndex + 1) % 3]!;
    setPhase(nextPhase);
    phaseRef.current = nextPhase;
    setPhaseIndex((value) => value + 1);
  }, [blueBoss, blueCenter, centerBaseScores, goal, redCenter, stars, teamSize, teams]);

  const advanceDanceKey = useCallback((judgment: DanceJudgment) => {
    const current = actionRef.current;
    if (!current) return;
    const judgments = [...current.judgments, judgment];
    if (judgment === "MISS") soundManager.playSe("/sounds/se/ng.mp3");
    setLastJudgment(judgment);
    setLastRedMode(current.mode);
    if (judgments.length >= 1) {
      stopActiveAction();
      const cpuStaminaNow = Math.min(...(blueStaminaRef.current.length ? blueStaminaRef.current : [0]));
      const cpuMode = phaseRef.current === "last"
        ? "multiplier"
        : getDanceCpuMode(cpuStaminaNow, blueStreak, Math.random);
      if (cpuMode === "multiplier" && blueFeverUsesRef.current === 0 && phaseRef.current !== "last") {
        blueFeverUsesRef.current = getDanceFeverLimit(stars);
      }
      const cpuMultiplied = cpuMode === "multiplier";
      const cpuJudgments = makeJudgeList(1, blueBoss);
      resolveCompletedAction(current.mode, current.multiplied, judgments, cpuMode, cpuMultiplied, cpuJudgments);
      return;
    }
    const next = { ...current, judgments, index: current.index + 1 };
    actionRef.current = next;
    setActiveAction(next);
  }, [blueBoss, blueStreak, resolveCompletedAction, stars, stopActiveAction]);

  const registerInput = useCallback((key: DanceKey) => {
    const current = actionRef.current;
    if (!current) {
      if (stage !== "playing" || !roundReady) return;
      const lane = laneChoices.find((choice) => choice.firstKey === key);
      if (lane) setupNewAction(lane, true);
      return;
    }
    const expected = current.sequence[current.index];
    if (key !== expected) {
      soundManager.playSe("/sounds/se/ng.mp3");
      const reset = { ...current, index: 0, timingStartedAt: null };
      actionRef.current = reset;
      setActiveAction(reset);
      return;
    }
    if (current.timingStartedAt === null && current.index < current.sequence.length - 1) {
      const index = current.index + 1;
      const timingStartedAt = index === current.sequence.length - 1 ? performance.now() : null;
      const next = { ...current, index, timingStartedAt };
      actionRef.current = next;
      setActiveAction(next);
      soundManager.playSe("/sounds/se/button.mp3");
      return;
    }
    if (current.timingStartedAt === null) return;
    const judgment = getDanceTimingJudgment(
      performance.now() - current.timingStartedAt,
      current.timingTargetMs,
    );
    if (judgment === null) return;
    soundManager.playSe(judgment === "BAD" ? "/sounds/se/ng.mp3" : "/sounds/se/button.mp3");
    advanceDanceKey(judgment);
  }, [advanceDanceKey, laneChoices, roundReady, setupNewAction, stage]);

  useEffect(() => {
    if (!activeAction?.timingStartedAt) return;
    const target = activeAction.timingStartedAt + activeAction.timingTargetMs + 300;
    const timer = window.setTimeout(() => advanceDanceKey("MISS"), Math.max(0, target - performance.now()));
    return () => window.clearTimeout(timer);
  }, [activeAction, advanceDanceKey]);

  useEffect(() => {
    if (stage !== "playing") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        if (actionRef.current || !roundReady) return;
        event.preventDefault();
        const lane = laneChoices[Number(event.key) - 1];
        if (lane) setupNewAction(lane, false);
      } else {
        const keyMap: Record<string, DanceKey> = {
          ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft",
          ArrowRight: "ArrowRight", x: "X", X: "X",
        };
        const key = keyMap[event.key];
        if (key) {
          event.preventDefault();
          registerInput(key);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [laneChoices, registerInput, roundReady, setupNewAction, stage]);

  const renderTeamPanel = (side: "red" | "blue") => {
    const members = teams[side];
    const center = side === "red" ? redCenter : blueCenter;
    const score = side === "red" ? redScore : blueScore;
    const stamina = side === "red" ? redStamina : blueStamina;
    const playerStamina = redStamina[0] ?? 0;
    const playerMaxStamina = teams.red[0] ? getDanceStamina(teams.red[0].stats.maxHp) : 0;
    return (
      <div className={`dance-hud-team dance-hud-${side}`}>
        <strong>{side === "red" ? "RED TEAM" : "BLUE TEAM"}</strong>
        <span>{score} / {goal}</span>
        {(side === "red" ? redScoreDelta : blueScoreDelta) !== 0 && (
          <b className="dance-score-pop" key={`${score}-${side === "red" ? redScoreDelta : blueScoreDelta}`}>
            {(side === "red" ? redScoreDelta : blueScoreDelta) > 0 ? "+" : ""}{side === "red" ? redScoreDelta : blueScoreDelta}
          </b>
        )}
        <div className="dance-score-track"><i style={{ width: `${Math.max(0, Math.min(100, (score / goal) * 100))}%` }} /></div>
        <small>{side === "red" ? `⚡あなたのスタミナ ${playerStamina} / ${playerMaxStamina} ${activeAction?.mode === "recovery" ? `+${getDanceRecovery(teams.red[0]?.stats.maxPp ?? 0)}` : activeAction ? `-${activeAction.mode === "multiplier" ? 7 : 4}` : ""}` : `⚡中央 ${members[center]?.nickname ?? "—"} ${stamina[center] ?? 0}`}</small>
      </div>
    );
  };

  const renderDancers = (side: "red" | "blue") => {
    const members = teams[side];
    const center = side === "red" ? redCenter : blueCenter;
    const stamina = side === "red" ? redStamina : blueStamina;
    const active = (index: number) => {
      if (phase === "last") return side === centerTeamRef.current || teamSize === 1 ? index === center : index !== center;
      if (phase === "a") return true;
      if (phase === "c") return index === center;
      if (teamSize === 1) return side === "blue";
      return index !== center;
    };
    const dancers = members.map((member, index) => ({ member, index })).filter(({ index }) => active(index));
    return dancers.map(({ member, index }, dancerIndex) => {
      const isCenter = index === center;
      const position = isCenter
        ? side === "red" ? 43 : 57
        : side === "red" ? 13 + dancerIndex * 13 : 87 - dancerIndex * 13;
      const judgment = side === "red" ? lastJudgment : lastBlueJudgment;
      const point = judgment
        ? getDanceActionScore([judgment], side === "red" ? lastRedMode : lastBlueMode, stamina[index] ?? 0)
        : 0;
      return (
        <DancePortrait
          key={member.id}
          member={member}
          stamina={stamina[index] ?? 0}
          center={isCenter}
          dancing={stage === "playing" && !!activeAction && active(index)}
          judgment={judgment}
          score={point}
          position={position}
          side={side}
          swapping={swapTeam === side}
        />
      );
    });
  };

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
        <DrawPanel
          seconds={300}
          completeLabel="ダンスバトルへ"
          onComplete={(payload) => void finishDrawing(payload)}
        />
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={member.image} alt={member.nickname} />
            </span>
          ))}</div>
          <div><h3>BLUE TEAM</h3>{teams.blue.map((member) => (
            <span key={member.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={member.image} alt={member.nickname} />
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
    <section className="dance-battle dance-arena" aria-label="ダンスバトル">
      <header className="dance-game-header">
        <span>{DANCE_PHASE_LABELS[phase]}　{stars === 5 ? "★★★★★" : "★".repeat(stars)}　FEVER ×{feverUsesRemaining}</span>
        <button className="dance-exit" onClick={() => { stopActiveAction(); props.onBack(); }}>選択へ戻る</button>
      </header>
      <div className="dance-hud">
        {renderTeamPanel("red")}
        <strong className="dance-hud-crown">👑</strong>
        {renderTeamPanel("blue")}
      </div>
      <div className="dance-stage" aria-label="ダンスステージ">
        <div className="dance-stage-logo">Dance★Dance</div>
        <button
          className="dance-mute"
          aria-label={muted ? "サウンドを有効にする" : "BGMと効果音をミュート"}
          aria-pressed={muted}
          onClick={toggleMute}
        >{muted ? "🔇" : "🔊"}</button>
        <div className="dance-platform" />
        <div className="dance-stage-performers">
          {renderDancers("red")}
          {renderDancers("blue")}
        </div>
      </div>
      <div className="dance-center-info" aria-live="polite">
        👑中央：{teams[centerTeamRef.current][centerTeamRef.current === "red" ? redCenter : blueCenter]?.nickname ?? "—"}
        （{centerTeamRef.current === "red" ? "赤チーム" : "青チーム"}）{centerBaseScores[centerTeamRef.current]}点 ／ 後ろのメンバーが3段目で超えれば交代
      </div>
      <p className="dance-hint" aria-live="polite">
        {phase === "last" && centerTeamRef.current === "red"
          ? "最後のダンス！相手チームの結果を待っています…"
          : !keysVisible ? "READY…" : !roundReady ? "キーは黄色いバーが動き出す直前に表示されます" : !activeAction
            ? "最初のキーで段を選ぼう（金枠のキー）"
            : activeAction.timingStartedAt === null
              ? "順番にキー入力 → 最後のキーを白い線に合わせて！"
              : "黄色いバーが白い線に重なる瞬間に押して！"}
      </p>
      <div className="dance-lanes" id="lanes">
        {laneChoices.map((lane, laneIndex) => {
          const isSelected = activeAction?.mode === lane.mode;
          const feverLimit = getDanceFeverLimit(stars);
          const feverStage = feverUsesRemaining === 0 ? 1 : feverLimit - feverUsesRemaining + 1;
          const feverLabel = canActivateDanceFever(redStreak, feverUsesRemaining) ? ` 🔥FEVER ${Math.min(feverStage, feverLimit)}/${feverLimit}` : "";
          const modeText = lane.mode === "recovery" ? `1.回復 +${getDanceRecovery(teams.red[redCenter]?.stats.maxPp ?? 0)}` : lane.mode === "normal" ? "2.ダンス −4" : `3.×1.2 −7${feverLabel}`;
          const sequence = isSelected ? activeAction.sequence : lane.sequence;
          const sequenceIndex = isSelected ? activeAction.index : -1;
          const showingBar = isSelected && activeAction.timingStartedAt !== null;
          const laneDisabled = (lane.mode === "multiplier" && phase !== "last" && !canActivateDanceFever(redStreak, feverUsesRemaining)) ||
            (phase === "last" && lane.mode !== "multiplier");
          return (
            <div className={`dance-lane${isSelected ? " dance-lane-on" : ""}${laneDisabled ? " dance-lane-disabled" : ""}`} key={lane.mode} data-lane={laneIndex + 1}>
              <strong className="dance-lane-label">{modeText}</strong>
              <div className="dance-track" style={{ "--bar-progress": String(showingBar ? timingProgress : 0) } as CSSProperties}>
                <span className="dance-track-start" />
                {keysVisible && <div className="dance-track-keys">
                  {sequence.map((key, index) => (
                    <span className={`${index === 0 ? "dance-lane-first" : ""}${index === sequence.length - 1 ? " dance-lane-final" : ""}${isSelected && index < sequenceIndex ? " dance-lane-done" : ""}`} key={`${key}-${index}`}>
                      {KEY_LABELS[key]}
                    </span>
                  ))}
                </div>}
                <span className="dance-finish-line"><i>▼</i></span>
                {showingBar && <span className="dance-bar" aria-hidden="true" />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="dance-keypad" aria-label="ダンス操作パッド">
        {(["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight", "X"] as const).map((key) => (
          <button key={key} onClick={() => registerInput(key)} aria-label={KEY_LABELS[key]}>{KEY_LABELS[key]}</button>
        ))}
      </div>
      <p className="dance-round-note">PC: 矢印キー / X・数字キー1/2/3　スマホ: 下のキーをタップ　·　ラウンド {phaseIndex + 1}</p>
    </section>
  );
}
