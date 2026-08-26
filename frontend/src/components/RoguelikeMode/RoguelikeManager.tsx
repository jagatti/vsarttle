"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { VsScreen } from "@/components/Vs/VsScreen";
import { calculateFinalHpRatio, createMatchPlayerRecord } from "@/lib/matchBuilders";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { submitMatchRecord } from "@/lib/profileApi";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { soundManager } from "@/lib/soundManager";
import { getRoguelikeStageBgm } from "@/lib/vsTransition";
import { LIMIT_BREAK_BGM_PATH, LIMIT_BREAK_STAT_REVEAL_INTERVAL_MS, getSinglePlayLimitBreakStatusLines, getSinglePlayLimitBreakDisplayDurationMs } from "@/lib/singlePlayLimitBreak";
import {
  ROGUELIKE_PLAYER_INITIAL_STATS,
  ROGUELIKE_TOTAL_FLOORS,
  applyBossMultiplyUpgrade,
  applyBossUpgrade,
  applyUpgrade,
  buildWeakEnemyStats,
  isWeakFloor,
  type BossMultiplyKey,
  type UpgradeStatKey,
} from "@/lib/roguelikeEnemyStats";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";
import { healPlayerFully } from "@/lib/roguelikeTransition";
import { BossSpeechBubble } from "@/components/RoguelikeMode/BossSpeechBubble";
import { FLOOR5_BOSS_CHARGE_HP_THRESHOLD, pickGhostCpuAction } from "@/lib/ghostCpuAction";
import {
  buildWeakMagicTooltip,
  pickRoguelikeWeakFloorUpgradeSlots,
  type RoguelikeUpgradeRarity,
} from "@/lib/roguelikeUpgrades";
import type {
  ActionType,
  CharacterStats,
  CharacterType,
  DrawingData,
  PlayerBattleState,
  TurnResult,
  WeakMagicEffectKind,
} from "@/types/game";
import type { GhostRecord } from "@/lib/persistenceTypes";

const TURN_SECONDS = 30;
const PARALYSIS_TURN_SECONDS = 3;
const POST_TURN_DELAY_MS = 4200;
const PLAYER_BATTLE_ID = "rl-player";

type RlStage = "drawing" | "vs" | "battle" | "win" | "upgrade" | "result";

type UpgradeChoice =
  | { kind: "weak-stat"; rarity: 1 | 2; key: UpgradeStatKey; amount: number }
  | { kind: "weak-magic"; rarity: 3; effectKind: WeakMagicEffectKind; effectName: string }
  | { kind: "boss"; floor: number; label: string }
  | { kind: "boss-multiply"; key: BossMultiplyKey; label: string };

interface RunResultSummary {
  floorReached: number;
  cleared: boolean;
  winnerId: string | null;
  playerState: PlayerBattleState;
  enemyState: PlayerBattleState;
  turnCount: number;
  finalHpRatio: number;
}

const UPGRADE_LABELS: Record<UpgradeStatKey, string> = {
  hp: "HP",
  pp: "PP",
  attack: "攻撃",
  defense: "防御",
  speed: "速度",
  evasion: "回避",
};

function getBossUpgradeLabel(floor: number): string {
  if (floor === 5) return "攻撃 ×2";
  if (floor === 10) return "PP ×2";
  if (floor === 13) return "防御 ×2";
  if (floor === 16) return "HP ×2";
  return "強化";
}

const BOSS_MULTIPLY_LABELS: Record<BossMultiplyKey, string> = {
  hp: "HP ×2",
  defense: "防御 ×2",
  evasion: "回避 ×2",
};

function formatUpgradeAmount(key: UpgradeStatKey, amount: number): string {
  if (key === "evasion") return `+${Math.round(amount * 100)}%`;
  return `+${amount}`;
}

export function RoguelikeManager(props: { onBackToTitle: () => void; playerProfile: { playerId: string; nickname: string } }) {
  const [rlStage, setRlStage] = useState<RlStage>("drawing");
  const [floor, setFloor] = useState(1);
  const [playerStats, setPlayerStats] = useState<CharacterStats>(ROGUELIKE_PLAYER_INITIAL_STATS);
  const [playerCharacterType, setPlayerCharacterType] = useState<CharacterType | null>(null);
  const [playerDrawingDataUrl, setPlayerDrawingDataUrl] = useState<string | null>(null);
  const [battleState, setBattleState] = useState<Record<string, PlayerBattleState>>({});
  const [turnResult, setTurnResult] = useState<TurnResult | null>(null);
  const [battleFinish, setBattleFinish] = useState<{ winnerId: string } | null>(null);
  const [turn, setTurn] = useState(1);
  const [turnCountdown, setTurnCountdown] = useState(TURN_SECONDS);
  const [upgradeChoices, setUpgradeChoices] = useState<UpgradeChoice[]>([]);
  const [acquiredWeakMagicKinds, setAcquiredWeakMagicKinds] = useState<WeakMagicEffectKind[]>([]);
  const [runResult, setRunResult] = useState<RunResultSummary | null>(null);
  const [preparingFloor, setPreparingFloor] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roguelikeBossTransforming, setRoguelikeBossTransforming] = useState(false);
  const [roguelikeLimitBreaking, setRoguelikeLimitBreaking] = useState(false);
  const [roguelikeBossSpeechBubble, setRoguelikeBossSpeechBubble] = useState(false);
  const [roguelikeTransitionBossUrl, setRoguelikeTransitionBossUrl] = useState<string | null>(null);
  const [roguelikeLimitBreakStatusLines, setRoguelikeLimitBreakStatusLines] = useState<string[]>([]);
  const [visibleRoguelikeLimitBreakStatCount, setVisibleRoguelikeLimitBreakStatCount] = useState(0);

  const battleStateRef = useRef<Record<string, PlayerBattleState>>({});
  const turnRef = useRef(1);
  const floorRef = useRef(1);
  const playerStatsRef = useRef<CharacterStats>(ROGUELIKE_PLAYER_INITIAL_STATS);
  const playerCharacterTypeRef = useRef<CharacterType | null>(null);
  const playerDrawingRef = useRef<string | null>(null);
  const turnTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const postTurnTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const pendingActionRef = useRef<ActionType | null>(null);
  const pendingBattleStartRef = useRef<(() => void) | null>(null);
  const enemyBattleIdRef = useRef<string | null>(null);
  const recentOwnerIdsRef = useRef<string[]>([]);
  const submittedMatchRef = useRef(false);
  const retryActionRef = useRef<(() => void) | null>(null);
  const acquiredWeakMagicKindsRef = useRef<WeakMagicEffectKind[]>([]);

  useEffect(() => {
    battleStateRef.current = battleState;
  }, [battleState]);
  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);
  useEffect(() => {
    floorRef.current = floor;
  }, [floor]);
  useEffect(() => {
    playerStatsRef.current = playerStats;
  }, [playerStats]);
  useEffect(() => {
    playerCharacterTypeRef.current = playerCharacterType;
  }, [playerCharacterType]);
  useEffect(() => {
    playerDrawingRef.current = playerDrawingDataUrl;
  }, [playerDrawingDataUrl]);
  useEffect(() => {
    acquiredWeakMagicKindsRef.current = acquiredWeakMagicKinds;
  }, [acquiredWeakMagicKinds]);

  const currentEnemyState = useMemo(() => {
    const enemyId = enemyBattleIdRef.current;
    return enemyId ? battleState[enemyId] ?? null : null;
  }, [battleState]);
  const currentPlayerState = useMemo(() => battleState[PLAYER_BATTLE_ID] ?? null, [battleState]);

  const clearTimers = useCallback(() => {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (postTurnTimerRef.current) clearTimeout(postTurnTimerRef.current);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    turnTimerRef.current = null;
    countdownIntervalRef.current = null;
    postTurnTimerRef.current = null;
    transitionTimerRef.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    const bgmStage = rlStage === "vs" ? null : rlStage;
    const bgm = currentEnemyState?.limitBreakActive
      ? LIMIT_BREAK_BGM_PATH
      : bgmStage
      ? getRoguelikeStageBgm(bgmStage, floor)
      : null;
    if (bgm) {
      soundManager.playBgm(bgm);
      return;
    }
    soundManager.stopBgm();
  }, [currentEnemyState?.limitBreakActive, floor, rlStage]);

  // Reveal limit-break status lines one by one (mirrors SinglePlay behaviour).
  useEffect(() => {
    if (!roguelikeLimitBreaking) {
      setVisibleRoguelikeLimitBreakStatCount(0);
      return;
    }
    if (roguelikeLimitBreakStatusLines.length === 0) return;
    setVisibleRoguelikeLimitBreakStatCount(1);
    const revealTimers = roguelikeLimitBreakStatusLines.slice(1).map((_, index) =>
      window.setTimeout(() => {
        setVisibleRoguelikeLimitBreakStatCount(index + 2);
      }, (index + 1) * LIMIT_BREAK_STAT_REVEAL_INTERVAL_MS),
    );
    return () => {
      revealTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [roguelikeLimitBreaking, roguelikeLimitBreakStatusLines]);

  const startCountdown = useCallback((seconds: number = TURN_SECONDS) => {
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    const deadline = Date.now() + seconds * 1000;
    const update = () => {
      const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTurnCountdown(remain);
      if (remain <= 0 && countdownIntervalRef.current !== null) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
    update();
    countdownIntervalRef.current = window.setInterval(update, 200);
  }, []);

  async function fetchRoguelikeGhost(): Promise<GhostRecord> {
    const response = await fetch(`/api/ghosts/random?excludePlayerId=${encodeURIComponent(props.playerProfile.playerId)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`ghost fetch failed: ${response.status}`);
    const body = (await response.json()) as { ghost?: GhostRecord };
    if (!body.ghost) throw new Error("ghost not found");
    return body.ghost;
  }

  async function prepareFloor(targetFloor: number, nextPlayerStats: CharacterStats) {
    const drawing = playerDrawingRef.current;
    const characterType = playerCharacterTypeRef.current;
    if (!drawing || !characterType) return;

    setPreparingFloor(true);
    setLoadError(null);
    retryActionRef.current = () => {
      void prepareFloor(targetFloor, nextPlayerStats);
    };

    try {
      const playerState: PlayerBattleState = {
        id: PLAYER_BATTLE_ID,
        nickname: props.playerProfile.nickname,
        imageDataUrl: drawing,
        stats: nextPlayerStats,
        characterType,
        currentHp: nextPlayerStats.maxHp,
        currentPp: nextPlayerStats.maxPp,
        chargeMultiplier: 1,
        lastActionCategory: null,
      };

      let enemyState: PlayerBattleState;
      if (isWeakFloor(targetFloor)) {
        let ghost = await fetchRoguelikeGhost();
        const recent = recentOwnerIdsRef.current;
        if (ghost.ownerPlayerId && recent.includes(ghost.ownerPlayerId)) {
          const retryGhost = await fetchRoguelikeGhost();
          ghost = retryGhost;
        }
        if (ghost.ownerPlayerId) {
          recentOwnerIdsRef.current = [...recentOwnerIdsRef.current, ghost.ownerPlayerId].slice(-3);
        }
        const enemyStats = buildWeakEnemyStats(targetFloor, ghost.characterType);
        enemyState = {
          id: `rl-enemy-${targetFloor}`,
          nickname: `第${targetFloor}層のAnima`,
          imageDataUrl: ghost.drawingThumbnail,
          characterType: ghost.characterType,
          stats: enemyStats,
          currentHp: enemyStats.maxHp,
          currentPp: enemyStats.maxPp,
          chargeMultiplier: 1,
          lastActionCategory: null,
        };
      } else {
        enemyState = buildRoguelikeBossState(targetFloor);
      }

      const initial = { [playerState.id]: playerState, [enemyState.id]: enemyState };
      enemyBattleIdRef.current = enemyState.id;
      battleStateRef.current = initial;
      setBattleState(initial);
      setBattleFinish(null);
      setTurnResult(null);
      setTurn(1);
      turnRef.current = 1;
      setFloor(targetFloor);
      floorRef.current = targetFloor;
      pendingActionRef.current = null;
      pendingBattleStartRef.current = () => {
        setRlStage("battle");
        pendingBattleStartRef.current = null;
        startCountdown(TURN_SECONDS);
        scheduleAutoAction(1, initial, playerState.id, enemyState.id);
      };
      setRlStage("vs");
    } catch (error) {
      console.error("[RoguelikeManager] floor preparation failed:", error);
      setLoadError("敵データの取得に失敗しました。再試行してください。");
    } finally {
      setPreparingFloor(false);
    }
  }

  function finalizeRun(summary: RunResultSummary) {
    clearTimers();
    setRunResult(summary);
    setBattleFinish({ winnerId: summary.winnerId ?? "" });
    setRlStage("result");
  }

  function finalizeTurn(turnNumber: number, selectedAction: ActionType | null) {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    const currentBattle = structuredClone(battleStateRef.current);
    const playerId = PLAYER_BATTLE_ID;
    const enemyId = enemyBattleIdRef.current;
    if (!enemyId || !currentBattle[playerId] || !currentBattle[enemyId]) return;

    const me = currentBattle[playerId];
    const enemy = currentBattle[enemyId];
    const availableActions = getAvailableActions(me, turnNumber);
    const playerAction: ActionType = me.paralyzedNextTurn
      ? "paralysis"
      : selectedAction ?? availableActions[Math.floor(Math.random() * availableActions.length)] ?? "attack";
    pendingActionRef.current = null;

    const cpuAction: ActionType = enemy.paralyzedNextTurn
      ? "paralysis"
      : pickGhostCpuAction(enemy, turnNumber, {
          chargeAllowedHpRatio: floorRef.current === 5 ? FLOOR5_BOSS_CHARGE_HP_THRESHOLD : undefined,
        });

    const weakMagicPool = acquiredWeakMagicKindsRef.current;
    const result = resolveTurn({
      turn: turnNumber,
      players: currentBattle,
      actions: {
        [playerId]: playerAction,
        [enemyId]: cpuAction,
      },
      weakMagicSelections: {
        [playerId]: { kinds: weakMagicPool },
        [enemyId]: { kinds: ["paralysis", "barrierBan", "chargeBan"] },
      },
      disableVoidmination: true,
      ...(floorRef.current === 20 ? { damageCaps: { [playerId]: 999, [enemyId]: 499 } } : {}),
    });

    battleStateRef.current = result.nextStates;
    setBattleState(result.nextStates);
    setTurnResult(result);

    postTurnTimerRef.current = window.setTimeout(() => {
      const nextStates = result.nextStates;
      const nextPlayer = nextStates[playerId];
      const nextEnemy = nextStates[enemyId];
      if (!nextPlayer || !nextEnemy) return;

      if (nextEnemy.currentHp <= 0) {
        if (floorRef.current === ROGUELIKE_TOTAL_FLOORS) {
          finalizeRun({
            floorReached: floorRef.current,
            cleared: true,
            winnerId: playerId,
            playerState: nextPlayer,
            enemyState: nextEnemy,
            turnCount: turnNumber,
            finalHpRatio: calculateFinalHpRatio(playerId, nextStates),
          });
          return;
        }

        setBattleFinish({ winnerId: playerId });
        setTurnResult(result);

        // Floors 18 and 19 transition seamlessly to the next boss (no YOU WIN, no upgrade)
        if (floorRef.current === 18 || floorRef.current === 19) {
          startSeamlessNextBoss(floorRef.current + 1, nextPlayer);
          return;
        }

        // For weak floors and boss floors 5,10,13,16,17: show YOU WIN, then upgrade
        if (isWeakFloor(floorRef.current)) {
          const choices = pickRoguelikeWeakFloorUpgradeSlots(
            floorRef.current,
            acquiredWeakMagicKindsRef.current,
            3,
          ).map((slot): UpgradeChoice =>
            slot.kind === "stat"
              ? { kind: "weak-stat", rarity: slot.rarity, key: slot.key, amount: slot.amount }
              : {
                  kind: "weak-magic",
                  rarity: 3,
                  effectKind: slot.effectKind,
                  effectName: slot.effectName,
                },
          );
          setUpgradeChoices(choices);
          setRlStage("win");
          return;
        }

        if (floorRef.current === 17) {
          const choices: UpgradeChoice[] = (["hp", "defense", "evasion"] as BossMultiplyKey[]).map((key) => ({
            kind: "boss-multiply" as const,
            key,
            label: BOSS_MULTIPLY_LABELS[key],
          }));
          setUpgradeChoices(choices);
          setRlStage("win");
          return;
        }

        if ([5, 10, 13, 16].includes(floorRef.current)) {
          setUpgradeChoices([{ kind: "boss", floor: floorRef.current, label: getBossUpgradeLabel(floorRef.current) }]);
          setRlStage("win");
          return;
        }

        void prepareFloor(floorRef.current + 1, playerStatsRef.current);
        return;
      }

      if (nextPlayer.currentHp <= 0) {
        finalizeRun({
          floorReached: floorRef.current,
          cleared: false,
          winnerId: enemyId,
          playerState: nextPlayer,
          enemyState: nextEnemy,
          turnCount: turnNumber,
          finalHpRatio: calculateFinalHpRatio(enemyId, nextStates),
        });
        return;
      }

      const nextTurn = turnNumber + 1;
      setTurn(nextTurn);
      turnRef.current = nextTurn;
      const nextSeconds = nextPlayer.paralyzedNextTurn ? PARALYSIS_TURN_SECONDS : TURN_SECONDS;
      startCountdown(nextSeconds);
      scheduleAutoAction(nextTurn, nextStates, playerId, enemyId);
    }, POST_TURN_DELAY_MS);
  }

  function scheduleAutoAction(
    turnNumber: number,
    battle: Record<string, PlayerBattleState>,
    playerId: string,
    enemyId: string,
  ) {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    const delaySeconds = battle[playerId]?.paralyzedNextTurn ? PARALYSIS_TURN_SECONDS : TURN_SECONDS;
    turnTimerRef.current = window.setTimeout(() => {
      if (!battleStateRef.current[playerId] || !battleStateRef.current[enemyId]) return;
      finalizeTurn(turnNumber, pendingActionRef.current);
    }, delaySeconds * 1000);
  }

  function startSeamlessNextBoss(nextFloor: number, currentPlayer: PlayerBattleState) {
    clearTimers();

    if (nextFloor === 19) {
      // 18→19: show 変身 overlay, then heal player and start floor 19
      setRoguelikeBossTransforming(true);
      transitionTimerRef.current = window.setTimeout(() => {
        setRoguelikeBossTransforming(false);
        const healedPlayer = healPlayerFully(currentPlayer);
        const nextEnemy = buildRoguelikeBossState(19);
        const nextBattle = { [PLAYER_BATTLE_ID]: healedPlayer, [nextEnemy.id]: nextEnemy };
        enemyBattleIdRef.current = nextEnemy.id;
        battleStateRef.current = nextBattle;
        setBattleState(nextBattle);
        setBattleFinish(null);
        setTurnResult(null);
        setTurn(1);
        turnRef.current = 1;
        setFloor(19);
        floorRef.current = 19;
        pendingActionRef.current = null;
        setRlStage("battle");
        startCountdown(TURN_SECONDS);
        scheduleAutoAction(1, nextBattle, PLAYER_BATTLE_ID, nextEnemy.id);
      }, 2500);
      return;
    }

    if (nextFloor === 20) {
      // 19→20: show limit-break stat-reveal overlay (same as SinglePlay), then
      // transition to the battle panel where the speech bubble is overlaid.
      const boss20 = buildRoguelikeBossState(20);
      const statusLines = getSinglePlayLimitBreakStatusLines(boss20);
      setRoguelikeLimitBreakStatusLines(statusLines);
      setRoguelikeTransitionBossUrl(boss20.imageDataUrl);
      setRoguelikeLimitBreaking(true);
      const totalDuration = getSinglePlayLimitBreakDisplayDurationMs(statusLines.length);
      transitionTimerRef.current = window.setTimeout(() => {
        setRoguelikeLimitBreaking(false);
        // Set up the battle state so BattlePanel renders behind the speech bubble.
        const healedPlayer = healPlayerFully(currentPlayer);
        const nextBattle = { [PLAYER_BATTLE_ID]: healedPlayer, [boss20.id]: boss20 };
        enemyBattleIdRef.current = boss20.id;
        battleStateRef.current = nextBattle;
        setBattleState(nextBattle);
        setBattleFinish(null);
        setTurnResult(null);
        setTurn(1);
        turnRef.current = 1;
        setFloor(20);
        floorRef.current = 20;
        pendingActionRef.current = null;
        setRlStage("battle");
        setRoguelikeBossSpeechBubble(true);
        transitionTimerRef.current = window.setTimeout(() => {
          setRoguelikeBossSpeechBubble(false);
          setRoguelikeTransitionBossUrl(null);
          startCountdown(TURN_SECONDS);
          scheduleAutoAction(1, nextBattle, PLAYER_BATTLE_ID, boss20.id);
        }, 3000);
      }, totalDuration);
      return;
    }

    // Generic seamless transition (currently unused, kept as fallback)
    const nextEnemy = buildRoguelikeBossState(nextFloor);
    const cleanedPlayer: PlayerBattleState = {
      ...currentPlayer,
      chargeMultiplier: 1,
      lastActionCategory: null,
      chargedPreviousTurn: false,
      paralyzedNextTurn: false,
      tieBanActive: false,
      attackBanTurns: 0,
      barrierBanTurns: 0,
      chargeBanTurns: 0,
      magicBanTurns: 0,
    };
    const nextBattle = { [PLAYER_BATTLE_ID]: cleanedPlayer, [nextEnemy.id]: nextEnemy };
    enemyBattleIdRef.current = nextEnemy.id;
    battleStateRef.current = nextBattle;
    setBattleState(nextBattle);
    setBattleFinish(null);
    setTurnResult(null);
    setTurn(1);
    turnRef.current = 1;
    setFloor(nextFloor);
    floorRef.current = nextFloor;
    pendingActionRef.current = null;
    setRlStage("battle");
    startCountdown(TURN_SECONDS);
    scheduleAutoAction(1, nextBattle, PLAYER_BATTLE_ID, nextEnemy.id);
  }

  function handleVsComplete() {
    pendingBattleStartRef.current?.();
  }

  function handleDrawingSet(payload: { drawing: DrawingData; imageData: ImageData }) {
    soundManager.playSe("/sounds/se/button.mp3");
    // Player is always treated as "balanced" in roguelike mode (spec requirement)
    setPlayerCharacterType("balanced");
    setPlayerDrawingDataUrl(drawingToDataUrl(payload.drawing));
  }

  function handleStartRun() {
    if (!playerDrawingRef.current || !playerCharacterTypeRef.current) {
      soundManager.playSe("/sounds/se/ng.mp3");
      return;
    }
    soundManager.playSe("/sounds/se/button.mp3");
    submittedMatchRef.current = false;
    setRunResult(null);
    setAcquiredWeakMagicKinds([]);
    acquiredWeakMagicKindsRef.current = [];
    setPlayerStats(ROGUELIKE_PLAYER_INITIAL_STATS);
    playerStatsRef.current = ROGUELIKE_PLAYER_INITIAL_STATS;
    void prepareFloor(1, ROGUELIKE_PLAYER_INITIAL_STATS);
  }

  function handleActionSelect(action: ActionType) {
    if (pendingActionRef.current) return;
    pendingActionRef.current = action;
    finalizeTurn(turnRef.current, action);
  }

  function handleUpgradeSelect(choice: UpgradeChoice) {
    soundManager.playSe("/sounds/se/button.mp3");
    let nextStats = playerStatsRef.current;
    if (choice.kind === "weak-stat") {
      nextStats = applyUpgrade(playerStatsRef.current, choice.key, choice.amount);
    } else if (choice.kind === "weak-magic") {
      setAcquiredWeakMagicKinds((prev) => {
        if (prev.includes(choice.effectKind)) return prev;
        const next = [...prev, choice.effectKind];
        acquiredWeakMagicKindsRef.current = next;
        return next;
      });
    } else if (choice.kind === "boss-multiply") {
      nextStats = applyBossMultiplyUpgrade(playerStatsRef.current, choice.key);
    } else {
      nextStats = applyBossUpgrade(playerStatsRef.current, choice.floor);
    }
    setPlayerStats(nextStats);
    playerStatsRef.current = nextStats;
    setUpgradeChoices([]);
    void prepareFloor(floorRef.current + 1, nextStats);
  }

  useEffect(() => {
    if (!runResult || submittedMatchRef.current) return;
    submittedMatchRef.current = true;

    void (async () => {
      try {
        const players = await Promise.all([
          createMatchPlayerRecord({
            playerId: props.playerProfile.playerId,
            nickname: props.playerProfile.nickname,
            characterType: runResult.playerState.characterType,
            stats: runResult.playerState.stats,
            drawingSource: runResult.playerState.imageDataUrl,
          }),
          createMatchPlayerRecord({
            playerId: null,
            nickname: runResult.enemyState.nickname,
            characterType: runResult.enemyState.characterType,
            stats: runResult.enemyState.stats,
            drawingSource: runResult.enemyState.imageDataUrl,
          }),
        ]);

        await submitMatchRecord({
          match: {
            matchId: globalThis.crypto?.randomUUID?.() ?? `roguelike-${Date.now()}`,
            playedAt: new Date().toISOString(),
            battleMode: "simple",
            source: "roguelike",
            players,
            winnerId: runResult.winnerId,
            turnCount: runResult.turnCount,
            finalHpRatio: runResult.finalHpRatio,
            singlePlayResult: null,
            roguelikeResult: {
              floorReached: runResult.floorReached,
              cleared: runResult.cleared,
            },
            rating: null,
          },
        });
      } catch (error) {
        console.error("[RoguelikeManager] submitMatchRecord failed:", error);
        submittedMatchRef.current = false;
      }
    })();
  }, [props.playerProfile.nickname, props.playerProfile.playerId, runResult]);

  const finishButtonStyle: CSSProperties = {
    padding: "10px 18px",
    borderRadius: 10,
    fontWeight: "bold",
    fontSize: "clamp(13px, 1.1vw, 16px)",
    cursor: "pointer",
  };

  // ── Boss transformation overlay (18→19) ────────────────────────────────────
  if (roguelikeBossTransforming) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: "900",
            background:
              "linear-gradient(90deg, #f00, #f80, #ff0, #0f0, #08f, #80f, #f00)",
            backgroundSize: "300% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "rainbowShift 0.5s linear infinite",
          }}
        >
          ✨ 変身 ✨
        </div>
        <div style={{ color: "#fde68a", fontSize: 18, fontWeight: "bold" }}>
          ボスの姿が変化していく…
        </div>
      </div>
    );
  }

  // ── Limit break overlay (19→20) ─────────────────────────────────────────────
  if (roguelikeLimitBreaking) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          gap: 24,
          background: "rgba(80,0,0,0.5)",
        }}
      >
        <div
          style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: "900",
            color: "#ff2222",
            textShadow: "0 0 16px #ff0000, 0 0 32px #ff6600",
            animation: "rainbowShift 0.3s linear infinite",
            background:
              "linear-gradient(90deg, #f00, #f80, #f00, #f80, #f00)",
            backgroundSize: "300% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          💥 リミットブレイク 💥
        </div>
        <div style={{ color: "#fca5a5", fontSize: 18, fontWeight: "bold" }}>
          ステータスが激変した
        </div>
        {roguelikeTransitionBossUrl && (
          <div
            style={{
              position: "relative",
              width: 240,
              height: 240,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -16,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, #ff0040, #ff8a00, #fff200, #1dff7a, #00d4ff, #6a5cff, #ff00c8, #ff0040)",
                backgroundSize: "300% 300%",
                animation: "rainbowShift 0.7s linear infinite, limitBreakAuraPulse 1.8s ease-in-out infinite",
                filter: "blur(18px)",
                opacity: 0.95,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: 28,
                background:
                  "linear-gradient(135deg, #ff0040, #ff8a00, #fff200, #1dff7a, #00d4ff, #6a5cff, #ff00c8, #ff0040)",
                backgroundSize: "300% 300%",
                animation: "rainbowShift 0.7s linear infinite, limitBreakAuraPulse 1.8s ease-in-out infinite",
                boxShadow: "0 0 36px rgba(255,255,255,0.35)",
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={roguelikeTransitionBossUrl}
              alt="第20層のボス"
              style={{
                position: "relative",
                width: 220,
                height: 220,
                objectFit: "contain",
                borderRadius: 24,
                background: "rgba(0,0,0,0.35)",
                boxShadow: "0 0 30px rgba(255,255,255,0.25)",
              }}
            />
          </div>
        )}
        <div
          style={{
            color: "#fca5a5",
            fontSize: 15,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            textAlign: "center",
            border: "2px solid #ef4444",
            borderRadius: 10,
            padding: "12px 24px",
            background: "rgba(0,0,0,0.5)",
          }}
        >
          {roguelikeLimitBreakStatusLines.map((line, index) => {
            const isVisible = index < visibleRoguelikeLimitBreakStatCount;
            return (
              <div
                key={line}
                style={{
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? "translateY(0)" : "translateY(8px)",
                  transition: "opacity 500ms ease, transform 500ms ease",
                  minHeight: 22,
                }}
              >
                {isVisible ? line : "\u00a0"}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (preparingFloor) {
    return (
      <section className="rounded-lg border border-violet-500/40 bg-slate-900/60 p-6 text-center text-violet-100">
        <p className="text-lg font-bold">第{floorRef.current}層の敵を準備中…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-lg border border-rose-500/40 bg-slate-900/60 p-6 text-center text-rose-100">
        <p className="text-base font-bold">{loadError}</p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={() => {
              soundManager.playSe("/sounds/se/button.mp3");
              setLoadError(null);
              retryActionRef.current?.();
            }}
            className="rounded border border-violet-400 bg-violet-500/20 px-4 py-2 font-bold text-violet-100"
          >
            再試行
          </button>
          <button
            onClick={() => {
              soundManager.playSe("/sounds/se/button.mp3");
              props.onBackToTitle();
            }}
            className="rounded border border-slate-400 bg-slate-700/30 px-4 py-2 font-bold text-slate-100"
          >
            タイトルへ戻る
          </button>
        </div>
      </section>
    );
  }

  if (rlStage === "drawing") {
    return (
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <DrawPanel
            seconds={999999}
            noTimer
            onSet={handleDrawingSet}
            onComplete={() => {}}
          />
        </div>
        <div
          style={{
            display: "flex",
            minWidth: 180,
            flexDirection: "column",
            gap: 14,
            padding: "12px 0",
          }}
        >
          <div style={{ color: "#fde68a", fontWeight: "bold", textAlign: "center" }}>ローグライクモード</div>
          <div
            style={{
              height: 160,
              borderRadius: 12,
              border: `2px solid ${playerDrawingDataUrl ? "#8b5cf6" : "#374151"}`,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {playerDrawingDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={playerDrawingDataUrl} alt="プレイヤーの絵" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#fff" }} />
            ) : (
              <span style={{ color: "#6b7280", fontSize: 14 }}>「セット」で作品を登録</span>
            )}
          </div>
          <div style={{ color: "#d1d5db", fontSize: 12, textAlign: "center" }}>
            {playerCharacterType ? `タイプ: ${playerCharacterType}（固定）` : "絵をセットしてください"}
          </div>
          <div style={{ color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
            ステータスは固定で開始し、各階層クリア時の強化だけで成長します。
          </div>
          <button
            disabled={!playerDrawingDataUrl || !playerCharacterType}
            onClick={handleStartRun}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: playerDrawingDataUrl && playerCharacterType ? "2px solid #22c55e" : "2px solid #374151",
              background: playerDrawingDataUrl && playerCharacterType ? "rgba(6,60,20,0.9)" : "#1f2937",
              color: playerDrawingDataUrl && playerCharacterType ? "#86efac" : "#6b7280",
              fontWeight: "bold",
              cursor: playerDrawingDataUrl && playerCharacterType ? "pointer" : "not-allowed",
            }}
          >
            ⚔️ バトル開始
          </button>
          <button
            onClick={() => {
              soundManager.playSe("/sounds/se/button.mp3");
              props.onBackToTitle();
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "2px solid #6b7280",
              background: "rgba(30,30,30,0.9)",
              color: "#d1d5db",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            タイトルへ戻る
          </button>
        </div>
      </div>
    );
  }

  if (rlStage === "vs" && currentPlayerState && currentEnemyState) {
    return <VsScreen me={currentPlayerState} enemy={currentEnemyState} onComplete={handleVsComplete} />;
  }

  if ((rlStage === "battle" || rlStage === "win" || rlStage === "upgrade") && currentPlayerState && currentEnemyState) {
    const weakMagicTooltip = buildWeakMagicTooltip(acquiredWeakMagicKinds);
    const isOverlayVisible = rlStage === "win" || rlStage === "upgrade";
    const init = ROGUELIKE_PLAYER_INITIAL_STATS;
    const statsDisplay: { label: string; value: string }[] = [
      { label: "HP",   value: `${playerStats.maxHp}(+${playerStats.maxHp - init.maxHp})` },
      { label: "PP",   value: `${playerStats.maxPp}(+${playerStats.maxPp - init.maxPp})` },
      { label: "攻撃", value: `${playerStats.attack}(+${playerStats.attack - init.attack})` },
      { label: "防御", value: `${playerStats.defense}(+${playerStats.defense - init.defense})` },
      { label: "速度", value: `${playerStats.speed}(+${playerStats.speed - init.speed})` },
      { label: "回避", value: `${Math.round(playerStats.evasion * 100)}%(+${Math.round((playerStats.evasion - init.evasion) * 100)}%)` },
    ];
    const rarityMeta: Record<RoguelikeUpgradeRarity, { stars: string; color: string; label: string }> = {
      1: { stars: "★", color: "#2563eb", label: "★1" },
      2: { stars: "★★", color: "#16a34a", label: "★2" },
      3: { stars: "★★★", color: "#7c3aed", label: "★3" },
    };

    return (
      <div>
        <BattlePanel
          me={currentPlayerState}
          enemy={currentEnemyState}
          role="host"
          turn={turn}
          turnResult={turnResult}
          countdown={turnCountdown}
          onActionSelect={battleFinish ? () => {} : handleActionSelect}
          finishResult={battleFinish}
          onRematchSame={() => {}}
          onRematchRedraw={() => {}}
          showArenaBackground={true}
          suppressFinishOverlay={isOverlayVisible}
          roguelikeWeakMagicTooltipTitle={weakMagicTooltip}
        />
        {roguelikeBossSpeechBubble && (
          <div
            style={{
              position: "fixed",
              bottom: "25%",
              right: "8%",
              zIndex: 60,
            }}
          >
            <BossSpeechBubble text="正々堂々闘おう" />
          </div>
        )}
        {isOverlayVisible && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 70,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            {rlStage === "win" ? (
              <section className="w-full max-w-xl rounded-lg border border-green-500/40 bg-slate-900/95 p-6 text-center text-green-100">
                <div className="text-sm text-green-300">第{floor}層クリア！</div>
                <h2 className="mt-2 text-4xl font-black text-yellow-300">YOU WIN</h2>
                <div className="mt-6">
                  <button
                    onClick={() => {
                      soundManager.playSe("/sounds/se/button.mp3");
                      setRlStage("upgrade");
                    }}
                    style={{
                      padding: "12px 28px",
                      borderRadius: 10,
                      border: "2px solid #f59e0b",
                      background: "rgba(120,53,15,0.9)",
                      color: "#fde68a",
                      fontWeight: "bold",
                      fontSize: "clamp(14px, 1.2vw, 18px)",
                      cursor: "pointer",
                    }}
                  >
                    強化スロット選択
                  </button>
                </div>
              </section>
            ) : (
              <section className="w-full max-w-4xl rounded-lg border border-amber-500/40 bg-slate-900/95 p-6 text-amber-50">
                <div className="text-center">
                  <div className="text-sm text-amber-200">第{floor}層クリア！</div>
                  <h2 className="mt-2 text-2xl font-black">強化を選択</h2>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-slate-300">
                  {statsDisplay.map((s) => (
                    <span key={s.label} className="rounded bg-slate-800/60 px-2 py-1">
                      {s.label}{s.value}
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {upgradeChoices.map((choice, index) => {
                    const rarity = choice.kind === "weak-stat" || choice.kind === "weak-magic" ? choice.rarity : null;
                    const rarityStyle = rarity ? rarityMeta[rarity] : null;
                    return (
                      <button
                        key={`${choice.kind}-${index}`}
                        onClick={() => handleUpgradeSelect(choice)}
                        style={{
                          borderRadius: 14,
                          border: `2px solid ${rarityStyle?.color ?? "#f59e0b"}`,
                          background:
                            rarityStyle
                              ? `linear-gradient(135deg, ${rarityStyle.color}66, rgba(15,23,42,0.95))`
                              : "linear-gradient(135deg, rgba(120,53,15,0.85), rgba(217,119,6,0.25))",
                          padding: "20px 18px",
                          textAlign: "left",
                          cursor: "pointer",
                          boxShadow: `0 0 18px ${rarityStyle?.color ?? "#f59e0b"}55`,
                        }}
                      >
                        <div style={{ color: "#fde68a", fontSize: 12, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                          <span>
                            {choice.kind === "boss" ? "ボス撃破報酬" : choice.kind === "boss-multiply" ? "ボス撃破報酬(17層)" : "成長スロット"}
                          </span>
                          {rarityStyle && <span style={{ color: rarityStyle.color }}>{rarityStyle.stars}</span>}
                        </div>
                        <div style={{ color: "#fff7ed", fontSize: 22, fontWeight: 900, marginTop: 8 }}>
                          {choice.kind === "boss"
                            ? choice.label
                            : choice.kind === "boss-multiply"
                            ? choice.label
                            : choice.kind === "weak-magic"
                            ? `🪄 ${choice.effectName}`
                            : UPGRADE_LABELS[choice.key]}
                        </div>
                        <div style={{ color: "#fed7aa", fontSize: 14, marginTop: 8 }}>
                          {choice.kind === "boss" || choice.kind === "boss-multiply"
                            ? "クリックして強化を適用"
                            : choice.kind === "weak-magic"
                            ? `${rarityStyle?.label} 弱まほう効果を習得`
                            : `${rarityStyle?.label} ${formatUpgradeAmount(choice.key, choice.amount)}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    );
  }

  if (rlStage === "result") {
    return (
      <section className="rounded-lg border border-violet-500/40 bg-slate-900/60 p-6 text-center text-violet-100">
        <div className="text-sm text-violet-200">ローグライクモード結果</div>
        <h2 className="mt-2 text-3xl font-black text-white">
          {runResult?.cleared ? "20層制覇！" : `第${runResult?.floorReached ?? floor}層で力尽きた…`}
        </h2>
        <div className="mt-4 space-y-2 text-sm text-slate-200">
          <div>到達階層: 第{runResult?.floorReached ?? floor}層</div>
          <div>最終ステータス: HP {playerStats.maxHp} / PP {playerStats.maxPp} / 攻撃 {playerStats.attack} / 防御 {playerStats.defense} / 速度 {playerStats.speed} / 回避 {Math.round(playerStats.evasion * 100)}%</div>
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => {
              soundManager.playSe("/sounds/se/button.mp3");
              setRlStage("drawing");
              setFloor(1);
              floorRef.current = 1;
              setPlayerStats(ROGUELIKE_PLAYER_INITIAL_STATS);
              playerStatsRef.current = ROGUELIKE_PLAYER_INITIAL_STATS;
              setBattleState({});
              battleStateRef.current = {};
              setTurnResult(null);
              setBattleFinish(null);
              setUpgradeChoices([]);
              setAcquiredWeakMagicKinds([]);
              acquiredWeakMagicKindsRef.current = [];
              setRunResult(null);
              enemyBattleIdRef.current = null;
              recentOwnerIdsRef.current = [];
              pendingActionRef.current = null;
              submittedMatchRef.current = false;
            }}
            style={{
              ...finishButtonStyle,
              border: "2px solid #a855f7",
              background: "rgba(88,28,135,0.9)",
              color: "#f3e8ff",
            }}
          >
            もう一度遊ぶ
          </button>
          <button
            onClick={() => {
              soundManager.playSe("/sounds/se/button.mp3");
              props.onBackToTitle();
            }}
            style={{
              ...finishButtonStyle,
              border: "2px solid #6b7280",
              background: "rgba(30,30,30,0.9)",
              color: "#d1d5db",
            }}
          >
            タイトルへ戻る
          </button>
        </div>
      </section>
    );
  }

  return null;
}
