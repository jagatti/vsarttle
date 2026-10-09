"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { VsScreen } from "@/components/Vs/VsScreen";
import { RoguelikeUpgradePanel } from "@/components/RoguelikeMode/RoguelikeUpgradePanel";
import { PerfectVictoryNotice } from "@/components/RoguelikeMode/PerfectVictoryNotice";
import { RoguelikeBossTransition } from "@/components/RoguelikeMode/RoguelikeBossTransition";
import { BossSpeechBubble } from "@/components/RoguelikeMode/BossSpeechBubble";
import {
  applyPerfectVictoryBuff,
  buildWeakEnemyStats,
  getEnemyWeakMagicKindsByType,
  isBossFloor,
  isWeakFloor,
  ROGUELIKE_PLAYER_INITIAL_STATS,
  ROGUELIKE_TOTAL_FLOORS,
} from "@/lib/roguelikeEnemyStats";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";
import { applyPlayerStats, carryOverPlayerState } from "@/lib/roguelikeTransition";
import { buildWeakMagicTooltip } from "@/lib/roguelikeUpgrades";
import { buildRoguelikeSkillLabels } from "@/lib/roguelikeSkills";
import { FLOOR5_BOSS_CHARGE_HP_THRESHOLD, getGhostCpuActionWeights, pickGhostCpuAction } from "@/lib/ghostCpuAction";
import {
  COOP_ROGUELIKE_DAMAGE_SCALING,
  advanceCoopTurnCounters,
  advanceCoopRewardPhase,
  applyCoopUpgrade,
  buildCoopUpgradeChoices,
  buildCoopSkillEffects,
  getCoopAvailableActions,
  getCoopAlivePlayerIds,
  getCoopNextPlayerId,
  getCoopResultData,
  getCoopRewardPlayerId,
  getCoopChoiceDisabledReason,
  getCoopFirstSelectableChoiceIndex,
  isCoopChoiceDisabled,
  getCoopStartingPlayerId,
  getCoopTurnOutcome,
  resolveCoopTurn,
  resetCoopFloorTurn,
  reviveCoopPlayer,
  startCoopBattle,
  isCoopPresentationComplete,
  getCoopSkillTurn,
  type CoopSnapshot,
  type CoopWireMessage,
} from "@/lib/coopRoguelike";
import { soundManager } from "@/lib/soundManager";
import { getRoguelikeStageBgm } from "@/lib/vsTransition";
import { LIMIT_BREAK_BGM_PATH, LIMIT_BREAK_STAT_REVEAL_INTERVAL_MS, getSinglePlayLimitBreakStatusLines, getSinglePlayLimitBreakDisplayDurationMs } from "@/lib/singlePlayLimitBreak";
import { TURN_SECONDS, POST_TURN_DELAY_MS, getRoguelikeTurnSeconds } from "@/lib/roguelikeTiming";
import type { ActionType, CharacterStats, PlayerBattleState } from "@/types/game";

const REWARD_SECONDS = 60;
const PLAYER_SWITCH_MS = 700;

function createInitialPlayer(player: PlayerBattleState): PlayerBattleState {
  return {
    ...player,
    stats: { ...ROGUELIKE_PLAYER_INITIAL_STATS },
    characterType: "balanced",
    currentHp: ROGUELIKE_PLAYER_INITIAL_STATS.maxHp,
    currentPp: ROGUELIKE_PLAYER_INITIAL_STATS.maxPp,
    chargeMultiplier: 1,
    lastActionCategory: null,
  };
}

export function CooperativeRoguelikeManager(props: {
  initialPlayers: readonly [PlayerBattleState, PlayerBattleState];
  localPlayerId: string;
  remotePlayerId: string;
  isHost: boolean;
  incomingMessage: CoopWireMessage | null;
  sendMessage: (message: CoopWireMessage) => void;
  peerDisconnected: boolean;
  onReturnToTitle: () => void;
  onRedraw: () => void;
}) {
  const [snapshot, setSnapshot] = useState<CoopSnapshot | null>(null);
  const [countdown, setCountdown] = useState(TURN_SECONDS);
  const [dismissedPerfectFloor, setDismissedPerfectFloor] = useState<number | null>(null);
  const [visibleStatCount, setVisibleStatCount] = useState(0);
  const snapshotRef = useRef<CoopSnapshot | null>(null);
  const turnTimerRef = useRef<number | null>(null);
  const postTurnTimerRef = useRef<number | null>(null);
  const rewardTimerRef = useRef<number | null>(null);
  const chooseUpgradeRef = useRef<((current: CoopSnapshot, playerId: string, choiceIndex: number) => void) | null>(null);
  const resolvingRef = useRef(false);
  const presentationReadyRef = useRef(new Set<string>());
  const pendingResolutionRef = useRef<ReturnType<typeof resolveCoopTurn> | null>(null);
  const continuePresentationRef = useRef<(() => void) | null>(null);
  const resolutionDelayDoneRef = useRef(false);
  const knownRunIdRef = useRef<string | null>(null);
  const initialPlayersRef = useRef(props.initialPlayers.map(createInitialPlayer) as unknown as [PlayerBattleState, PlayerBattleState]);
  const playerIds = useMemo(
    () => [props.initialPlayers[0].id, props.initialPlayers[1].id] as const,
    [props.initialPlayers],
  );
  const { isHost, sendMessage, incomingMessage, onRedraw, remotePlayerId } = props;

  const publish = useCallback((next: CoopSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    if (isHost) sendMessage({ type: "coop_snapshot", payload: next });
  }, [isHost, sendMessage]);

  const clearTimers = useCallback(() => {
    if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current);
    if (postTurnTimerRef.current !== null) window.clearTimeout(postTurnTimerRef.current);
    if (rewardTimerRef.current !== null) window.clearTimeout(rewardTimerRef.current);
    turnTimerRef.current = null;
    postTurnTimerRef.current = null;
    rewardTimerRef.current = null;
  }, []);

  const prepareFloor = useCallback(async (
    current: CoopSnapshot,
    floor: number,
    previousPlayers: Record<string, PlayerBattleState>,
    pendingRevivalId: string | null,
    preferredStarter: string | null,
    nextTurn: number,
  ) => {
    let players = Object.fromEntries(current.playerIds.map((id) => {
      const previous = previousPlayers[id]!;
      const carried = floor === 1 ? previous : carryOverPlayerState(previous);
      return [id, pendingRevivalId === id ? reviveCoopPlayer(carried) : {
        ...carried,
        lastActionCategory: null,
        chargeMultiplier: 1,
        chargedPreviousTurn: false,
      }];
    })) as Record<string, PlayerBattleState>;
    const starter = preferredStarter && players[preferredStarter]?.currentHp > 0
      ? preferredStarter
      : getCoopStartingPlayerId(players, floor, current.playerIds, current.excludedPlayerIds);
    const loading: CoopSnapshot = {
      ...current,
      ...resetCoopFloorTurn({ ...current, turn: nextTurn }),
      floor,
      actedPlayerIds: [],
      activePlayerId: starter,
      players,
      enemy: null,
      stage: "loading",
      turnResult: null,
      chargeMultiplier: 1,
      deadline: 0,
      pendingRevivalId: null,
      rewardPlayerId: null,
      rewardPhase: 1,
      pickedChoiceIndex: null,
      upgradeChoices: [],
      outcome: null,
      floorDamageTaken: 0,
      perfectVictoryFloor: current.perfectVictoryFloor,
      status: `第${floor}層の敵を準備しています…`,
    };
    publish(loading);

    try {
      let enemy: PlayerBattleState;
      if (isWeakFloor(floor)) {
        const response = await fetch("/api/ghosts/random", { cache: "no-store" });
        if (!response.ok) throw new Error(`enemy fetch failed: ${response.status}`);
        const body = (await response.json()) as {
          ghost?: { characterType: PlayerBattleState["characterType"]; drawingThumbnail: string; drawingTags?: string[] };
        };
        if (!body.ghost) throw new Error("enemy not found");
        const stats = buildWeakEnemyStats(floor, body.ghost.characterType);
        enemy = {
          id: `coop-enemy-${floor}`,
          nickname: `第${floor}層のAnima`,
          imageDataUrl: body.ghost.drawingThumbnail,
          characterType: body.ghost.characterType,
          stats,
          drawingTags: body.ghost.drawingTags,
          currentHp: stats.maxHp,
          currentPp: stats.maxPp,
          chargeMultiplier: 1,
          lastActionCategory: null,
        };
      } else {
        enemy = buildRoguelikeBossState(floor);
      }
      const enemyStats: CharacterStats = {
        ...enemy.stats,
        hp: Math.round(enemy.stats.hp * COOP_ROGUELIKE_DAMAGE_SCALING.enemyHp),
        maxHp: Math.round(enemy.stats.maxHp * COOP_ROGUELIKE_DAMAGE_SCALING.enemyHp),
        attack: Math.round(enemy.stats.attack * COOP_ROGUELIKE_DAMAGE_SCALING.enemyAttack),
      };
      enemy = {
        ...enemy,
        stats: enemyStats,
        currentHp: enemyStats.maxHp,
      };
      const latest = snapshotRef.current;
      if (
        !latest
        || latest.runId !== current.runId
        || latest.floor !== floor
        || latest.stage !== "loading"
      ) return;
      const excludedPlayerIds = latest.excludedPlayerIds;
      players = latest.players;
      const aliveIds = getCoopAlivePlayerIds(players, excludedPlayerIds);
      players = Object.fromEntries(current.playerIds.map((id) => [
        id,
        excludedPlayerIds.includes(id) ? { ...players[id]!, currentHp: 0 } : players[id]!,
      ]));
      const activePlayerId = starter && aliveIds.includes(starter)
        ? starter
        : getCoopStartingPlayerId(players, floor, current.playerIds, excludedPlayerIds);
      const ready: CoopSnapshot = {
        ...latest,
        players,
        enemy,
        activePlayerId,
        stage: activePlayerId ? "vs" : "result",
        turn: nextTurn,
        deadline: 0,
        outcome: activePlayerId ? null : "game-over",
        status: activePlayerId ? `第${floor}層` : "全員が戦闘不能になりました。",
      };
      presentationReadyRef.current.clear();
      if ((floor === 19 || floor === 20) && current.floor === floor - 1) {
        if (floor === 20 && current.enemy) {
          for (const key of ["voidminationActive", "voidminationUsed", "voidminationSourceFloor", "voidminationBaseStats", "voidminationForm", "voidminationFormTurnsRemaining"] as const) {
            Object.assign(enemy, { [key]: current.enemy[key] });
          }
        }
        const duration = floor === 19 ? 2500 : getSinglePlayLimitBreakDisplayDurationMs(getSinglePlayLimitBreakStatusLines(enemy).length);
        publish({ ...ready, stage: "transition", deadline: Date.now() + duration });
      } else {
        publish(ready);
      }
    } catch {
      const latest = snapshotRef.current;
      if (!latest || latest.runId !== current.runId || latest.floor !== floor || latest.stage !== "loading") return;
      publish({ ...loading, stage: "result", outcome: "game-over", status: "敵データの取得に失敗しました。タイトルへ戻ってください。" });
    }
  }, [publish]);

  const startRun = useCallback((runId: string) => {
    clearTimers();
    resolvingRef.current = false;
    setDismissedPerfectFloor(null);
    presentationReadyRef.current.clear();
    pendingResolutionRef.current = null;
    knownRunIdRef.current = runId;
    const initial = {
      runId,
      floor: 1,
      turn: 1,
      floorTurn: 1,
      totalTurn: 0,
      actedPlayerIds: [],
      playerIds,
      activePlayerId: playerIds[0],
      players: Object.fromEntries(playerIds.map((id, index) => [id, initialPlayersRef.current[index]!])) as Record<string, PlayerBattleState>,
      enemy: null,
      stage: "loading",
      turnResult: null,
      chargeMultiplier: 1,
      deadline: 0,
      excludedPlayerIds: [],
      pendingRevivalId: null,
      rewardPlayerId: null,
      rewardPhase: 1,
      pickedChoiceIndex: null,
      upgradeChoices: [],
      outcome: null,
      status: "協力ローグライクを開始します",
      acquiredWeakMagicKinds: {},
      acquiredSkills: {},
      acquiredHealingSkills: {},
      floorDamageTaken: 0,
      perfectVictoryFloor: null,
    } satisfies CoopSnapshot;
    snapshotRef.current = initial;
    setSnapshot(initial);
    void prepareFloor(initial, 1, initial.players, null, playerIds[0], 1);
  }, [clearTimers, playerIds, prepareFloor]);

  useEffect(() => {
    if (props.isHost && !knownRunIdRef.current) {
      startRun(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`);
    }
  }, [props.isHost, startRun]);

  const openReward = useCallback((current: CoopSnapshot) => {
    const boss = isBossFloor(current.floor);
    const rewardPlayerId = getCoopRewardPlayerId(current.players, current.floor, current.playerIds, {
      excludedIds: current.excludedPlayerIds,
    });
    if (!rewardPlayerId) {
      publish({ ...current, stage: "result", outcome: "game-over", status: "全員が戦闘不能になりました。" });
      return;
    }
    if (current.floor >= ROGUELIKE_TOTAL_FLOORS) {
      publish({ ...current, stage: "result", outcome: "cleared", status: "20層制覇！" });
      return;
    }
    const deadAlly = current.playerIds.find((id) =>
      id !== rewardPlayerId
      && current.players[id]!.currentHp <= 0
      && !current.excludedPlayerIds.includes(id),
    );
    const upgradeChoices = buildCoopUpgradeChoices(current, rewardPlayerId, !!deadAlly);
    if (!upgradeChoices.length) {
      void prepareFloor(current, current.floor + 1, current.players, null, current.lastAttackerId ?? rewardPlayerId, current.turn);
      return;
    }
    const upgrade: CoopSnapshot = {
      ...current,
      stage: "upgrading",
      rewardPlayerId,
      rewardPhase: 1,
      pickedChoiceIndex: null,
      upgradeChoices,
      pendingRevivalId: deadAlly ?? null,
      deadline: Date.now() + REWARD_SECONDS * 1000,
      status: boss ? "相手が報酬を選んでいます" : "相手が強化を選んでいます",
    };
    publish(upgrade);
  }, [prepareFloor, publish]);

  const continueAfterTurn = useCallback((result: ReturnType<typeof resolveCoopTurn>, previous: CoopSnapshot, actingPlayerId: string) => {
    previous = { ...previous, ...advanceCoopTurnCounters(previous) };
    const players = { ...result.players };
    for (const id of previous.excludedPlayerIds) {
      if (players[id]) players[id] = { ...players[id]!, currentHp: 0 };
    }
    const synchronizedResult = {
      ...result,
      players,
      turnResult: { ...result.turnResult, nextStates: { ...players, [result.enemy.id]: result.enemy } },
    };
    const outcome = getCoopTurnOutcome(players, result.enemy.currentHp, previous.excludedPlayerIds);
    if (outcome === "floor-clear") {
      if (previous.floorDamageTaken === 0) {
        for (const id of previous.playerIds) {
          if (players[id]!.currentHp > 0) {
            players[id] = applyPlayerStats(players[id]!, applyPerfectVictoryBuff(players[id]!.stats));
          }
        }
        previous = { ...previous, perfectVictoryFloor: previous.floor };
      }
      if (previous.floor >= ROGUELIKE_TOTAL_FLOORS) {
        publish({ ...previous, players, enemy: result.enemy, turnResult: synchronizedResult.turnResult, stage: "result", outcome: "cleared", status: "20層制覇！" });
      } else {
        openReward({ ...previous, players, enemy: result.enemy, turnResult: synchronizedResult.turnResult });
      }
      return;
    }
    if (outcome === "game-over") {
      publish({ ...previous, players, enemy: result.enemy, turnResult: synchronizedResult.turnResult, stage: "result", outcome: "game-over", status: "全員が戦闘不能になりました。" });
      return;
    }
    const nextPlayerId = getCoopNextPlayerId(
      players,
      actingPlayerId,
      result.nextPlayerId === actingPlayerId,
      previous.excludedPlayerIds,
    );
    const next: CoopSnapshot = {
      ...previous,
      players,
      enemy: result.enemy,
      turnResult: null,
      chargeMultiplier: result.chargeMultiplier,
      activePlayerId: nextPlayerId,
      stage: nextPlayerId !== actingPlayerId && getCoopAlivePlayerIds(players, previous.excludedPlayerIds).length === 2 ? "switching" : "battle",
      deadline: 0,
      status: `第${previous.floor}層`,
    };
    if (next.stage === "battle" && nextPlayerId) {
      next.deadline = Date.now() + getRoguelikeTurnSeconds(players[nextPlayerId]!) * 1000;
    }
    publish(next);
  }, [openReward, publish]);

  const finishPresentation = useCallback(() => {
    const current = snapshotRef.current;
    if (!props.isHost || !current || (current.stage !== "vs" && current.stage !== "resolving")) return;
    if (!isCoopPresentationComplete(current, presentationReadyRef.current)) return;
    if (current.stage === "vs") {
      if (current.floor === 20) {
        publish({ ...current, stage: "speech", deadline: Date.now() + 3000 });
      } else {
        publish(startCoopBattle(current, Date.now()));
      }
    } else if (resolutionDelayDoneRef.current && pendingResolutionRef.current && current.activePlayerId) {
      const result = pendingResolutionRef.current;
      pendingResolutionRef.current = null;
      resolvingRef.current = false;
      continueAfterTurn(result, current, current.activePlayerId);
    }
  }, [continueAfterTurn, props.isHost, publish]);

  useEffect(() => { continuePresentationRef.current = finishPresentation; }, [finishPresentation]);

  const completePresentation = useCallback((stage: "vs" | "resolving") => {
    const current = snapshotRef.current;
    if (!current || current.stage !== stage) return;
    if (isHost) {
      presentationReadyRef.current.add(props.localPlayerId);
      finishPresentation();
    } else {
      sendMessage({ type: "coop_presentation_complete", payload: {
        runId: current.runId, floor: current.floor, turn: current.turn, playerId: props.localPlayerId, stage,
      } });
    }
  }, [finishPresentation, isHost, props.localPlayerId, sendMessage]);
  const completePresentationRef = useRef(completePresentation);
  useEffect(() => { completePresentationRef.current = completePresentation; }, [completePresentation]);
  const handleVsComplete = useCallback(() => completePresentationRef.current("vs"), []);
  const handleTurnAnimationComplete = useCallback(() => completePresentationRef.current("resolving"), []);

  useEffect(() => {
    if (!isHost || !snapshot) return;
    if (snapshot.stage !== "switching" && snapshot.stage !== "transition" && snapshot.stage !== "speech") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = snapshot.stage === "switching"
      ? reducedMotion ? 0 : PLAYER_SWITCH_MS
      : Math.max(0, snapshot.deadline - Date.now());
    const timer = window.setTimeout(() => {
      const current = snapshotRef.current;
      if (!current || current.runId !== snapshot.runId || current.stage !== snapshot.stage) return;
      if (current.stage === "transition") {
        presentationReadyRef.current.clear();
        publish({ ...current, stage: "vs", deadline: 0 });
      } else {
        publish(startCoopBattle(current, Date.now()));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [isHost, publish, snapshot]);

  useEffect(() => {
    if (!snapshot || snapshot.stage === "vs" || snapshot.stage === "loading" || snapshot.stage === "transition") return;
    const bgmStage = snapshot.stage === "upgrading" ? "upgrade" : snapshot.stage === "result" ? "result" : "battle";
    const bgm = snapshot.enemy?.limitBreakActive ? LIMIT_BREAK_BGM_PATH : getRoguelikeStageBgm(bgmStage, snapshot.floor);
    if (bgm) soundManager.playBgm(bgm);
  }, [snapshot?.stage, snapshot?.floor, snapshot?.enemy?.limitBreakActive, snapshot]);

  useEffect(() => {
    if (snapshot?.stage !== "transition" || snapshot.floor !== 20 || !snapshot.enemy) return;
    const lines = getSinglePlayLimitBreakStatusLines(snapshot.enemy);
    setVisibleStatCount(1);
    const timers = lines.slice(1).map((_, index) => window.setTimeout(() => setVisibleStatCount(index + 2), (index + 1) * LIMIT_BREAK_STAT_REVEAL_INTERVAL_MS));
    return () => timers.forEach(window.clearTimeout);
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot?.perfectVictoryFloor) return;
    const timer = window.setTimeout(() => setDismissedPerfectFloor(snapshot.perfectVictoryFloor), 4000);
    return () => window.clearTimeout(timer);
  }, [snapshot?.perfectVictoryFloor]);

  const resolveAction = useCallback((current: CoopSnapshot, requestedAction: ActionType | null) => {
    const latest = snapshotRef.current;
    if (
      !props.isHost
      || resolvingRef.current
      || !latest
      || current.stage !== "battle"
      || latest.stage !== "battle"
      || latest.turn !== current.turn
      || latest.activePlayerId !== current.activePlayerId
      || latest.runId !== current.runId
      || !current.enemy
      || !current.activePlayerId
    ) return;
    const activeId = current.activePlayerId;
    const active = current.players[activeId];
    if (!active) return;
    resolvingRef.current = true;
    const skillEffects = buildCoopSkillEffects(current.acquiredSkills, activeId);
    const available = getCoopAvailableActions(active, current.floorTurn, active.lastActionCategory, skillEffects);
    const playerAction: ActionType = active.paralyzedNextTurn
      ? "paralysis"
      : requestedAction && available.includes(requestedAction)
        ? requestedAction
        : available[Math.floor(Math.random() * available.length)] ?? "attack";
    const enemyAction = current.enemy.paralyzedNextTurn
      ? "paralysis"
      : pickGhostCpuAction(current.enemy, current.floorTurn, {
          chargeAllowedHpRatio: current.floor === 5 ? FLOOR5_BOSS_CHARGE_HP_THRESHOLD : undefined,
          weights: getGhostCpuActionWeights(current.enemy.characterType),
        });
    const result = resolveCoopTurn({
      turn: current.floorTurn,
      players: current.players,
      enemy: current.enemy,
      activePlayerId: activeId,
      playerAction,
      enemyAction,
      chargeMultiplier: current.chargeMultiplier,
      excludedIds: current.excludedPlayerIds,
      playerIds: current.playerIds,
      weakMagicSelections: {
        [activeId]: { kinds: current.acquiredWeakMagicKinds[activeId] ?? [] },
        [current.enemy.id]: (caster) => ({ kinds: getEnemyWeakMagicKindsByType(caster.characterType) }),
      },
      skillEffects: { [activeId]: skillEffects },
      skillTurn: getCoopSkillTurn(current, activeId),
      disableVoidmination: true,
      ...(isWeakFloor(current.floor) ? {} : {
        roguelikeBossBattle: { floor: current.floor, bossId: current.enemy.id, playerId: activeId },
      }),
      ...(current.floor === 20 ? { damageCaps: { [activeId]: 999, [current.enemy.id]: 499 } } : {}),
    });
    const resolving: CoopSnapshot = {
      ...current,
      players: result.players,
      enemy: result.enemy,
      turnResult: result.turnResult,
      chargeMultiplier: playerAction === "charge" ? result.chargeMultiplier : current.chargeMultiplier,
      lastAttackerId: activeId,
      actedPlayerIds: [...new Set([...current.actedPlayerIds, activeId])],
      stage: "resolving",
      deadline: 0,
      floorDamageTaken: current.floorDamageTaken + result.turnResult.damageEvents.reduce(
        (sum, event) => sum + (event.to === activeId ? event.amount : 0), 0,
      ),
    };
    if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current);
    turnTimerRef.current = null;
    presentationReadyRef.current.clear();
    pendingResolutionRef.current = result;
    resolutionDelayDoneRef.current = false;
    publish(resolving);
    postTurnTimerRef.current = window.setTimeout(() => {
      postTurnTimerRef.current = null;
      const latest = snapshotRef.current;
      if (!latest || latest.runId !== current.runId || latest.stage !== "resolving") return;
      resolutionDelayDoneRef.current = true;
      continuePresentationRef.current?.();
    }, POST_TURN_DELAY_MS);
  }, [props.isHost, publish]);

  const chooseUpgrade = useCallback((current: CoopSnapshot, playerId: string, choiceIndex: number) => {
    if (!props.isHost || current.stage !== "upgrading" || current.rewardPlayerId !== playerId) return;
    const latest = snapshotRef.current;
    if (
      !latest
      || latest.runId !== current.runId
      || latest.stage !== "upgrading"
      || latest.floor !== current.floor
      || latest.rewardPlayerId !== playerId
      || latest.rewardPhase !== current.rewardPhase
    ) return;
    const activeSnapshot = latest;
    if (isCoopChoiceDisabled(activeSnapshot, playerId, choiceIndex)) return;
    const choice = activeSnapshot.upgradeChoices[choiceIndex];
    const player = activeSnapshot.players[playerId];
    if (!choice || !player) return;
    if (rewardTimerRef.current !== null) window.clearTimeout(rewardTimerRef.current);
    const upgraded = applyCoopUpgrade(activeSnapshot, playerId, choice);
    const nextReward = advanceCoopRewardPhase(upgraded, choiceIndex);
    if (nextReward) {
      publish({ ...nextReward, deadline: Date.now() + REWARD_SECONDS * 1000 });
      return;
    }
    const players = upgraded.players;
    let pendingRevivalId: string | null = null;
    if (
      choice.kind === "revival"
      && activeSnapshot.pendingRevivalId
      && !activeSnapshot.excludedPlayerIds.includes(activeSnapshot.pendingRevivalId)
    ) {
      pendingRevivalId = activeSnapshot.pendingRevivalId;
    }
    const prepared: CoopSnapshot = {
      ...upgraded,
      players,
      stage: "loading",
      pendingRevivalId,
      status: `第${current.floor + 1}層へ進みます`,
    };
    publish(prepared);
    void prepareFloor(
      prepared,
      activeSnapshot.floor + 1,
      players,
      pendingRevivalId,
      activeSnapshot.lastAttackerId ?? playerId,
      activeSnapshot.turn,
    );
  }, [prepareFloor, props.isHost, publish]);

  useEffect(() => {
    chooseUpgradeRef.current = chooseUpgrade;
  }, [chooseUpgrade]);

  useEffect(() => {
    if (!props.isHost || !snapshot || snapshot.stage !== "upgrading" || !snapshot.rewardPlayerId) return;
    if (rewardTimerRef.current !== null) window.clearTimeout(rewardTimerRef.current);
    rewardTimerRef.current = window.setTimeout(() => {
      const index = getCoopFirstSelectableChoiceIndex(snapshot);
      if (index >= 0) chooseUpgradeRef.current?.(snapshot, snapshot.rewardPlayerId!, index);
    }, Math.max(0, snapshot.deadline - Date.now()));
    return () => {
      if (rewardTimerRef.current !== null) window.clearTimeout(rewardTimerRef.current);
    };
  }, [props.isHost, snapshot]);

  useEffect(() => {
    if (!props.isHost || !snapshot || snapshot.stage !== "battle") return;
    const delay = Math.max(0, snapshot.deadline - Date.now());
    if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current);
    turnTimerRef.current = window.setTimeout(() => {
      resolveAction(snapshot, null);
    }, delay);
    return () => {
      if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current);
    };
  }, [props.isHost, resolveAction, snapshot]);

  useEffect(() => {
    if (!snapshot || (snapshot.stage !== "upgrading" && snapshot.stage !== "battle")) return;
    const update = () => setCountdown(Math.max(0, Math.ceil((snapshot.deadline - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 200);
    return () => window.clearInterval(interval);
  }, [snapshot]);

  useEffect(() => {
    const message = incomingMessage;
    if (!message) return;
    if (message.type === "coop_snapshot" && !isHost) {
      if (knownRunIdRef.current && message.payload.runId !== knownRunIdRef.current) {
        knownRunIdRef.current = message.payload.runId;
      }
      snapshotRef.current = message.payload;
      setSnapshot(message.payload);
      return;
    }
    const current = snapshotRef.current;
    if (message.type === "coop_redraw" && !isHost) {
      onRedraw();
      return;
    }
    if (!current || message.type === "coop_snapshot" || message.type === "coop_redraw" || message.payload.runId !== current.runId) return;
    if (
      message.type === "coop_presentation_complete"
      && isHost
      && message.payload.playerId === remotePlayerId
      && message.payload.floor === current.floor
      && message.payload.turn === current.turn
      && message.payload.stage === current.stage
    ) {
      presentationReadyRef.current.add(remotePlayerId);
      finishPresentation();
    } else if (
      message.type === "coop_action"
      && message.payload.playerId === remotePlayerId
      && message.payload.turn === current.turn
      && message.payload.playerId === current.activePlayerId
    ) {
      resolveAction(current, message.payload.action);
    } else if (
      message.type === "coop_upgrade"
      && message.payload.playerId === remotePlayerId
      && message.payload.floor === current.floor
      && message.payload.rewardPhase === current.rewardPhase
    ) {
      chooseUpgrade(current, message.payload.playerId, message.payload.choiceIndex);
    } else if (message.type === "coop_restart" && !isHost) {
      knownRunIdRef.current = message.payload.runId;
      snapshotRef.current = null;
      setSnapshot(null);
    }
  }, [chooseUpgrade, finishPresentation, incomingMessage, isHost, onRedraw, remotePlayerId, resolveAction]);

  useEffect(() => {
    if (!props.isHost || !props.peerDisconnected || !snapshot) return;
    const disconnectedId = snapshot.playerIds.find((id) => id !== props.localPlayerId);
    if (!disconnectedId || snapshot.excludedPlayerIds.includes(disconnectedId)) return;
    const excludedPlayerIds = [...snapshot.excludedPlayerIds, disconnectedId];
    const players = { ...snapshot.players, [disconnectedId]: { ...snapshot.players[disconnectedId]!, currentHp: 0 } };
    const update: CoopSnapshot = {
      ...snapshot,
      players,
      excludedPlayerIds,
      pendingRevivalId: snapshot.pendingRevivalId === disconnectedId ? null : snapshot.pendingRevivalId,
      upgradeChoices: snapshot.upgradeChoices.filter((choice) =>
        choice.kind !== "revival" || snapshot.pendingRevivalId !== disconnectedId,
      ),
      status: "相手が切断しました。1人で攻略を続けます。",
    };
    if (snapshot.stage === "upgrading" && getCoopAlivePlayerIds(players, excludedPlayerIds).length === 0) {
      clearTimers();
      publish({ ...update, stage: "result", outcome: "game-over", status: "全員が戦闘不能になりました。" });
      return;
    }
    if ((snapshot.stage === "battle" || snapshot.stage === "vs" || snapshot.stage === "speech" || snapshot.stage === "switching") && snapshot.activePlayerId === disconnectedId) {
      update.activePlayerId = props.localPlayerId;
      if (snapshot.stage === "battle") update.deadline = Date.now() + getRoguelikeTurnSeconds(players[props.localPlayerId]!) * 1000;
    }
    if (snapshot.stage === "upgrading" && snapshot.rewardPlayerId === disconnectedId) {
      if (snapshot.rewardPhase === 2) {
        void prepareFloor(update, update.floor + 1, players, null, update.lastAttackerId ?? props.localPlayerId, update.turn);
        return;
      }
      update.rewardPlayerId = props.localPlayerId;
      update.pendingRevivalId = null;
      update.upgradeChoices = buildCoopUpgradeChoices(update, props.localPlayerId, false);
      update.deadline = Date.now() + REWARD_SECONDS * 1000;
    }
    publish(update);
    finishPresentation();
  }, [clearTimers, finishPresentation, prepareFloor, props.isHost, props.localPlayerId, props.peerDisconnected, publish, snapshot]);

  useEffect(() => () => {
    clearTimers();
    soundManager.stopBgm();
  }, [clearTimers]);

  const sendAction = (action: ActionType) => {
    if (!snapshot || snapshot.stage !== "battle" || snapshot.activePlayerId !== props.localPlayerId) return;
    soundManager.playSe("/sounds/se/button.mp3");
    if (props.isHost) {
      resolveAction(snapshot, action);
    } else {
      props.sendMessage({
        type: "coop_action",
        payload: { runId: snapshot.runId, turn: snapshot.turn, playerId: props.localPlayerId, action },
      });
    }
  };

  const sendUpgrade = (choiceIndex: number) => {
    if (!snapshot || snapshot.stage !== "upgrading" || snapshot.rewardPlayerId !== props.localPlayerId) return;
    if (isCoopChoiceDisabled(snapshot, props.localPlayerId, choiceIndex)) return;
    if (props.isHost) {
      chooseUpgrade(snapshot, props.localPlayerId, choiceIndex);
    } else {
      props.sendMessage({
        type: "coop_upgrade",
        payload: { runId: snapshot.runId, floor: snapshot.floor, rewardPhase: snapshot.rewardPhase, playerId: props.localPlayerId, choiceIndex },
      });
    }
  };

  const restart = () => {
    if (!props.isHost) return;
    const runId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    props.sendMessage({ type: "coop_restart", payload: { runId } });
    startRun(runId);
  };

  const redraw = () => {
    if (!props.isHost || !snapshot) return;
    props.sendMessage({ type: "coop_redraw", payload: { runId: snapshot.runId } });
    props.onRedraw();
  };

  if (
    !snapshot
    || snapshot.stage === "loading"
    || (snapshot.stage !== "result" && (!snapshot.enemy || !snapshot.activePlayerId))
  ) {
    return (
      <section className="battle-manager-shell flex flex-col items-center justify-center gap-4 p-6 text-center text-amber-100">
        <h2 className="text-2xl font-bold">協力ローグライク</h2>
        <p>{snapshot?.status ?? "ホストから戦闘データを受信しています…"}</p>
      </section>
    );
  }

  if (snapshot.stage === "result") {
    const resultData = getCoopResultData(snapshot);
    return (
      <section className="battle-manager-shell flex flex-col items-center justify-center gap-5 p-6 text-center text-amber-100">
        <h2 className="text-3xl font-bold">{snapshot.status}</h2>
        <p>到達階層: 第{resultData.floorReached}層</p>
        <p>通しターン数: {resultData.totalTurn}</p>
        {props.isHost ? (
          <>
            <button className="title-menu-button" onClick={restart}>第1層から再戦</button>
            {!props.peerDisconnected && (
              <button className="title-menu-button" onClick={redraw}>描きなおして再戦</button>
            )}
            <button className="title-menu-button" onClick={props.onReturnToTitle}>タイトルへ戻る</button>
          </>
        ) : <p>ホストの再戦・終了操作を待っています</p>}
        {snapshot.perfectVictoryFloor !== null && dismissedPerfectFloor !== snapshot.perfectVictoryFloor && (
          <PerfectVictoryNotice floor={snapshot.perfectVictoryFloor} onDismiss={() => setDismissedPerfectFloor(snapshot.perfectVictoryFloor)} />
        )}
      </section>
    );
  }

  if (!snapshot.enemy || !snapshot.activePlayerId) return null;
  const activePlayer = snapshot.players[snapshot.activePlayerId];
  if (!activePlayer) return null;
  if (snapshot.stage === "transition") {
    return (
      <RoguelikeBossTransition
        kind={snapshot.floor === 19 ? "transform" : "limit-break"}
        bossUrl={snapshot.enemy.imageDataUrl}
        statusLines={getSinglePlayLimitBreakStatusLines(snapshot.enemy)}
        visibleStatCount={visibleStatCount}
      >
        {snapshot.perfectVictoryFloor !== null && dismissedPerfectFloor !== snapshot.perfectVictoryFloor && (
          <PerfectVictoryNotice floor={snapshot.perfectVictoryFloor} onDismiss={() => setDismissedPerfectFloor(snapshot.perfectVictoryFloor)} />
        )}
      </RoguelikeBossTransition>
    );
  }
  if (snapshot.stage === "vs") {
    return (
      <>
        <VsScreen me={activePlayer} enemy={snapshot.enemy} onComplete={handleVsComplete} />
        {snapshot.perfectVictoryFloor !== null && dismissedPerfectFloor !== snapshot.perfectVictoryFloor && (
          <PerfectVictoryNotice floor={snapshot.perfectVictoryFloor} onDismiss={() => setDismissedPerfectFloor(snapshot.perfectVictoryFloor)} />
        )}
      </>
    );
  }
  const isMyTurn = snapshot.activePlayerId === props.localPlayerId;
  const isResolving = snapshot.stage !== "battle";
  const turnCountdown = snapshot.stage === "battle"
    ? countdown
    : 0;
  const skillEffects = buildCoopSkillEffects(snapshot.acquiredSkills, activePlayer.id);
  const activeActions = getCoopAvailableActions(activePlayer, snapshot.floorTurn, activePlayer.lastActionCategory, skillEffects);

  return (
    <div className="battle-manager-shell" style={{ position: "relative" }}>
      <BattlePanel
        me={activePlayer}
        enemy={snapshot.enemy}
        role="host"
        turn={snapshot.floorTurn}
        turnResult={snapshot.turnResult}
        countdown={turnCountdown}
        onActionSelect={sendAction}
        isResolvingTurn={isResolving}
        playerInputEnabled={isMyTurn && snapshot.stage === "battle"}
        cooperativePlayers={snapshot.playerIds.map((id) => snapshot.players[id]!) as [PlayerBattleState, PlayerBattleState]}
        cooperativeActivePlayerId={snapshot.activePlayerId}
        cooperativeSwitching={snapshot.stage === "switching"}
        cooperativeChargeMultiplier={snapshot.chargeMultiplier}
        cooperativeStatusLabel={`第${snapshot.floor}層 / 層内ターン ${snapshot.floorTurn} / チャージ ×${snapshot.chargeMultiplier}`}
        onTurnAnimationComplete={handleTurnAnimationComplete}
        roguelikeWeakMagicTooltipTitle={buildWeakMagicTooltip(snapshot.acquiredWeakMagicKinds[activePlayer.id] ?? [])}
        roguelikeSkillLabels={buildRoguelikeSkillLabels(snapshot.acquiredSkills[activePlayer.id] ?? {}, activePlayer.roguelikeGutsUsed, snapshot.acquiredHealingSkills[activePlayer.id] ?? {})}
        roguelikeSkillEffects={skillEffects}
        availableActionsOverride={activeActions}
        onRematchSame={() => {}}
        onRematchRedraw={() => {}}
        showArenaBackground
          inactiveActionPrompt={`${activePlayer.nickname} が選んでいます`}
      />
      {snapshot.stage === "upgrading" && snapshot.rewardPlayerId && (
       <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
         <RoguelikeUpgradePanel
           floor={snapshot.floor}
           player={snapshot.players[snapshot.rewardPlayerId]!}
           acquiredSkills={snapshot.acquiredSkills[snapshot.rewardPlayerId] ?? {}}
           acquiredHealingSkills={snapshot.acquiredHealingSkills[snapshot.rewardPlayerId] ?? {}}
           choices={snapshot.upgradeChoices}
           choiceDisabledReason={(index) => getCoopChoiceDisabledReason(snapshot, snapshot.rewardPlayerId!, index)}
           pickedChoiceLabel={snapshot.rewardPhase === 2 && snapshot.rewardPlayerId !== props.localPlayerId ? "自分が選んだ枠" : undefined}
           onSelect={(_, index) => sendUpgrade(index)}
           countdown={countdown}
           waitingMessage={snapshot.rewardPlayerId === props.localPlayerId ? undefined : snapshot.status}
         />
       </div>
      )}
      {snapshot.stage === "speech" && (
       <div style={{ position: "fixed", bottom: "25%", right: "8%", zIndex: 60 }}>
         <BossSpeechBubble text="正々堂々闘おう" />
       </div>
      )}
      {snapshot.perfectVictoryFloor !== null && dismissedPerfectFloor !== snapshot.perfectVictoryFloor && (
       <PerfectVictoryNotice floor={snapshot.perfectVictoryFloor} onDismiss={() => setDismissedPerfectFloor(snapshot.perfectVictoryFloor)} />
      )}
      {snapshot.stage === "battle" && !isMyTurn && (
        <div role="status" className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded bg-slate-950/90 px-4 py-2 text-amber-100">
          {activePlayer.nickname} が選んでいます
        </div>
      )}
    </div>
  );
}
