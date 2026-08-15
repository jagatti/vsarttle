"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BattlePanel } from "@/components/Battle/BattlePanel";
import { DrawPanel } from "@/components/Draw/DrawPanel";
import { VsScreen } from "@/components/Vs/VsScreen";
import { calculateFinalHpRatio, createMatchPlayerRecord } from "@/lib/matchBuilders";
import { pickGhostCpuAction } from "@/lib/ghostCpuAction";
import { drawingToDataUrl, prepareDrawingForWire } from "@/lib/drawingWire";
import { submitMatchRecord } from "@/lib/profileApi";
import type { GhostRecord } from "@/lib/persistenceTypes";
import { getAvailableActions, resolveTurn } from "@/lib/battleLogic";
import { calculateStatsFromDrawing, detectCharacterType } from "@/lib/statCalculator";
import { soundManager } from "@/lib/soundManager";
import type { ActionType, PlayerBattleState, TurnResult, WireDrawingData } from "@/types/game";

type GhostMatchStage = "loading" | "drawing" | "vs" | "battle" | "error";

const TURN_SECONDS = 30;
const PARALYSIS_TURN_SECONDS = 3;
const POST_TURN_DELAY_MS = 4200;

export function GhostMatchManager(props: { onBackToTitle: () => void; playerProfile: { playerId: string; nickname: string } }) {
  const [stage, setStage] = useState<GhostMatchStage>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [ghost, setGhost] = useState<GhostRecord | null>(null);
  const [battleState, setBattleState] = useState<Record<string, PlayerBattleState>>({});
  const [turnResult, setTurnResult] = useState<TurnResult | null>(null);
  const [battleFinish, setBattleFinish] = useState<{ winnerId: string } | null>(null);
  const [turn, setTurn] = useState(1);
  const [turnCountdown, setTurnCountdown] = useState(TURN_SECONDS);

  const turnTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const postTurnTimerRef = useRef<number | null>(null);
  const pendingActionRef = useRef<ActionType | null>(null);
  const battleStateRef = useRef<Record<string, PlayerBattleState>>({});
  const turnRef = useRef(1);
  const playerBattleIdRef = useRef("ghost-player");
  const enemyBattleIdRef = useRef("ghost-enemy");
  const pendingBattleStartRef = useRef<(() => void) | null>(null);
  const submittedMatchRef = useRef(false);
  const previousDrawingRef = useRef<WireDrawingData | null>(null);

  const meState = useMemo(() => battleState[playerBattleIdRef.current], [battleState]);
  const enemyState = useMemo(() => battleState[enemyBattleIdRef.current], [battleState]);

  const clearTimers = useCallback(() => {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (postTurnTimerRef.current) clearTimeout(postTurnTimerRef.current);
    turnTimerRef.current = null;
    countdownIntervalRef.current = null;
    postTurnTimerRef.current = null;
  }, []);

  const startCountdown = useCallback((seconds: number) => {
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

  const fetchGhost = useCallback(async () => {
    setStage("loading");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/ghosts/random?excludePlayerId=${encodeURIComponent(props.playerProfile.playerId)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`ghost fetch failed: ${response.status}`);
      }
      const body = await response.json() as { ghost?: GhostRecord };
      if (!body.ghost) throw new Error("ghost not found");
      setGhost(body.ghost);
      setStage("drawing");
    } catch {
      setErrorMessage("ゴーストの取得に失敗しました。時間をおいて再度お試しください。");
      setStage("error");
    }
  }, [props.playerProfile.playerId]);

  useEffect(() => {
    void fetchGhost();
  }, [fetchGhost]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (stage === "drawing") {
      soundManager.playBgm("/sounds/bgm/oekaki_loop.mp3");
      return;
    }
    if (stage === "battle") {
      soundManager.playBgm("/sounds/bgm/battle_loop.mp3");
      return;
    }
    soundManager.stopBgm();
  }, [stage]);

  function finalizeTurn(turnNumber: number, selectedAction: ActionType | null) {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    const currentBattle = structuredClone(battleStateRef.current);
    const me = currentBattle[playerBattleIdRef.current];
    const enemy = currentBattle[enemyBattleIdRef.current];
    if (!me || !enemy) return;

    const availableActions = getAvailableActions(me, turnNumber);
    const playerAction = me.paralyzedNextTurn
      ? "paralysis"
      : selectedAction ?? availableActions[Math.floor(Math.random() * availableActions.length)] ?? "attack";
    pendingActionRef.current = null;
    const enemyAction = enemy.paralyzedNextTurn ? "paralysis" : pickGhostCpuAction(enemy, turnNumber);

    const result = resolveTurn({
      turn: turnNumber,
      players: currentBattle,
      actions: {
        [playerBattleIdRef.current]: playerAction,
        [enemyBattleIdRef.current]: enemyAction,
      },
      disableVoidmination: true,
    });

    battleStateRef.current = result.nextStates;
    setBattleState(result.nextStates);
    setTurnResult(result);
    postTurnTimerRef.current = window.setTimeout(() => {
      if (result.winnerId) {
        setBattleFinish({ winnerId: result.winnerId });
        return;
      }
      const nextTurn = turnNumber + 1;
      setTurn(nextTurn);
      turnRef.current = nextTurn;
      const nextSeconds = result.nextStates[playerBattleIdRef.current]?.paralyzedNextTurn
        ? PARALYSIS_TURN_SECONDS
        : TURN_SECONDS;
      startCountdown(nextSeconds);
      scheduleAutoAction(nextTurn, result.nextStates);
    }, POST_TURN_DELAY_MS);
  }

  function scheduleAutoAction(turnNumber: number, battle: Record<string, PlayerBattleState>) {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    const delaySeconds = battle[playerBattleIdRef.current]?.paralyzedNextTurn ? PARALYSIS_TURN_SECONDS : TURN_SECONDS;
    turnTimerRef.current = window.setTimeout(() => {
      finalizeTurn(turnNumber, pendingActionRef.current);
    }, delaySeconds * 1000);
  }

  const beginBattle = (player: PlayerBattleState, selectedGhost: GhostRecord) => {
    clearTimers();
    const enemyId = selectedGhost.ownerPlayerId ? `ghost-${selectedGhost.ownerPlayerId}` : `ghost-seed-${selectedGhost.seedId ?? "sample"}`;
    enemyBattleIdRef.current = enemyId;
    const enemyLabel = `${selectedGhost.nickname}さんの作品`;
    const enemy: PlayerBattleState = {
      id: enemyId,
      nickname: enemyLabel,
      imageDataUrl: selectedGhost.drawingThumbnail,
      characterType: selectedGhost.characterType,
      stats: selectedGhost.stats,
      currentHp: selectedGhost.stats.maxHp,
      currentPp: selectedGhost.stats.maxPp,
      chargeMultiplier: 1,
      lastActionCategory: null,
    };
    const initial = { [player.id]: player, [enemy.id]: enemy };
    battleStateRef.current = initial;
    setBattleState(initial);
    setTurnResult(null);
    setBattleFinish(null);
    setTurn(1);
    turnRef.current = 1;
    pendingActionRef.current = null;
    submittedMatchRef.current = false;
    pendingBattleStartRef.current = () => {
      setStage("battle");
      startCountdown(TURN_SECONDS);
      scheduleAutoAction(1, initial);
      pendingBattleStartRef.current = null;
    };
    setStage("vs");
  };

  const onDrawingComplete = (payload: { drawing: Parameters<typeof calculateStatsFromDrawing>[0]; imageData: ImageData }) => {
    if (!ghost) return;
    const wireDrawing = prepareDrawingForWire(payload.drawing);
    previousDrawingRef.current = wireDrawing;
    const stats = calculateStatsFromDrawing(payload.drawing, payload.imageData);
    const characterType = detectCharacterType(payload.imageData);
    const playerState: PlayerBattleState = {
      id: playerBattleIdRef.current,
      nickname: props.playerProfile.nickname,
      imageDataUrl: drawingToDataUrl(wireDrawing),
      characterType,
      stats,
      currentHp: stats.maxHp,
      currentPp: stats.maxPp,
      chargeMultiplier: 1,
      lastActionCategory: null,
    };
    beginBattle(playerState, ghost);
  };

  const onActionSelect = (action: ActionType) => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = action;
    finalizeTurn(turnRef.current, action);
  };

  const handleVsComplete = useCallback(() => {
    pendingBattleStartRef.current?.();
  }, []);

  useEffect(() => {
    if (!battleFinish || !ghost || !meState || !enemyState) return;
    if (submittedMatchRef.current) return;
    submittedMatchRef.current = true;
    void (async () => {
      try {
        const players = await Promise.all([
          createMatchPlayerRecord({
            playerId: props.playerProfile.playerId,
            nickname: props.playerProfile.nickname,
            characterType: meState.characterType,
            stats: meState.stats,
            drawingSource: meState.imageDataUrl,
          }),
          createMatchPlayerRecord({
            playerId: ghost.ownerPlayerId,
            nickname: ghost.nickname,
            characterType: enemyState.characterType,
            stats: enemyState.stats,
            drawingSource: enemyState.imageDataUrl,
          }),
        ]);

        const winnerId = battleFinish.winnerId === meState.id
          ? props.playerProfile.playerId
          : battleFinish.winnerId === enemyState.id
          ? ghost.ownerPlayerId
          : null;

        await submitMatchRecord({
          match: {
            matchId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
            playedAt: new Date().toISOString(),
            battleMode: "simple",
            source: "ghostmatch",
            players,
            winnerId,
            turnCount: turnRef.current,
            finalHpRatio: calculateFinalHpRatio(battleFinish.winnerId, battleStateRef.current),
            singlePlayResult: null,
            roguelikeResult: null,
            rating: null,
            ghostOpponentPlayerId: ghost.ownerPlayerId,
          },
        });
      } catch (err) {
        console.error("[GhostMatchManager] submitMatchRecord failed:", err);
        submittedMatchRef.current = false;
      }
    })();
  }, [battleFinish, enemyState, ghost, meState, props.playerProfile.nickname, props.playerProfile.playerId]);

  const finishButtonStyle: CSSProperties = {
    padding: "10px 18px",
    borderRadius: 8,
    fontWeight: "bold",
    fontSize: "clamp(12px, 1.1vw, 15px)",
    cursor: "pointer",
  };

  if (stage === "loading") {
    return (
      <section className="app-panel p-6 text-center" style={{ color: "var(--text-primary)" }}>
        <p className="text-lg font-bold">👻 ゴーストマッチ準備中…</p>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>このモードは過去プレイヤー作品とのCPU対戦です（対人戦ではありません）</p>
      </section>
    );
  }

  if (stage === "error") {
    return (
      <section className="rounded-lg border p-6 text-center" style={{ borderColor: "rgba(220,60,60,0.5)", background: "rgba(60,20,20,0.5)", color: "#e8a0a0" }}>
        <p className="text-base font-bold">{errorMessage}</p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); void fetchGhost(); }}
            className="btn-secondary"
          >
            再試行
          </button>
          <button
            onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); props.onBackToTitle(); }}
            className="btn-ghost"
          >
            タイトルへ戻る
          </button>
        </div>
      </section>
    );
  }

  if (stage === "drawing") {
    return (
      <div>
        <div className="app-panel mb-3 p-3" style={{ color: "var(--text-primary)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-bold">👻 ゴーストマッチ（CPU戦）</div>
            <button
              onClick={() => {
                soundManager.playSe("/sounds/se/button.mp3");
                props.onBackToTitle();
              }}
              className="btn-ghost"
            >
              タイトルへ戻る
            </button>
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>相手は他プレイヤーの過去作品です。Roomの対人戦ではありません。</div>
        </div>
        <DrawPanel
          seconds={999999}
          noTimer
          initialDrawing={previousDrawingRef.current ?? undefined}
          onComplete={onDrawingComplete}
        />
      </div>
    );
  }

  if (stage === "vs" && meState && enemyState) {
    return (
      <div>
        <div className="app-panel mb-3 p-3 text-sm" style={{ color: "var(--text-primary)" }}>
          相手は <span className="font-bold">{ghost?.nickname}さんの作品</span> を元にしたゴースト（CPU操作）です
        </div>
        <VsScreen me={meState} enemy={enemyState} onComplete={handleVsComplete} />
      </div>
    );
  }

  if (stage === "battle" && meState && enemyState) {
    const customFinishButtons = (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => {
            soundManager.playSe("/sounds/se/button.mp3");
            clearTimers();
            setBattleState({});
            void fetchGhost();
          }}
          style={{
            ...finishButtonStyle,
            border: "2px solid #a855f7",
            background: "rgba(88,28,135,0.9)",
            color: "#e9d5ff",
          }}
        >
          別のゴーストと対戦
        </button>
        <button
          onClick={() => {
            soundManager.playSe("/sounds/se/button.mp3");
            clearTimers();
            props.onBackToTitle();
          }}
          style={{
            ...finishButtonStyle,
            border: "2px solid #6b7280",
            background: "rgba(30,30,30,0.9)",
            color: "#d1d5db",
          }}
        >
          タイトルに戻る
        </button>
      </div>
    );

    return (
      <div>
        <div className="app-panel mb-3 p-3 text-xs" style={{ color: "var(--text-muted)" }}>
          ゴーストマッチはCPU戦のため、通常の対人戦績（勝敗/連勝）には反映されません。
        </div>
        <BattlePanel
          me={meState}
          enemy={enemyState}
          role="host"
          turn={turn}
          turnResult={turnResult}
          countdown={turnCountdown}
          onActionSelect={battleFinish ? () => {} : onActionSelect}
          finishResult={battleFinish}
          onRematchSame={() => {}}
          onRematchRedraw={() => {}}
          customFinishButtons={customFinishButtons}
          showArenaBackground={true}
        />
      </div>
    );
  }

  return null;
}
