"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { CharacterImage } from "@/components/Battle/CharacterImage";
import { getBossData } from "@/data/bosses";
import { SEED_GHOSTS } from "@/data/seed-ghosts";
import {
  createDanceRound,
  canActivateDanceFever,
  DANCE_MODES,
  DANCE_JUDGMENT_POINTS,
  DANCE_PHASE_LABELS,
  getDanceActionScore,
  getDanceCpuJudgment,
  getDanceCpuMode,
  getDanceGoal,
  getDanceFeverLimit,
  getDanceRecovery,
  getDanceStamina,
  expireDanceRound,
  getDanceRoundProgress,
  inputDanceRound,
  type DanceJudgment,
  type DanceKey,
  type DanceMode,
  type DancePhase,
  type DanceRound,
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
  const [activeAction, setActiveAction] = useState<DanceRound | null>(null);
  const [roundReady, setRoundReady] = useState(true);
  const lanesRef = useRef<HTMLDivElement>(null);
  const [lastJudgment, setLastJudgment] = useState<DanceJudgment | null>(null);
  const [result, setResult] = useState<"red" | "blue" | null>(null);
  const [swapTeam, setSwapTeam] = useState<"red" | "blue" | null>(null);
  const redScoreRef = useRef(0);
  const blueScoreRef = useRef(0);
  const redStaminaRef = useRef<number[]>([]);
  const blueStaminaRef = useRef<number[]>([]);
  const feverUsesRef = useRef(0);
  const blueFeverUsesRef = useRef(0);
  const actionRef = useRef<DanceRound | null>(null);
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
        const cpuFinal = makeJudgeList(1, blueBoss);
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
  }, [blueBoss, blueCenter, centerBaseScores, goal, redCenter, teamSize, teams]);

  const finishRound = useCallback((round: DanceRound) => {
    if (!round.judgment || !round.mode || !actionRef.current) return;
    stopActiveAction();
    setLastJudgment(round.judgment);
    setRoundReady(true);
    const cpuStaminaNow = Math.min(...(blueStaminaRef.current.length ? blueStaminaRef.current : [0]));
    const cpuMode = phaseRef.current === "last" ? "multiplier" : getDanceCpuMode(cpuStaminaNow, blueStreak);
    if (cpuMode === "multiplier" && blueFeverUsesRef.current === 0 && phaseRef.current !== "last") {
      blueFeverUsesRef.current = getDanceFeverLimit(stars);
    }
    const multiplied = round.mode === "multiplier" &&
      (phaseRef.current === "last" || canActivateDanceFever(redStreak, feverUsesRef.current));
    if (multiplied && feverUsesRef.current === 0 && phaseRef.current !== "last") {
      feverUsesRef.current = getDanceFeverLimit(stars);
      setFeverUsesRemaining(feverUsesRef.current);
    }
    resolveCompletedAction(round.mode, multiplied, [round.judgment], cpuMode, cpuMode === "multiplier", makeJudgeList(1, blueBoss));
  }, [blueBoss, blueStreak, redStreak, resolveCompletedAction, stars, stopActiveAction]);

  const registerInput = useCallback((key: DanceKey) => {
    const current = actionRef.current;
    if (!current) return;
    const next = inputDanceRound(current, key, performance.now());
    soundManager.playSe(next === current || next.judgment === "BAD" || next.judgment === "MISS" ? "/sounds/se/ng.mp3" : "/sounds/se/button.mp3");
    actionRef.current = next;
    setActiveAction(next);
    if (next.judgment) finishRound(next);
  }, [finishRound]);

  useEffect(() => {
    if (stage !== "playing" || (phase === "last" && centerTeamRef.current === "red")) return;
    let frame = 0;
    const timer = window.setTimeout(() => {
      const round = createDanceRound(stars, performance.now());
      actionRef.current = round;
      setActiveAction(round);
      setRoundReady(false);
      setLastJudgment(null);
      const tick = () => {
        const current = actionRef.current;
        if (!current) return;
        const now = performance.now();
        lanesRef.current?.style.setProperty("--p", String(getDanceRoundProgress(current, now)));
        const expired = expireDanceRound(current, now);
        if (expired.judgment) {
          soundManager.playSe("/sounds/se/ng.mp3");
          finishRound(expired);
        } else frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }, 900);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [stage, phase, phaseIndex, stars, finishRound]);

  const selectLane = useCallback((mode: DanceMode) => {
    const current = actionRef.current;
    if (!current || current.mode) return;
    const next = { ...current, mode };
    actionRef.current = next;
    setActiveAction(next);
  }, []);

  useEffect(() => {
    if (stage !== "playing") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        event.preventDefault();
        selectLane(event.key === "1" ? "recovery" : event.key === "2" ? "normal" : "multiplier");
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
  }, [registerInput, selectLane, stage]);

  const renderTeam = (side: "red" | "blue") => {
    const members = teams[side];
    const center = side === "red" ? redCenter : blueCenter;
    return (
      <div className="dance-team">
        <div className="dance-team-lineup">
          {members.map((member, index) => {
            const isCenter = index === center;
            const stamina = (side === "red" ? redStamina : blueStamina)[index] ?? 0;
            const dancing = !roundReady && (phase === "a" || (phase === "c" ? isCenter : phase === "last"
              ? (side === centerTeamRef.current ? isCenter : teamSize === 1 || !isCenter)
              : teamSize === 1 ? side === "blue" : !isCenter));
            const slot = isCenter ? 0 : members.slice(0, index).filter((_, i) => i !== center).length + 1;
            return (
              <figure
                key={member.id}
                className={`dance-member${isCenter ? " dance-member-center" : ""}${swapTeam === side ? " dance-member-switch" : ""}${dancing ? " dance-member-active" : ""}`}
                style={{ ["--slot" as string]: slot }}
              >
                <figcaption>{isCenter ? "👑" : ""}{member.nickname}{member.boss ? " ★" : ""} ⚡{stamina}</figcaption>
                <span className="dance-member-judgment">{side === "red" ? lastJudgment : ""}</span>
                <CharacterImage src={member.image} alt={member.nickname} />
              </figure>
            );
          })}
        </div>
      </div>
    );
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
    <section className="dance-arena" aria-label="ダンスバトル">
      <header className="dance-game-header">
        <button className="dance-exit" onClick={() => { stopActiveAction(); props.onBack(); }}>選択へ戻る</button>
      </header>
      <div className="dance-hud">
        {(["red", "blue"] as const).map((side) => (
          <div key={side} className="dance-team-panel" style={{ ["--dance-team-color" as string]: TEAM_COLORS[side] }}>
            <strong>{side === "red" ? "RED TEAM" : "BLUE TEAM"}　{Math.round(side === "red" ? redScore : blueScore)} / {goal}</strong>
            <span>👑 {teams[side][side === "red" ? redCenter : blueCenter]?.nickname}</span>
            <small>{side === "red" ? `FEVER ×${feverUsesRemaining}` : DANCE_PHASE_LABELS[phase]}</small>
          </div>
        ))}
      </div>
      <div className="dance-players" aria-label={DANCE_PHASE_LABELS[phase]}>
        {renderTeam("red")}
        {renderTeam("blue")}
      </div>
      <div className="dance-play-controls">
        {phase === "last" && centerTeamRef.current === "red" ? (
          <p className="dance-status" role="status">最後のダンス！相手のバックラインがセンターを超えるか判定中…</p>
        ) : (
          <>
            <p className="dance-status" aria-live="polite">
              {roundReady ? "READY" : activeAction?.mode
                ? "キーを順に入力 → 最後のキーは黄色バーと白線が重なる瞬間！"
                : "最初のキーで段を決定！黄色バーは進み続けます"}
              {lastJudgment ? `　${lastJudgment}` : ""}
            </p>
            <div ref={lanesRef} className={`dance-lanes${activeAction ? " dancing" : ""}`} aria-label="入力するキー（3段）">
              {DANCE_MODES.map((mode, row) => {
                const selected = activeAction?.mode === mode;
                const sequence = activeAction?.sequences[mode] ?? [];
                return (
                <div
                  key={mode}
                  className={`dance-lane${selected ? " on" : ""}`}
                  onClick={() => selectLane(mode)}
                >
                  <span className="dance-lane-label">{row + 1} {mode === "recovery" ? "回復" : mode === "normal" ? "通常" : "×1.2"}</span>
                  <div className="dance-track">
                    <div className="dance-keys">
                      {sequence.slice(0, -1).map((key, index) => (
                        <span key={index} className={`dance-key${index === 0 ? " first" : ""}${selected && index < activeAction.index ? " ok" : ""}`}>{KEY_LABELS[key]}</span>
                      ))}
                    </div>
                    <span className="dance-key dance-fin">{sequence.length ? KEY_LABELS[sequence[sequence.length - 1]] : ""}</span>
                    <span className="dance-bar" />
                  </div>
                </div>
              ); })}
            </div>
            <div className="dance-keypad" aria-label="ダンス操作パッド">
              {(["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight", "X"] as const).map((key) => (
                <button key={key} onClick={() => registerInput(key)} aria-label={KEY_LABELS[key]}>{KEY_LABELS[key]}</button>
              ))}
            </div>
            <p className="dance-input-help">矢印キー / X · スマホは下のパッド · 段選択の補助: 1 / 2 / 3 またはレーンをタップ</p>
          </>
        )}
      </div>
      <div className="dance-round-note">ラウンド {phaseIndex + 1}　·　中央 {centerBaseScores.red} / {centerBaseScores.blue}</div>
    </section>
  );
}
