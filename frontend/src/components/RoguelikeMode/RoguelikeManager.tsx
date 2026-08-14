"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { VsScreen } from "@/components/Vs/VsScreen";
import { calculateFinalHpRatio, createMatchPlayerRecord } from "@/lib/matchBuilders";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { submitMatchRecord } from "@/lib/profileApi";
import { detectCharacterType } from "@/lib/statCalculator";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { soundManager } from "@/lib/soundManager";
import { getRoguelikeStageBgm } from "@/lib/vsTransition";
import { LIMIT_BREAK_BGM_PATH } from "@/lib/singlePlayLimitBreak";
import {
  ROGUELIKE_PLAYER_INITIAL_STATS,
  ROGUELIKE_TOTAL_FLOORS,
  applyBossUpgrade,
  applyUpgrade,
  buildWeakEnemyStats,
  getUpgradeAddAmounts,
  isWeakFloor,
  pickRandomUpgradeSlots,
  type UpgradeStatKey,
} from "@/lib/roguelikeEnemyStats";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";
import { FLOOR5_BOSS_CHARGE_HP_THRESHOLD, pickGhostCpuAction } from "@/lib/ghostCpuAction";
import type {
  ActionType,
  CharacterStats,
  CharacterType,
  DrawingData,
  PlayerBattleState,
  TurnResult,
} from "@/types/game";
import type { GhostRecord } from "@/lib/persistenceTypes";

const TURN_SECONDS = 30;
const PARALYSIS_TURN_SECONDS = 3;
const POST_TURN_DELAY_MS = 4200;
const PLAYER_BATTLE_ID = "rl-player";

type RlStage = "drawing" | "vs" | "battle" | "upgrade" | "result";

type UpgradeChoice =
  | { kind: "weak"; key: UpgradeStatKey; amount: number }
  | { kind: "boss"; floor: number; label: string };

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
  if (floor === 17) return "HP ×2 / 防御 ×2";
  return "強化";
}

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
  const [runResult, setRunResult] = useState<RunResultSummary | null>(null);
  const [preparingFloor, setPreparingFloor] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const battleStateRef = useRef<Record<string, PlayerBattleState>>({});
  const turnRef = useRef(1);
  const floorRef = useRef(1);
  const playerStatsRef = useRef<CharacterStats>(ROGUELIKE_PLAYER_INITIAL_STATS);
  const playerCharacterTypeRef = useRef<CharacterType | null>(null);
  const playerDrawingRef = useRef<string | null>(null);
  const turnTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const postTurnTimerRef = useRef<number | null>(null);
  const pendingActionRef = useRef<ActionType | null>(null);
  const pendingBattleStartRef = useRef<(() => void) | null>(null);
  const enemyBattleIdRef = useRef<string | null>(null);
  const recentOwnerIdsRef = useRef<string[]>([]);
  const submittedMatchRef = useRef(false);
  const retryActionRef = useRef<(() => void) | null>(null);

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

  const currentEnemyState = useMemo(() => {
    const enemyId = enemyBattleIdRef.current;
    return enemyId ? battleState[enemyId] ?? null : null;
  }, [battleState]);
  const currentPlayerState = useMemo(() => battleState[PLAYER_BATTLE_ID] ?? null, [battleState]);

  const clearTimers = useCallback(() => {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (postTurnTimerRef.current) clearTimeout(postTurnTimerRef.current);
    turnTimerRef.current = null;
    countdownIntervalRef.current = null;
    postTurnTimerRef.current = null;
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
          nickname: `${ghost.nickname}さんの作品`,
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

    const result = resolveTurn({
      turn: turnNumber,
      players: currentBattle,
      actions: {
        [playerId]: playerAction,
        [enemyId]: cpuAction,
      },
      disableVoidmination: true,
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

        if (isWeakFloor(floorRef.current)) {
          const amounts = getUpgradeAddAmounts(floorRef.current);
          const choices = pickRandomUpgradeSlots(floorRef.current).map((key) => ({
            kind: "weak" as const,
            key,
            amount: amounts[key],
          }));
          setUpgradeChoices(choices);
          setRlStage("upgrade");
          return;
        }

        if ([5, 10, 13, 16, 17].includes(floorRef.current)) {
          setUpgradeChoices([{ kind: "boss", floor: floorRef.current, label: getBossUpgradeLabel(floorRef.current) }]);
          setRlStage("upgrade");
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

  function handleVsComplete() {
    pendingBattleStartRef.current?.();
  }

  function handleDrawingSet(payload: { drawing: DrawingData; imageData: ImageData }) {
    soundManager.playSe("/sounds/se/button.mp3");
    setPlayerCharacterType(detectCharacterType(payload.imageData));
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
    const nextStats = choice.kind === "weak"
      ? applyUpgrade(playerStatsRef.current, choice.key, choice.amount)
      : applyBossUpgrade(playerStatsRef.current, choice.floor);
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
            {playerCharacterType ? `判定タイプ: ${playerCharacterType}` : "タイプ未確定"}
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

  if (rlStage === "battle" && currentPlayerState && currentEnemyState) {
    return (
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
      />
    );
  }

  if (rlStage === "upgrade") {
    return (
      <section className="rounded-lg border border-amber-500/40 bg-slate-900/60 p-6 text-amber-50">
        <div className="text-center">
          <div className="text-sm text-amber-200">第{floor}層クリア！</div>
          <h2 className="mt-2 text-2xl font-black">強化を選択</h2>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {upgradeChoices.map((choice, index) => (
            <button
              key={`${choice.kind}-${index}`}
              onClick={() => handleUpgradeSelect(choice)}
              style={{
                borderRadius: 14,
                border: "2px solid #f59e0b",
                background: "linear-gradient(135deg, rgba(120,53,15,0.85), rgba(217,119,6,0.25))",
                padding: "20px 18px",
                textAlign: "left",
                cursor: "pointer",
                boxShadow: "0 0 18px rgba(245,158,11,0.18)",
              }}
            >
              <div style={{ color: "#fde68a", fontSize: 12, fontWeight: 700 }}>
                {choice.kind === "boss" ? "ボス撃破報酬" : "成長スロット"}
              </div>
              <div style={{ color: "#fff7ed", fontSize: 22, fontWeight: 900, marginTop: 8 }}>
                {choice.kind === "boss" ? choice.label : UPGRADE_LABELS[choice.key]}
              </div>
              <div style={{ color: "#fed7aa", fontSize: 14, marginTop: 8 }}>
                {choice.kind === "boss" ? "クリックして強化を適用" : formatUpgradeAmount(choice.key, choice.amount)}
              </div>
            </button>
          ))}
        </div>
      </section>
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
