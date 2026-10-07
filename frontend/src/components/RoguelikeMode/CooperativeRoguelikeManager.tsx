"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { CharacterImage } from "@/components/Battle/CharacterImage";
import {
  applyBossMultiplyUpgrade,
  applyUpgrade,
  buildWeakEnemyStats,
  getEnemyWeakMagicKindsByType,
  getUpgradeAddAmounts,
  isBossFloor,
  isWeakFloor,
  ROGUELIKE_PLAYER_INITIAL_STATS,
  ROGUELIKE_TOTAL_FLOORS,
} from "@/lib/roguelikeEnemyStats";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";
import { applyPlayerStats, carryOverPlayerState, healPlayerFully } from "@/lib/roguelikeTransition";
import { getRoguelikeBossUpgradeChoices } from "@/lib/roguelikeUpgrades";
import { FLOOR5_BOSS_CHARGE_HP_THRESHOLD, getGhostCpuActionWeights, pickGhostCpuAction } from "@/lib/ghostCpuAction";
import {
  COOP_ROGUELIKE_DAMAGE_SCALING,
  applyCoopRevivalCost,
  getCoopAvailableActions,
  getCoopAlivePlayerIds,
  getCoopNextPlayerId,
  getCoopRewardPlayerId,
  getCoopStartingPlayerId,
  getCoopTurnOutcome,
  resolveCoopTurn,
  reviveCoopPlayer,
  type CoopSnapshot,
  type CoopUpgradeChoice,
  type CoopWireMessage,
} from "@/lib/coopRoguelike";
import { soundManager } from "@/lib/soundManager";
import type { ActionType, CharacterStats, PlayerBattleState } from "@/types/game";

const TURN_SECONDS = 5;
const REWARD_SECONDS = 60;
const POST_TURN_ANIMATION_MS = 4200;
const PLAYER_SWITCH_MS = 2000;
const STAT_LABELS: Record<string, string> = {
  hp: "HP",
  pp: "PP",
  attack: "攻撃",
  defense: "防御",
  speed: "速度",
  evasion: "回避",
};

function getPlayerAfterUpgrade(
  player: PlayerBattleState,
  choice: CoopUpgradeChoice,
): PlayerBattleState {
  if (choice.kind === "stat") {
    return applyPlayerStats(player, applyUpgrade(player.stats, choice.key, choice.amount));
  }
  if (choice.kind === "boss-multiply") {
    const upgraded = applyPlayerStats(
      player,
      applyBossMultiplyUpgrade(player.stats, choice.key, choice.multiplier),
    );
    if (choice.healRatio === undefined) return upgraded;
    return {
      ...upgraded,
      currentHp: Math.min(upgraded.stats.maxHp, upgraded.currentHp + Math.ceil(upgraded.stats.maxHp * choice.healRatio)),
      currentPp: Math.min(upgraded.stats.maxPp, upgraded.currentPp + Math.ceil(upgraded.stats.maxPp * choice.healRatio)),
    };
  }
  return healPlayerFully(player);
}

function makeUpgradeChoices(floor: number, needsRevival: boolean): CoopUpgradeChoice[] {
  const bossChoices = getRoguelikeBossUpgradeChoices(floor).map((choice): CoopUpgradeChoice =>
    choice.kind === "full-heal"
      ? { kind: "full-heal", label: choice.label }
      : { ...choice },
  );
  let choices: CoopUpgradeChoice[] = bossChoices;
  if (choices.length === 0) {
    const amounts = getUpgradeAddAmounts(isWeakFloor(floor) ? floor : 15);
    const keys = Object.keys(amounts) as (keyof typeof amounts)[];
    for (let i = keys.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j]!, keys[i]!];
    }
    choices = keys.slice(0, 3).map((key) => ({
      kind: "stat",
      key,
      amount: amounts[key],
      label: `${STAT_LABELS[key]} +${key === "evasion" ? `${Math.round(amounts[key] * 100)}%` : amounts[key]}`,
    }));
  }
  if (needsRevival) {
    choices = [
      { kind: "revival" as const, label: "蘇生の儀式（現在HPの33%を消費）" },
      ...choices.filter((choice) => choice.kind !== "full-heal"),
    ].slice(0, 3);
  }
  return choices;
}

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
  const snapshotRef = useRef<CoopSnapshot | null>(null);
  const turnTimerRef = useRef<number | null>(null);
  const postTurnTimerRef = useRef<number | null>(null);
  const rewardTimerRef = useRef<number | null>(null);
  const chooseUpgradeRef = useRef<((current: CoopSnapshot, playerId: string, choiceIndex: number) => void) | null>(null);
  const resolvingRef = useRef(false);
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
      floor,
      turn: nextTurn,
      activePlayerId: starter,
      players,
      enemy: null,
      stage: "loading",
      turnResult: null,
      chargeMultiplier: 1,
      deadline: 0,
      pendingRevivalId: null,
      rewardPlayerId: null,
      upgradeChoices: [],
      outcome: null,
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
        stage: activePlayerId ? "battle" : "result",
        turn: nextTurn,
        deadline: Date.now() + TURN_SECONDS * 1000,
        outcome: activePlayerId ? null : "game-over",
        status: activePlayerId ? `第${floor}層` : "全員が戦闘不能になりました。",
      };
      publish(ready);
    } catch {
      const latest = snapshotRef.current;
      if (!latest || latest.runId !== current.runId || latest.floor !== floor || latest.stage !== "loading") return;
      publish({ ...loading, stage: "result", outcome: "game-over", status: "敵データの取得に失敗しました。タイトルへ戻ってください。" });
    }
  }, [publish]);

  const startRun = useCallback((runId: string) => {
    clearTimers();
    resolvingRef.current = false;
    knownRunIdRef.current = runId;
    const initial = {
      runId,
      floor: 1,
      turn: 1,
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
      upgradeChoices: [],
      outcome: null,
      status: "協力ローグライクを開始します",
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

  const openReward = useCallback((current: CoopSnapshot, attackerId: string) => {
    const boss = isBossFloor(current.floor);
    const rewardPlayerId = getCoopRewardPlayerId(current.players, current.floor, current.playerIds, {
      bossFloor: boss,
      lastAttackerId: attackerId,
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
    const upgradeChoices = makeUpgradeChoices(current.floor, !!deadAlly);
    const upgrade: CoopSnapshot = {
      ...current,
      stage: "upgrading",
      rewardPlayerId,
      upgradeChoices,
      pendingRevivalId: deadAlly ?? null,
      deadline: Date.now() + REWARD_SECONDS * 1000,
      status: boss ? "相手が報酬を選んでいます" : "相手が強化を選んでいます",
    };
    publish(upgrade);
    rewardTimerRef.current = window.setTimeout(
      () => chooseUpgradeRef.current?.(upgrade, rewardPlayerId, 0),
      REWARD_SECONDS * 1000,
    );
  }, [publish]);

  const continueAfterTurn = useCallback((result: ReturnType<typeof resolveCoopTurn>, previous: CoopSnapshot, actingPlayerId: string) => {
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
      if (previous.floor >= ROGUELIKE_TOTAL_FLOORS) {
        publish({ ...previous, players, enemy: result.enemy, turnResult: synchronizedResult.turnResult, stage: "result", outcome: "cleared", status: "20層制覇！" });
      } else {
        openReward({ ...previous, players, enemy: result.enemy, turnResult: synchronizedResult.turnResult }, actingPlayerId);
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
      turnResult: synchronizedResult.turnResult,
      chargeMultiplier: result.chargeMultiplier,
      activePlayerId: nextPlayerId,
      stage: "battle",
      turn: previous.turn + 1,
      deadline: Date.now() + TURN_SECONDS * 1000,
      status: `第${previous.floor}層`,
    };
    publish(next);
  }, [openReward, publish]);

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
    const available = getCoopAvailableActions(active, current.turn, active.lastActionCategory);
    const playerAction: ActionType = active.paralyzedNextTurn
      ? "paralysis"
      : requestedAction && available.includes(requestedAction)
        ? requestedAction
        : available[Math.floor(Math.random() * available.length)] ?? "attack";
    const enemyAction = current.enemy.paralyzedNextTurn
      ? "paralysis"
      : pickGhostCpuAction(current.enemy, current.turn, {
          chargeAllowedHpRatio: current.floor === 5 ? FLOOR5_BOSS_CHARGE_HP_THRESHOLD : undefined,
          weights: getGhostCpuActionWeights(current.enemy.characterType),
        });
    const result = resolveCoopTurn({
      turn: current.turn,
      players: current.players,
      enemy: current.enemy,
      activePlayerId: activeId,
      playerAction,
      enemyAction,
      chargeMultiplier: current.chargeMultiplier,
      excludedIds: current.excludedPlayerIds,
      playerIds: current.playerIds,
      weakMagicSelections: {
        [current.enemy.id]: (caster) => ({ kinds: getEnemyWeakMagicKindsByType(caster.characterType) }),
      },
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
      chargeMultiplier: result.chargeMultiplier,
      lastAttackerId: activeId,
      stage: "resolving",
      deadline: 0,
    } as CoopSnapshot;
    if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current);
    turnTimerRef.current = null;
    publish(resolving);
    postTurnTimerRef.current = window.setTimeout(() => {
      postTurnTimerRef.current = null;
      resolvingRef.current = false;
      const latest = snapshotRef.current;
      if (!latest || latest.runId !== current.runId || latest.stage !== "resolving") return;
      continueAfterTurn(result, latest, activeId);
    }, POST_TURN_ANIMATION_MS + PLAYER_SWITCH_MS);
  }, [continueAfterTurn, props.isHost, publish]);

  const chooseUpgrade = useCallback((current: CoopSnapshot, playerId: string, choiceIndex: number) => {
    if (!props.isHost || current.stage !== "upgrading" || current.rewardPlayerId !== playerId) return;
    const latest = snapshotRef.current;
    if (
      !latest
      || latest.stage !== "upgrading"
      || latest.floor !== current.floor
      || latest.rewardPlayerId !== playerId
    ) return;
    const activeSnapshot = latest;
    const choice = activeSnapshot.upgradeChoices[choiceIndex] ?? activeSnapshot.upgradeChoices[0];
    const player = activeSnapshot.players[playerId];
    if (!choice || !player) return;
    if (rewardTimerRef.current !== null) window.clearTimeout(rewardTimerRef.current);
    let players = { ...activeSnapshot.players, [playerId]: getPlayerAfterUpgrade(player, choice) };
    let pendingRevivalId: string | null = null;
    if (
      choice.kind === "revival"
      && activeSnapshot.pendingRevivalId
      && !activeSnapshot.excludedPlayerIds.includes(activeSnapshot.pendingRevivalId)
    ) {
      players = { ...players, [playerId]: applyCoopRevivalCost(players[playerId]!) };
      pendingRevivalId = activeSnapshot.pendingRevivalId;
    }
    const prepared: CoopSnapshot = {
      ...activeSnapshot,
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
      activeSnapshot.turn + 1,
    );
  }, [prepareFloor, props.isHost, publish]);

  useEffect(() => {
    chooseUpgradeRef.current = chooseUpgrade;
  }, [chooseUpgrade]);

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
    ) {
      chooseUpgrade(current, message.payload.playerId, message.payload.choiceIndex);
    } else if (message.type === "coop_restart" && !isHost) {
      knownRunIdRef.current = message.payload.runId;
      snapshotRef.current = null;
      setSnapshot(null);
    }
  }, [chooseUpgrade, incomingMessage, isHost, onRedraw, remotePlayerId, resolveAction]);

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
    if (snapshot.stage === "battle" && snapshot.activePlayerId === disconnectedId) {
      update.activePlayerId = props.localPlayerId;
      update.deadline = Date.now() + TURN_SECONDS * 1000;
    }
    if (snapshot.stage === "upgrading" && snapshot.rewardPlayerId === disconnectedId) {
      update.rewardPlayerId = props.localPlayerId;
      update.pendingRevivalId = null;
      update.deadline = Date.now() + REWARD_SECONDS * 1000;
      if (rewardTimerRef.current !== null) window.clearTimeout(rewardTimerRef.current);
      rewardTimerRef.current = window.setTimeout(
        () => chooseUpgradeRef.current?.(update, props.localPlayerId, 0),
        REWARD_SECONDS * 1000,
      );
    }
    publish(update);
  }, [props.isHost, props.localPlayerId, props.peerDisconnected, publish, snapshot]);

  useEffect(() => () => clearTimers(), [clearTimers]);

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
    if (props.isHost) {
      chooseUpgrade(snapshot, props.localPlayerId, choiceIndex);
    } else {
      props.sendMessage({
        type: "coop_upgrade",
        payload: { runId: snapshot.runId, floor: snapshot.floor, playerId: props.localPlayerId, choiceIndex },
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

  if (snapshot.stage === "upgrading") {
    const isRewardPlayer = snapshot.rewardPlayerId === props.localPlayerId;
    const isBossReward = isBossFloor(snapshot.floor);
    return (
      <section className="battle-manager-shell flex flex-col items-center justify-center gap-5 p-6 text-center text-amber-100">
        <h2 className="text-2xl font-bold">第{snapshot.floor}層クリア！</h2>
        {isRewardPlayer ? (
          <>
            <p>報酬を選択してください（残り {countdown} 秒）</p>
            <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
              {snapshot.upgradeChoices.map((choice, index) => (
                <button key={`${choice.kind}-${index}`} className="title-menu-button" onClick={() => sendUpgrade(index)}>
                  {choice.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p>{isBossReward ? "相手が報酬を選んでいます" : "相手が強化を選んでいます"}</p>
        )}
      </section>
    );
  }

  if (snapshot.stage === "result") {
    return (
      <section className="battle-manager-shell flex flex-col items-center justify-center gap-5 p-6 text-center text-amber-100">
        <h2 className="text-3xl font-bold">{snapshot.status}</h2>
        <p>到達階層: 第{snapshot.floor}層</p>
        {props.isHost ? (
          <>
            <button className="title-menu-button" onClick={restart}>第1層から再戦</button>
            {!props.peerDisconnected && (
              <button className="title-menu-button" onClick={redraw}>描きなおして再戦</button>
            )}
            <button className="title-menu-button" onClick={props.onReturnToTitle}>タイトルへ戻る</button>
          </>
        ) : <p>ホストの再戦・終了操作を待っています</p>}
      </section>
    );
  }

  if (!snapshot.enemy || !snapshot.activePlayerId) return null;
  const activePlayer = snapshot.players[snapshot.activePlayerId];
  const partnerId = snapshot.playerIds.find((id) => id !== snapshot.activePlayerId);
  const partner = partnerId ? snapshot.players[partnerId] : null;
  if (!activePlayer) return null;
  const isMyTurn = snapshot.activePlayerId === props.localPlayerId;
  const isResolving = snapshot.stage === "resolving";
  const turnCountdown = snapshot.stage === "battle"
    ? countdown
    : 0;
  const activeActions = getCoopAvailableActions(activePlayer, snapshot.turn, activePlayer.lastActionCategory);

  return (
    <div className="battle-manager-shell">
      {partner && (
        <div
          key={partner.id}
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 90,
            width: "min(32vw, 240px)",
            padding: 10,
            border: `2px solid ${partner.currentHp > 0 ? "#94a3b8" : "#6b7280"}`,
            borderRadius: 12,
            background: "rgba(2,6,23,0.9)",
            color: "#f8fafc",
            opacity: partner.currentHp > 0 ? 0.85 : 0.55,
            filter: partner.currentHp > 0 ? "none" : "grayscale(1)",
            transition: `transform ${PLAYER_SWITCH_MS}ms ease`,
            animation: `slideInFromLeft ${PLAYER_SWITCH_MS}ms ease-out both`,
          }}
          aria-label={`${partner.nickname} 待機中`}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CharacterImage
              src={partner.imageDataUrl}
              alt={`${partner.nickname}（待機中）`}
              style={{ width: 62, height: 62, objectFit: "contain", flexShrink: 0 }}
            />
            <div style={{ minWidth: 0, fontSize: 12 }}>
              <strong>{partner.nickname}（待機中）</strong>
              <div>HP {partner.currentHp}/{partner.stats.maxHp}</div>
              <div>PP {partner.currentPp}/{partner.stats.maxPp}</div>
            </div>
          </div>
        </div>
      )}
      <div key={snapshot.activePlayerId} style={{ animation: `slideInFromLeft ${PLAYER_SWITCH_MS}ms ease-out both` }}>
        <BattlePanel
        me={activePlayer}
        enemy={snapshot.enemy}
        role={props.isHost ? "host" : "guest"}
        turn={snapshot.turn}
        turnResult={snapshot.turnResult}
        countdown={turnCountdown}
        onActionSelect={sendAction}
        isResolvingTurn={isResolving}
        playerInputEnabled={isMyTurn || isResolving}
        availableActionsOverride={activeActions}
        onRematchSame={() => {}}
        onRematchRedraw={() => {}}
        showArenaBackground
          inactiveActionPrompt={`${activePlayer.nickname} が選んでいます`}
        />
      </div>
      {snapshot.stage === "battle" && !isMyTurn && (
        <div role="status" className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded bg-slate-950/90 px-4 py-2 text-amber-100">
          {activePlayer.nickname} が選んでいます
        </div>
      )}
      <div className="fixed right-3 top-3 z-50 rounded bg-slate-950/80 px-3 py-1 text-sm text-amber-100">
        第{snapshot.floor}層 / 通しターン {snapshot.turn} / チャージ ×{snapshot.chargeMultiplier}
      </div>
    </div>
  );
}
