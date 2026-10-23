"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { getBossData } from "@/data/bosses";
import { SEED_GHOSTS } from "@/data/seed-ghosts";
import {
  createDanceSequence,
  canActivateDanceFever,
  DANCE_JUDGMENT_POINTS,
  DANCE_PHASE_LABELS,
  getDanceActionScore,
  getDanceCpuJudgment,
  getDanceCpuMode,
  getDanceGoal,
  getDanceFeverLimit,
  getDanceRecovery,
  getDanceStamina,
  getDanceTargetTime,
  judgeDanceTiming,
  type DanceJudgment,
  type DanceKey,
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
  startedAt: number;
  index: number;
  multiplied: boolean;
};

const KEY_LABELS: Record<DanceKey, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  X: "X",
};
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

function makeJudgeList(count: number, boss: boolean) {
  return Array.from({ length: count }, () => getDanceCpuJudgment(Math.random, boss));
}

function teamStamina(members: DanceMember[]) {
  return members.map((member) => getDanceStamina(member.stats.maxHp));
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
  const [redStamina, setRedStamina] = useState<number[]>([]);
  const [blueStamina, setBlueStamina] = useState<number[]>([]);
  const [redStreak, setRedStreak] = useState(0);
  const [blueStreak, setBlueStreak] = useState(0);
  const [feverUsesRemaining, setFeverUsesRemaining] = useState(0);
  const [redCenter, setRedCenter] = useState(0);
  const [blueCenter, setBlueCenter] = useState(0);
  const [centerBaseScores, setCenterBaseScores] = useState({ red: 0, blue: 0 });
  const [activeAction, setActiveAction] = useState<DanceAction | null>(null);
  const [lastJudgment, setLastJudgment] = useState<DanceJudgment | null>(null);
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

  const goal = getDanceGoal(stars);
  const blueBoss = teams.blue.some((member) => member.boss);

  const stopActiveAction = useCallback(() => {
    actionRef.current = null;
    setActiveAction(null);
  }, []);

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

  const setupNewAction = useCallback((mode: DanceMode) => {
    if (stage !== "playing" || actionRef.current) return;
    if (phase === "last" && mode !== "multiplier") return;
    if (mode === "multiplier" && phase !== "last" && !canActivateDanceFever(redStreak, feverUsesRef.current)) return;
    if (mode === "multiplier" && feverUsesRef.current === 0 && phase !== "last") {
      feverUsesRef.current = getDanceFeverLimit(stars);
      setFeverUsesRemaining(feverUsesRef.current);
    }
    const next: DanceAction = {
      mode,
      sequence: createDanceSequence(mode, stars),
      judgments: [],
      startedAt: performance.now(),
      index: 0,
      multiplied: mode === "multiplier",
    };
    actionRef.current = next;
    setActiveAction(next);
    setLastJudgment(null);
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
    const redBase = getDanceActionScore(judgments, "normal");
    const blueBase = getDanceActionScore(cpuJudgments, "normal");
    const actualRedBase = redIndexes.reduce(
      (score, index) => score + (mode !== "recovery" && redStaminaRef.current[index] <= 0
        ? DANCE_JUDGMENT_POINTS.BAD * judgments.length
        : redBase),
      0,
    );
    const actualBlueBase = blueIndexes.reduce(
      (score, index) => score + (cpuMode !== "recovery" && blueStaminaRef.current[index] <= 0
        ? DANCE_JUDGMENT_POINTS.BAD * cpuJudgments.length
        : blueBase),
      0,
    );
    const redMultiplier = mode === "multiplier" && multiplied ? 1.2 : 1;
    const blueMultiplier = cpuMode === "multiplier" && cpuMultiplied ? 1.2 : 1;
    const redValue = actualRedBase * redMultiplier;
    const blueValue = actualBlueBase * blueMultiplier;

    const applyStamina = (current: number[], members: DanceMember[], side: "red" | "blue", dancers: number, actionMode: DanceMode) =>
      current.map((value, index) => {
        if (!activeIndexes(members, side).includes(index) || dancers === 0) return value;
        if (actionMode === "recovery") {
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
      setRedScore((value) => value + redValue);
      setBlueScore((value) => value + blueValue);
      redScoreRef.current += redValue;
      blueScoreRef.current += blueValue;
      setResult(winner);
      setStage("result");
      return;
    }

    const nextRedScore = redScoreRef.current + redValue;
    const nextBlueScore = blueScoreRef.current + blueValue;
    redScoreRef.current = nextRedScore;
    blueScoreRef.current = nextBlueScore;
    setRedScore(nextRedScore);
    setBlueScore(nextBlueScore);

    const nextRedStamina = applyStamina(redStaminaRef.current, teams.red, "red", redIndexes.length, mode);
    const nextBlueStamina = applyStamina(blueStaminaRef.current, teams.blue, "blue", blueIndexes.length, cpuMode);
    setRedStamina(nextRedStamina);
    setBlueStamina(nextBlueStamina);
    redStaminaRef.current = nextRedStamina;
    blueStaminaRef.current = nextBlueStamina;
    if (mode === "recovery" || cpuMode === "recovery") soundManager.playSe("/sounds/se/charge.mp3");
    else if (actualRedBase < 0 || actualBlueBase < 0) soundManager.playSe("/sounds/se/ng.mp3");
    else soundManager.playSe("/sounds/se/button.mp3");

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
      feverUsesRef.current -= 1;
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
          setBlueScore((value) => value + finalScore);
          blueScoreRef.current += finalScore;
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
    if (judgments.length >= current.sequence.length) {
      stopActiveAction();
      const cpuStaminaNow = Math.min(...(blueStaminaRef.current.length ? blueStaminaRef.current : [0]));
      const cpuMode = phaseRef.current === "last"
        ? "multiplier"
        : getDanceCpuMode(cpuStaminaNow, blueStreak, Math.random);
      if (cpuMode === "multiplier" && blueFeverUsesRef.current === 0 && phaseRef.current !== "last") {
        blueFeverUsesRef.current = getDanceFeverLimit(stars);
      }
      const cpuMultiplied = cpuMode === "multiplier";
      const cpuLength = createDanceSequence(cpuMode, stars).length;
      const cpuJudgments = makeJudgeList(cpuLength, blueBoss);
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
      if (stage === "playing") soundManager.playSe("/sounds/se/ng.mp3");
      return;
    }
    const expected = current.sequence[current.index];
    if (key !== expected) {
      soundManager.playSe("/sounds/se/ng.mp3");
      advanceDanceKey("BAD");
      return;
    }
    const diff = performance.now() - getDanceTargetTime(current.startedAt, current.index);
    const judgment = judgeDanceTiming(diff);
    soundManager.playSe(judgment === "BAD" ? "/sounds/se/ng.mp3" : "/sounds/se/button.mp3");
    advanceDanceKey(judgment);
  }, [advanceDanceKey, stage]);

  useEffect(() => {
    if (!activeAction) return;
    const target = getDanceTargetTime(activeAction.startedAt, activeAction.index) + 116;
    const timer = window.setTimeout(() => advanceDanceKey("MISS"), Math.max(0, target - performance.now()));
    return () => window.clearTimeout(timer);
  }, [activeAction, advanceDanceKey]);

  useEffect(() => {
    if (stage !== "playing") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        if (actionRef.current) return;
        event.preventDefault();
        setupNewAction(event.key === "1" ? "recovery" : event.key === "2" ? "normal" : "multiplier");
        soundManager.playSe("/sounds/se/button.mp3");
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
  }, [registerInput, setupNewAction, stage]);

  const renderTeam = (side: "red" | "blue") => {
    const members = teams[side];
    const center = side === "red" ? redCenter : blueCenter;
    return (
      <div className="dance-team" style={{ ["--dance-team-color" as string]: TEAM_COLORS[side] }}>
        <h3>{side === "red" ? "RED TEAM" : "BLUE TEAM"}</h3>
        <div className="dance-team-lineup">
          {members.map((member, index) => {
            const isCenter = index === center;
            const stamina = (side === "red" ? redStamina : blueStamina)[index] ?? 0;
            return (
              <figure
                key={member.id}
                className={`dance-member${isCenter ? " dance-member-center" : ""}${swapTeam === side ? " dance-member-switch" : ""}${stage === "playing" ? " dance-member-active" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={member.image} alt={member.nickname} />
                <figcaption>{member.nickname}{member.boss ? " ★" : ""}</figcaption>
                <small>{isCenter ? "CENTER" : `ST ${stamina}`}</small>
              </figure>
            );
          })}
        </div>
      </div>
    );
  };

  const currentKey = activeAction?.sequence[activeAction.index];
  const currentMode = activeAction?.mode;
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
    <section className="dance-arena" aria-label="ダンスバトル">
      <header className="dance-game-header">
        <strong>煌け!ダンス★バトル</strong>
        <span>{DANCE_PHASE_LABELS[phase]} · {stars === 5 ? "★★★★★" : "★".repeat(stars)} · FEVER {feverUsesRemaining}</span>
        <button className="dance-exit" onClick={() => { stopActiveAction(); props.onBack(); }}>選択へ戻る</button>
      </header>
      <div className="dance-scoreboard">
        <strong style={{ color: TEAM_COLORS.red }}>RED {redScore}</strong>
        <span>GOAL {goal}</span>
        <strong style={{ color: TEAM_COLORS.blue }}>BLUE {blueScore}</strong>
      </div>
      <div className="dance-players">
        {renderTeam("red")}
        <span className="dance-vs-mark">VS</span>
        {renderTeam("blue")}
      </div>
      <div className="dance-play-controls">
        {phase === "last" && centerTeamRef.current === "red" ? (
          <p className="dance-status" role="status">最後のダンス！相手のバックラインがセンターを超えるか判定中…</p>
        ) : (
          <>
            <p className="dance-status" aria-live="polite">
              {currentKey
                ? `タイミングよく ${KEY_LABELS[currentKey]} を入力！ ${activeAction!.index + 1}/${activeAction!.sequence.length}`
                : phase === "last" ? "FINAL DANCE — 3を選んで挑戦！" : "ダンスを選択してください"}
              {lastJudgment ? `　${lastJudgment}` : ""}
            </p>
            {currentMode && activeAction && (
              <div className="dance-sequence" aria-label="入力するキー">
                {activeAction.sequence.map((key, index) => (
                  <span key={`${key}-${index}`} className={index === activeAction.index ? "dance-key-current" : index < activeAction.index ? "dance-key-done" : ""}>
                    {KEY_LABELS[key]}
                  </span>
                ))}
              </div>
            )}
            <div className="dance-mode-buttons">
              {([
                ["recovery", "1 回復"],
                ["normal", "2 通常"],
                ["multiplier", "3 ×1.2"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  disabled={!!activeAction ||
                    (phase === "last" && mode !== "multiplier") ||
                    (mode === "multiplier" && phase !== "last" && !canActivateDanceFever(redStreak, feverUsesRemaining))}
                  onClick={() => {
                  setupNewAction(mode);
                  soundManager.playSe("/sounds/se/button.mp3");
                  }}
                >
                  {label}
                  {mode === "recovery" ? ` (+${getDanceRecovery(teams.red[redCenter]?.stats.maxPp ?? 0)})` : ""}
                </button>
              ))}
            </div>
            <div className="dance-keypad" aria-label="ダンス操作パッド">
              {(["ArrowUp", "ArrowLeft", "X", "ArrowRight", "ArrowDown"] as const).map((key) => (
                <button key={key} onClick={() => registerInput(key)} aria-label={KEY_LABELS[key]}>{KEY_LABELS[key]}</button>
              ))}
            </div>
            <p className="dance-input-help">PC: 矢印キー / X・段選択 1・2・3　スマホ: 画面下のボタン</p>
          </>
        )}
      </div>
      <div className="dance-round-note">ラウンド {phaseIndex + 1}　·　中央 {centerBaseScores.red} / {centerBaseScores.blue}</div>
    </section>
  );
}
