"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAvailableActions, getDamageMultiplier, magicCost } from "@/lib/battleLogic";
import { soundManager } from "@/lib/soundManager";
import type { ActionType, CharacterType, PlayerBattleState, TurnResult } from "@/types/game";
import {
  applyAnimationPhaseToDisplayResources,
  buildDisplayBattleResources,
  getTurnAnimationPhases,
} from "./battleAnimationPhases";

const ACTION_SE: Record<ActionType, string> = {
  attack: "/sounds/se/attack.mp3",
  magicWeak: "/sounds/se/magic_small.mp3",
  magicStrong: "/sounds/se/magic_big.mp3",
  barrier: "/sounds/se/barrier.mp3",
  charge: "/sounds/se/charge.mp3",
  paralysis: "",
};

const ACTION_LABELS: Record<ActionType, string> = {
  attack: "こうげき",
  magicWeak: "弱まほう",
  magicStrong: "強まほう",
  barrier: "バリア",
  charge: "チャージ",
  paralysis: "まひ",
};

const ACTION_COLORS: Record<ActionType, string> = {
  attack: "#dc2626",
  magicWeak: "#2563eb",
  magicStrong: "#7c3aed",
  barrier: "#ea580c",
  charge: "#16a34a",
  paralysis: "#6b7280",
};

// まひは自動付与される状態であり、プレイヤーが選択するボタンとしては表示しない。
const SELECTABLE_ACTIONS: ActionType[] = ["attack", "magicWeak", "magicStrong", "barrier", "charge"];

// Border colors for the name/HP/PP box, based on the character type detected from the drawing.
// こうげき型＝赤、まほう型＝青、バリア型（defense）＝オレンジ、バランス型＝グレー
const TYPE_BORDER_COLORS: Record<CharacterType, string> = {
  attack: "#ef4444",
  magic: "#3b82f6",
  defense: "#f97316",
  balanced: "#9ca3af",
};

const TYPE_LABELS: Record<CharacterType, string> = {
  attack: "こうげき型",
  magic: "まほう型",
  defense: "バリア型",
  balanced: "バランス型",
};

function getActionLabel(action: ActionType, player: PlayerBattleState): string {
  const cost = magicCost(action, player.stats);
  if (cost > 0) return `${ACTION_LABELS[action]}（-${cost}PP）`;
  return ACTION_LABELS[action];
}

const safeImageUrl = (value: string) => (value.startsWith("data:image/") ? value : "");

function HpBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ height: 12, background: "#111", borderRadius: 6, border: "2px solid #4b5563", overflow: "hidden", marginTop: 3 }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: `linear-gradient(to right, ${color}99, ${color})`,
          transition: "width 0.6s ease-in-out, background 0.3s",
          borderRadius: 6,
          boxShadow: `0 0 6px ${color}88`,
        }}
      />
    </div>
  );
}

function PpBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  return (
    <div style={{ height: 7, background: "#111", borderRadius: 4, border: "1px solid #374151", overflow: "hidden", marginTop: 2 }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: "linear-gradient(to right, #06b6d499, #06b6d4)",
          transition: "width 0.6s ease-in-out",
          borderRadius: 4,
        }}
      />
    </div>
  );
}

interface DamageFloater {
  id: number;
  amount: number;
  avoided: boolean;
  toMe: boolean;
  type: "damage" | "hpRecover" | "ppRecover";
}

function NameHpBox({ player, align }: { player: PlayerBattleState; align: "left" | "right" }) {
  const borderColor = TYPE_BORDER_COLORS[player.characterType];
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.55)",
        borderRadius: 10,
        border: `3px solid ${borderColor}`,
        padding: "6px 12px",
        minWidth: 150,
        textAlign: align,
        boxShadow: `0 0 10px ${borderColor}55`,
      }}
    >
      <div style={{ color: borderColor, fontWeight: "bold", fontSize: 10, marginBottom: 1 }}>
        （{TYPE_LABELS[player.characterType]}）
      </div>
      <div style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>{player.nickname}</div>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#d1fae5", fontSize: 11, marginTop: 3 }}>
        <span>HP</span>
        <span>
          {player.currentHp}/{player.stats.maxHp}
        </span>
      </div>
      <HpBar current={player.currentHp} max={player.stats.maxHp} />
      <div style={{ display: "flex", justifyContent: "space-between", color: "#a5f3fc", fontSize: 11, marginTop: 2 }}>
        <span>PP</span>
        <span>
          {player.currentPp}/{player.stats.maxPp}
        </span>
      </div>
      <PpBar current={player.currentPp} max={player.stats.maxPp} />
    </div>
  );
}

function PortraitBlock({
  player,
  label,
  floaters,
  isActing,
  isLoser,
  isShaking,
  revealedAction,
}: {
  player: PlayerBattleState;
  label: string;
  floaters: DamageFloater[];
  isActing?: boolean;
  isLoser?: boolean;
  isShaking?: boolean;
  revealedAction?: ActionType | null;
}) {
  const isCharged = player.chargeMultiplier > 1;
  const activeEffects: string[] = [];
  if (player.paralyzedNextTurn) activeEffects.push("まひ");
  if ((player.barrierBanTurns ?? 0) > 0) activeEffects.push("バリア禁止");
  if ((player.chargeBanTurns ?? 0) > 0) activeEffects.push("チャージ禁止");
  const imgAnimations = [
    isShaking ? "hitShake 0.5s ease-in-out, hitBlink 0.5s ease-in-out" : "",
    isCharged ? "chargeGlow 1.2s ease-in-out infinite" : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ color: "#fde68a", fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ position: "relative" }}>
        {floaters.map((f) => (
          <div
            key={f.id}
            style={{
              position: "absolute",
              top: -8,
              left: "50%",
              zIndex: 5,
              color: f.type === "hpRecover" ? "#22c55e" : f.type === "ppRecover" ? "#3b82f6" : f.avoided ? "#60a5fa" : "#f87171",
              fontWeight: "bold",
              fontSize: 22,
              textShadow: f.type === "hpRecover" ? "0 0 8px #22c55e" : f.type === "ppRecover" ? "0 0 8px #3b82f6" : f.avoided ? "0 0 8px #60a5fa" : "0 0 8px #f87171",
              animation: "floatUp 1.4s ease-out forwards",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {f.type === "hpRecover" ? `+${f.amount} HP` : f.type === "ppRecover" ? `+${f.amount} PP` : f.avoided ? "かいひ！" : `-${f.amount}`}
          </div>
        ))}
        {revealedAction && (
          <div
            style={{
              position: "absolute",
              top: -14,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 6,
              background: ACTION_COLORS[revealedAction],
              color: "#fff",
              fontWeight: "bold",
              fontSize: 13,
              padding: "3px 10px",
              borderRadius: 6,
              whiteSpace: "nowrap",
              boxShadow: "0 0 10px rgba(0,0,0,0.5)",
              animation: "fadeInScale 0.25s ease-out",
            }}
          >
            {ACTION_LABELS[revealedAction]}
          </div>
        )}
        <img
          src={safeImageUrl(player.imageDataUrl)}
          alt={`${player.nickname} のキャラクター`}
          style={{
            width: isCharged ? 124 : 110,
            height: isCharged ? 124 : 110,
            borderRadius: 8,
            border: `2px solid ${TYPE_BORDER_COLORS[player.characterType]}`,
            background: "#fff",
            objectFit: "contain",
            filter: isLoser ? "grayscale(100%)" : "none",
            boxShadow: isCharged ? "0 0 18px 6px #facc15cc" : "none",
            transition: "filter 1.8s ease-in-out, transform 0.3s, width 0.3s ease, height 0.3s ease, box-shadow 0.3s ease",
            transform: isActing ? "scale(1.06)" : "scale(1)",
            animation: imgAnimations || "none",
          }}
        />
      </div>
      {activeEffects.length > 0 && (
        <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          {activeEffects.map((name) => (
            <span
              key={name}
              style={{
                fontSize: 10,
                fontWeight: "bold",
                color: "#f87171",
                background: "rgba(0,0,0,0.6)",
                border: "1px solid #f87171",
                borderRadius: 4,
                padding: "1px 6px",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchupTable() {
  const chip = (t: ActionType) => (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 5,
        background: `${ACTION_COLORS[t]}33`,
        color: ACTION_COLORS[t],
        fontWeight: "bold",
        fontSize: 11,
        border: `1px solid ${ACTION_COLORS[t]}`,
      }}
    >
      {ACTION_LABELS[t]}
    </span>
  );
  return (
    <div
      style={{
        margin: "10px auto",
        background: "rgba(0,0,0,0.5)",
        borderRadius: 8,
        border: "1px solid #92400e",
        padding: "8px 12px",
        maxWidth: 420,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ color: "#fde68a", fontSize: 11, fontWeight: "bold", textAlign: "center", marginBottom: 2 }}>相性表</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {chip("attack")} <span style={{ color: "#fde68a" }}>➜</span> {chip("barrier")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {chip("magicWeak")} <span style={{ color: "#fde68a" }}>➜</span> {chip("attack")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {chip("barrier")} <span style={{ color: "#fde68a" }}>➜</span> {chip("magicWeak")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {chip("charge")} <span style={{ color: "#9ca3af" }}>：HP/PP回復</span>
        </span>
      </div>
    </div>
  );
}

function ActionButtonsRow({
  actions,
  player,
  selectedAction,
  onSelect,
  readOnly,
}: {
  actions: ActionType[];
  player: PlayerBattleState;
  selectedAction?: ActionType | null;
  onSelect?: (action: ActionType) => void;
  readOnly?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
      {SELECTABLE_ACTIONS.map((action) => {
        const canUse = actions.includes(action);
        const isSelected = selectedAction === action;
        const color = ACTION_COLORS[action];
        return (
          <button
            key={action}
            disabled={!!readOnly}
            onClick={() => {
              if (!canUse) {
                soundManager.playSe("/sounds/se/ng.mp3");
                return;
              }
              // わざ選択時はbuttonのSEのみ再生する。
              // わざ固有のSE（attack.mp3など）は実際にわざが発動するタイミングで再生する。
              soundManager.playSe("/sounds/se/button.mp3");
              onSelect?.(action);
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 7,
              border: `2px solid ${canUse ? color : "#374151"}`,
              background: canUse ? (isSelected ? color : `${color}28`) : "#1f2937",
              color: canUse ? (isSelected ? "#fff" : color) : "#6b7280",
              fontWeight: "bold",
              cursor: readOnly ? "default" : canUse ? "pointer" : "not-allowed",
              transition: "all 0.15s",
              transform: isSelected ? "scale(1.06)" : "scale(1)",
              boxShadow: isSelected ? `0 0 10px ${color}88` : "none",
              fontSize: 12,
              opacity: canUse ? 1 : 0.45,
              pointerEvents: readOnly ? "none" : "auto",
            }}
          >
            {getActionLabel(action, player)}
          </button>
        );
      })}
    </div>
  );
}

export function BattlePanel(props: {
  me: PlayerBattleState;
  enemy: PlayerBattleState;
  turn: number;
  turnResult: TurnResult | null;
  countdown: number;
  onActionSelect: (action: ActionType) => void;
  finishResult?: { winnerId: string } | null;
  onRematchSame: () => void;
  onRematchRedraw: () => void;
}) {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [floaters, setFloaters] = useState<DamageFloater[]>([]);
  const [showFlash, setShowFlash] = useState(false);
  const [actingPlayerId, setActingPlayerId] = useState<string | null>(null);
  const [showFinishButtons, setShowFinishButtons] = useState(false);
  const [revealedActions, setRevealedActions] = useState<Record<string, ActionType> | null>(null);
  const [shakingIds, setShakingIds] = useState<Set<string>>(new Set());
  const [displayResources, setDisplayResources] = useState(() => buildDisplayBattleResources([props.me, props.enemy]));
  const prevTurnRef = useRef<number | null>(null);
  const floaterIdRef = useRef(0);
  const availableActions = useMemo(() => getAvailableActions(props.me), [props.me]);
  const enemyAvailableActions = useMemo(() => getAvailableActions(props.enemy), [props.enemy]);
  const displayMe = displayResources[props.me.id] ?? { currentHp: props.me.currentHp, currentPp: props.me.currentPp };
  const displayEnemy = displayResources[props.enemy.id] ?? { currentHp: props.enemy.currentHp, currentPp: props.enemy.currentPp };

  const battleEnded = !!props.finishResult;
  const isFinished = battleEnded && (displayMe.currentHp <= 0 || displayEnemy.currentHp <= 0);
  const isWin = isFinished && props.finishResult!.winnerId === props.me.id;
  const myIsLoser = isFinished && !isWin;
  const enemyIsLoser = isFinished && isWin;

  useEffect(() => {
    setSelectedAction(null);
  }, [props.me.lastActionCategory, battleEnded]);

  useEffect(() => {
    if (props.turnResult) return;
    prevTurnRef.current = null;
    setDisplayResources({
      [props.me.id]: { currentHp: props.me.currentHp, currentPp: props.me.currentPp },
      [props.enemy.id]: { currentHp: props.enemy.currentHp, currentPp: props.enemy.currentPp },
    });
  }, [props.turnResult, props.me.id, props.me.currentHp, props.me.currentPp, props.enemy.id, props.enemy.currentHp, props.enemy.currentPp]);

  useEffect(() => {
    if (!props.turnResult) return;
    if (prevTurnRef.current === props.turnResult.turn) return;
    prevTurnRef.current = props.turnResult.turn;

    const turnResult = props.turnResult;
    const playersById = { [props.me.id]: props.me, [props.enemy.id]: props.enemy };
    const phases = getTurnAnimationPhases(turnResult, props.me, props.enemy);
    const timers: number[] = [];
    const schedule = (callback: () => void, delayMs: number) => {
      timers.push(window.setTimeout(callback, delayMs));
    };

    // Phase 1: reveal both players' chosen actions above their portraits for 2s
    setRevealedActions(turnResult.actions);

    const revealTimer = window.setTimeout(() => {
      setRevealedActions(null);

      // Phase 2: run damage/charge animation after the reveal disappears
      setShowFlash(true);
      schedule(() => setShowFlash(false), 600);

      // わざが実際に発動するタイミングでSEを再生する。
      const playActionSe = (playerId: string) => {
        const action = turnResult.actions[playerId];
        const sePath = action ? ACTION_SE[action] : "";
        if (sePath) soundManager.playSe(sePath);
      };

      const runPhase = (phaseIndex: number) => {
        const phase = phases[phaseIndex];
        if (!phase) return;

        setActingPlayerId(phase.actorId);
        playActionSe(phase.actorId);
        setDisplayResources((prev) => applyAnimationPhaseToDisplayResources(prev, playersById, phase));

        const phaseFloaters: DamageFloater[] = phase.damageEvents.map((event) => ({
          id: floaterIdRef.current++,
          amount: event.amount,
          avoided: event.avoided,
          toMe: event.to === props.me.id,
          type: "damage" as const,
        }));

        for (const chargeEvent of phase.chargeEvents) {
          const isMe = chargeEvent.playerId === props.me.id;
          if (chargeEvent.hpRecover > 0) {
            phaseFloaters.push({
              id: floaterIdRef.current++,
              amount: chargeEvent.hpRecover,
              avoided: false,
              toMe: isMe,
              type: "hpRecover",
            });
          }
          if (chargeEvent.ppRecover > 0) {
            phaseFloaters.push({
              id: floaterIdRef.current++,
              amount: chargeEvent.ppRecover,
              avoided: false,
              toMe: isMe,
              type: "ppRecover",
            });
          }
        }

        if (phaseFloaters.length > 0) {
          setFloaters((prev) => [...prev, ...phaseFloaters]);
          schedule(() => {
            const ids = new Set(phaseFloaters.map((floater) => floater.id));
            setFloaters((prev) => prev.filter((floater) => !ids.has(floater.id)));
          }, 1500);
        }

        const hitIds = new Set(phase.damageEvents.filter((event) => !event.avoided && event.amount > 0).map((event) => event.to));
        if (hitIds.size > 0) {
          setShakingIds(hitIds);
          schedule(() => setShakingIds(new Set()), 550);
        }
      };

      runPhase(0);
      schedule(() => runPhase(1), 850);
      schedule(() => {
        setActingPlayerId(null);
        setDisplayResources(buildDisplayBattleResources([turnResult.nextStates[props.me.id], turnResult.nextStates[props.enemy.id]]));
      }, 1700);
    }, 2000);

    return () => {
      clearTimeout(revealTimer);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [props.turnResult, props.me, props.enemy]);

  // Stop battle BGM and play win/lose SE when the battle ends
  const prevFinishedRef = useRef(false);
  useEffect(() => {
    if (isFinished && !prevFinishedRef.current) {
      soundManager.stopBgm();
      soundManager.playSe(isWin ? "/sounds/se/win.mp3" : "/sounds/se/lose.mp3");
    }
    prevFinishedRef.current = isFinished;
  }, [isFinished, isWin]);

  // Finish animation: show choice buttons after 5 seconds
  useEffect(() => {
    if (!isFinished) {
      setShowFinishButtons(false);
      return;
    }
    const timer = setTimeout(() => setShowFinishButtons(true), 5000);
    return () => clearTimeout(timer);
  }, [isFinished]);

  const countdown = props.countdown;
  const countdownColor = countdown <= 5 ? "#ef4444" : countdown <= 10 ? "#f59e0b" : "#fef3c7";
  const countdownPulse = countdown <= 5;
  const currentDamageMultiplier = getDamageMultiplier(props.turn);
  const upcomingDamageAnnouncement = (() => {
    const milestones = [
      { turn: 16, multiplier: 2 },
      { turn: 21, multiplier: 3 },
    ];
    for (const milestone of milestones) {
      const remain = milestone.turn - props.turn;
      if (remain >= 1 && remain <= 3) return `あと${remain}ターンで常時ダメージ${milestone.multiplier}倍`;
    }
    return null;
  })();

  return (
    <div style={{ position: "relative" }}>
      {/* Battle event flash */}
      {showFlash && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(255,255,255,0.85)",
            borderRadius: 12,
            animation: "battleFlash 0.6s ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Finish overlay: YOU WIN / YOU LOSE */}
      {isFinished && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            background: isWin ? "rgba(0,0,0,0.55)" : "rgba(0,0,20,0.70)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          {isWin ? (
            <div
              style={{
                fontSize: 60,
                fontWeight: "900",
                background: "linear-gradient(90deg, #f00, #f80, #ff0, #0f0, #08f, #80f, #f00)",
                backgroundSize: "300% 100%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "rainbowShift 1.2s linear infinite, youWinPulse 1.6s ease-in-out infinite",
                letterSpacing: "0.08em",
              }}
            >
              YOU WIN!
            </div>
          ) : (
            <div
              style={{
                fontSize: 60,
                fontWeight: "900",
                color: "#3b82f6",
                textShadow: "0 0 24px #3b82f6aa, 0 2px 8px #000",
                animation: "fadeInScale 0.5s ease-out, youLoseShake 0.6s ease-in-out 0.5s",
                letterSpacing: "0.08em",
              }}
            >
              YOU LOSE
            </div>
          )}

          {showFinishButtons && (
            <div
              style={{
                display: "flex",
                gap: 12,
                animation: "finishButtonsIn 0.5s ease-out",
              }}
            >
              <button
                onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); props.onRematchSame(); }}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "2px solid #22c55e",
                  background: "rgba(6,60,20,0.9)",
                  color: "#86efac",
                  fontWeight: "bold",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                再戦（絵を引き継ぐ）
              </button>
              <button
                onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); props.onRematchRedraw(); }}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "2px solid #fbbf24",
                  background: "rgba(120,60,0,0.9)",
                  color: "#fbbf24",
                  fontWeight: "bold",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                描きなおしてもう１戦
              </button>
            </div>
          )}
        </div>
      )}

      <section
        style={{
          background:
            "linear-gradient(to bottom, #1c0a00 0%, #3b1a00 20%, #6b3310 45%, #8b4513 55%, #5c2d0a 75%, #2d1205 100%)",
          borderRadius: 12,
          border: "3px solid #92400e",
          boxShadow: "0 6px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(251,191,36,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            background: "linear-gradient(to right, #0f0500, #3b1a00, #0f0500)",
            padding: "8px 16px",
            borderBottom: "2px solid #92400e",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "#fbbf24",
              fontWeight: "bold",
              fontSize: 17,
              textShadow: "0 0 8px #fbbf2488",
              letterSpacing: "0.05em",
            }}
          >
            ⚔️ バトル ターン {props.turn}
          </span>
          {upcomingDamageAnnouncement && (
            <span style={{ color: "#fde68a", fontWeight: "bold", fontSize: 12, textShadow: "0 0 8px #f59e0b99" }}>
              {upcomingDamageAnnouncement}
            </span>
          )}
        </div>

        {/* Name / HP / PP boxes, colored by character type */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px 0" }}>
          <NameHpBox player={{ ...props.me, ...displayMe }} align="left" />
          <NameHpBox player={{ ...props.enemy, ...displayEnemy }} align="right" />
        </div>

        {/* Portraits + timer */}
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "18px 14px 8px",
            alignItems: "center",
          }}
        >
          <PortraitBlock
            player={props.me}
            label="自身が作成した絵"
            floaters={floaters.filter((f) => f.toMe)}
            isActing={actingPlayerId === props.me.id}
            isLoser={myIsLoser}
            isShaking={shakingIds.has(props.me.id)}
            revealedAction={revealedActions ? revealedActions[props.me.id] : null}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              gap: 4,
            }}
          >
            {currentDamageMultiplier > 1 && (
              <div
                style={{
                  color: "#fde68a",
                  fontWeight: "bold",
                  fontSize: 13,
                  textShadow: "0 0 8px #f59e0b",
                  animation: "fadeInScale 0.25s ease-out, countdownPulse 1.2s ease-in-out infinite",
                  whiteSpace: "nowrap",
                }}
              >
                現在ダメージ{currentDamageMultiplier}倍中
              </div>
            )}
            <div
              style={{
                background: "#1c1206",
                border: "2px solid #92400e",
                borderRadius: 8,
                padding: "6px 12px",
                color: countdownColor,
                fontWeight: "bold",
                fontSize: 22,
                textShadow: countdown <= 5 ? "0 0 12px #ef4444" : "none",
                animation: countdownPulse ? "countdownPulse 0.8s ease-in-out infinite" : "none",
              }}
            >
              ⏱ {countdown}
            </div>
          </div>
          <PortraitBlock
            player={props.enemy}
            label="あいてが作成した絵"
            floaters={floaters.filter((f) => !f.toMe)}
            isActing={actingPlayerId === props.enemy.id}
            isLoser={enemyIsLoser}
            isShaking={shakingIds.has(props.enemy.id)}
            revealedAction={revealedActions ? revealedActions[props.enemy.id] : null}
          />
        </div>

        <MatchupTable />

        {/* Wood floor strip */}
        <div
          style={{
            height: 10,
            background:
              "repeating-linear-gradient(90deg, #5c3317 0px, #6b3a1a 50px, #7a4520 55px, #5c3317 100px)",
            borderTop: "2px solid #92400e",
            borderBottom: "2px solid #4a1a00",
          }}
        />

        {/* Turn result damage log */}
        {props.turnResult && !revealedActions && (
          <div
            style={{
              margin: "10px 14px 6px",
              background: "rgba(0,0,0,0.65)",
              borderRadius: 8,
              border: "1px solid #92400e",
              padding: "8px 12px",
              animation: "slideInFromBottom 0.4s ease-out",
            }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {props.turnResult.damageEvents.map((event, i) => (
                <li
                  key={`${event.from}-${event.to}-${i}`}
                  style={{
                    color: event.avoided ? "#93c5fd" : "#fca5a5",
                    fontSize: 12,
                    animation: `slideInFromLeft 0.35s ease-out ${i * 0.08}s both`,
                    display: "inline-block",
                  }}
                >
                  {event.avoided
                    ? `${event.to === props.me.id ? "あなた" : "あいて"} が回避！`
                    : `${event.to === props.me.id ? "あなた" : "あいて"} に ${event.amount} ダメージ（${event.reason}）`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action buttons (hidden while finished) */}
        {!battleEnded && (
          <div style={{ padding: "10px 14px 14px", display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <ActionButtonsRow
                actions={availableActions}
                player={props.me}
                selectedAction={selectedAction}
                readOnly={!!selectedAction}
                onSelect={(action) => {
                  if (selectedAction) return;
                  setSelectedAction(action);
                  props.onActionSelect(action);
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <ActionButtonsRow actions={enemyAvailableActions} player={props.enemy} readOnly />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
