"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getAvailableActions, getDamageMultiplier, magicCost } from "@/lib/battleLogic";
import { getEffectiveStats } from "@/lib/characterStats";
import { ENHANCEMENT_SLOT_META } from "@/lib/enhancementSlot";
import { safeImageUrl } from "@/lib/imageUrl";
import { soundManager } from "@/lib/soundManager";
import type { ActionType, CharacterType, EnhancementSlot, PlayerBattleState, TurnResult } from "@/types/game";
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

function HpBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ height: "clamp(8px, 1vw, 13px)", background: "#111", borderRadius: 6, border: "2px solid #4b5563", overflow: "hidden", marginTop: 3 }}>
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
    <div style={{ height: "clamp(5px, 0.65vw, 8px)", background: "#111", borderRadius: 4, border: "1px solid #374151", overflow: "hidden", marginTop: 2 }}>
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
        padding: "clamp(6px, 0.7vw, 9px) clamp(10px, 1.2vw, 16px)",
        minWidth: "clamp(130px, 15vw, 190px)",
        textAlign: align,
        boxShadow: `0 0 10px ${borderColor}55`,
      }}
    >
      <div style={{ color: borderColor, fontWeight: "bold", fontSize: "clamp(10px, 0.8vw, 12px)", marginBottom: 1 }}>
        （{TYPE_LABELS[player.characterType]}）
      </div>
      <div style={{ color: "#fff", fontWeight: "bold", fontSize: "clamp(13px, 1.2vw, 17px)" }}>{player.nickname}</div>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#d1fae5", fontSize: "clamp(10px, 0.8vw, 12px)", marginTop: 4 }}>
        <span>HP</span>
        <span>
          {player.currentHp}/{player.stats.maxHp}
        </span>
      </div>
      <HpBar current={player.currentHp} max={player.stats.maxHp} />
      <div style={{ display: "flex", justifyContent: "space-between", color: "#a5f3fc", fontSize: "clamp(9px, 0.75vw, 11px)", marginTop: 3 }}>
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
  enhancementSlot,
  enhancementAlign,
}: {
  player: PlayerBattleState;
  label: string;
  floaters: DamageFloater[];
  isActing?: boolean;
  isLoser?: boolean;
  isShaking?: boolean;
  revealedAction?: ActionType | null;
  enhancementSlot?: EnhancementSlot | null;
  enhancementAlign: "left" | "right";
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
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
  // Portrait size scales with BOTH viewport width and height (via vh), so it
  // shrinks to fit short browser windows too instead of only reacting to
  // width and forcing the page to scroll to reach the action buttons.
  const baseSize = "clamp(90px, min(13vw, 20vh), 190px)";
  const chargedSize = "clamp(100px, min(14.5vw, 22vh), 210px)";

  return (
    <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ color: "#fde68a", fontSize: "clamp(11px, 0.9vw, 13px)", marginBottom: 4 }}>{label}</div>
      <div style={{ position: "relative" }}>
        {floaters.map((f) => (
          <div
            key={f.id}
            style={{
              position: "absolute",
              top: -10,
              left: "50%",
              zIndex: 5,
              color: f.type === "hpRecover" ? "#22c55e" : f.type === "ppRecover" ? "#3b82f6" : f.avoided ? "#60a5fa" : "#f87171",
              fontWeight: "bold",
              fontSize: "clamp(15px, 1.6vw, 24px)",
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
              top: -18,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 6,
              background: ACTION_COLORS[revealedAction],
              color: "#fff",
              fontWeight: "bold",
              fontSize: "clamp(12px, 1vw, 15px)",
              padding: "4px 12px",
              borderRadius: 7,
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
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          onClick={() => setTooltipVisible((v) => !v)}
          style={{
            width: isCharged ? chargedSize : baseSize,
            height: isCharged ? chargedSize : baseSize,
            borderRadius: 12,
            border: `3px solid ${TYPE_BORDER_COLORS[player.characterType]}`,
            background: "#fff",
            objectFit: "contain",
            filter: isLoser ? "grayscale(100%)" : "none",
            boxShadow: isCharged ? "0 0 22px 8px #facc15cc" : "none",
            transition: "filter 1.8s ease-in-out, transform 0.3s, width 0.3s ease, height 0.3s ease, box-shadow 0.3s ease",
            transform: isActing ? "scale(1.06)" : "scale(1)",
            animation: imgAnimations || "none",
            cursor: "pointer",
          }}
        />
        {tooltipVisible && (() => {
          const s = getEffectiveStats(player);
          return (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: enhancementAlign === "left" ? 0 : undefined,
                right: enhancementAlign === "right" ? 0 : undefined,
                zIndex: 10,
                background: "rgba(0,0,0,0.88)",
                border: "1px solid #4b5563",
                borderRadius: 8,
                padding: "8px 12px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                fontSize: "clamp(11px, 0.9vw, 13px)",
                color: "#e5e7eb",
                lineHeight: 1.8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.7)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "#d1fae5" }}>HP(MAX)</span>
                <span>{s.maxHp}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "#a5f3fc" }}>PP(MAX)</span>
                <span>{s.maxPp}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "#fca5a5" }}>攻撃力</span>
                <span>{s.attack}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "#fdba74" }}>防御力</span>
                <span>{s.defense}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "#fde68a" }}>速度</span>
                <span>{s.speed}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "#c4b5fd" }}>回避</span>
                <span>{Math.round(s.evasion * 100)}%</span>
              </div>
            </div>
          );
        })()}
        {enhancementSlot && (
          <div
            title={ENHANCEMENT_SLOT_META[enhancementSlot].effectText}
            style={{
              position: "absolute",
              top: -12,
              left: enhancementAlign === "left" ? -12 : undefined,
              right: enhancementAlign === "right" ? -12 : undefined,
              width: 30,
              height: 30,
              borderRadius: 9999,
              border: "2px solid #fbbf24",
              background: "rgba(0,0,0,0.82)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              zIndex: 8,
              boxShadow: "0 0 10px rgba(251,191,36,0.5)",
            }}
          >
            {ENHANCEMENT_SLOT_META[enhancementSlot].icon}
          </div>
        )}
      </div>
      {activeEffects.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
          {activeEffects.map((name) => (
            <span
              key={name}
              style={{
                fontSize: "clamp(9px, 0.75vw, 12px)",
                fontWeight: "bold",
                color: "#f87171",
                background: "rgba(0,0,0,0.6)",
                border: "1px solid #f87171",
                borderRadius: 5,
                padding: "2px 8px",
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

function MatchupModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(to bottom, #1c0a00, #2d1205)",
          border: "2px solid #92400e",
          borderRadius: 16,
          padding: "clamp(14px, 2vw, 24px)",
          maxWidth: "clamp(300px, 55vw, 500px)",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
          boxShadow: "0 8px 40px rgba(0,0,0,0.85)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="閉じる"
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            background: "none",
            border: "1px solid #4b5563",
            borderRadius: 6,
            color: "#9ca3af",
            fontSize: "clamp(16px, 1.8vw, 22px)",
            cursor: "pointer",
            lineHeight: 1,
            padding: "2px 8px",
          }}
        >
          ×
        </button>

        {/* Title */}
        <div style={{ color: "#fbbf24", fontSize: "clamp(14px, 1.4vw, 18px)", fontWeight: "bold", textAlign: "center", marginBottom: 12, paddingRight: 30 }}>
          ⚔️ 相性表
        </div>

        {/* SVG Diagram */}
        <svg
          viewBox="0 0 400 295"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: "100%", display: "block" }}
        >
          <defs>
            <marker id="mArrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#fde68a" />
            </marker>
          </defs>

          {/* Arrow: こうげき → バリア (こうげきの勝ち) */}
          <path d="M 213,61 L 307,215" stroke="#fde68a" strokeWidth="2.5" fill="none" markerEnd="url(#mArrow)" />
          <text x="272" y="135" fill="#fde68a" fontSize="12" textAnchor="middle">勝ち</text>

          {/* Arrow: バリア → まほう (バリアの勝ち) */}
          <path d="M 265,238 L 135,238" stroke="#fde68a" strokeWidth="2.5" fill="none" markerEnd="url(#mArrow)" />
          <text x="200" y="258" fill="#fde68a" fontSize="12" textAnchor="middle">勝ち</text>

          {/* Arrow: まほう → こうげき (まほうの勝ち) */}
          <path d="M 93,215 L 187,61" stroke="#fde68a" strokeWidth="2.5" fill="none" markerEnd="url(#mArrow)" />
          <text x="128" y="135" fill="#fde68a" fontSize="12" textAnchor="middle">勝ち</text>

          {/* こうげき chip */}
          <rect x="155" y="24" width="90" height="28" rx="6" fill="#dc262633" stroke="#dc2626" strokeWidth="1.5" />
          <text x="200" y="43" textAnchor="middle" fill="#dc2626" fontWeight="bold" fontSize="14">こうげき</text>

          {/* まほう chip */}
          <rect x="35" y="224" width="90" height="28" rx="6" fill="#2563eb33" stroke="#2563eb" strokeWidth="1.5" />
          <text x="80" y="243" textAnchor="middle" fill="#93c5fd" fontWeight="bold" fontSize="14">まほう</text>

          {/* バリア chip */}
          <rect x="275" y="224" width="90" height="28" rx="6" fill="#ea580c33" stroke="#ea580c" strokeWidth="1.5" />
          <text x="320" y="243" textAnchor="middle" fill="#ea580c" fontWeight="bold" fontSize="14">バリア</text>

          {/* チャージ chip */}
          <rect x="155" y="142" width="90" height="28" rx="6" fill="#16a34a33" stroke="#16a34a" strokeWidth="1.5" />
          <text x="200" y="161" textAnchor="middle" fill="#16a34a" fontWeight="bold" fontSize="14">チャージ</text>
        </svg>

        {/* Game system description */}
        <div
          style={{
            borderTop: "1px solid #92400e",
            marginTop: 10,
            paddingTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 5,
            fontSize: "clamp(10px, 0.95vw, 13px)",
            color: "#d1d5db",
            lineHeight: 1.65,
          }}
        >
          <div>
            <span style={{ color: "#fde68a", fontWeight: "bold" }}>▶ 相性なしの場合：</span>
            素早さが高い方が先に攻撃する（同値の場合はランダム）
          </div>
          <div>
            <span style={{ color: "#16a34a", fontWeight: "bold" }}>▶ チャージ：</span>
            HP/PPが最大値の25%分回復し、次の攻撃系コマンド（こうげき・まほう・バリア）のダメージが1.5倍になる
          </div>
          <div>
            <span style={{ color: "#a78bfa", fontWeight: "bold" }}>▶ 弱まほう：</span>
            ダメージを与えた相手にランダムで状態異常の効果が付与される
          </div>
          <div>
            <span style={{ color: "#fde68a", fontWeight: "bold" }}>▶ ダメージ倍率：</span>
            16ターン目からダメージ2倍、21ターン目から3倍になる
          </div>
        </div>
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
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
              padding: "clamp(6px, 0.7vw, 9px) clamp(9px, 1.1vw, 14px)",
              borderRadius: 8,
              border: `2px solid ${canUse ? color : "#374151"}`,
              background: canUse ? (isSelected ? color : `${color}28`) : "#1f2937",
              color: canUse ? (isSelected ? "#fff" : color) : "#6b7280",
              fontWeight: "bold",
              cursor: readOnly ? "default" : canUse ? "pointer" : "not-allowed",
              transition: "all 0.15s",
              transform: isSelected ? "scale(1.06)" : "scale(1)",
              boxShadow: isSelected ? `0 0 10px ${color}88` : "none",
              fontSize: "clamp(11px, 0.95vw, 14px)",
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
  role: "host" | "guest";
  turn: number;
  turnResult: TurnResult | null;
  countdown: number;
  onActionSelect: (action: ActionType) => void;
  finishResult?: { winnerId: string } | null;
  onRematchSame: () => void;
  onRematchRedraw: () => void;
  /**
   * When provided, these nodes are shown as the finish-screen buttons instead of
   * the default multiplayer rematch buttons. Useful for single-play mode where the
   * post-battle choices differ (e.g. "次の層へ", "タイトルに戻る", "再開").
   */
  customFinishButtons?: ReactNode;
  /** Cumulative win/loss record against the current opponent (multiplayer only). */
  matchRecord?: { wins: number; losses: number };
  /** Called when the player wants to return to the title screen (multiplayer only). */
  onReturnToTitle?: () => void;
}) {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [floaters, setFloaters] = useState<DamageFloater[]>([]);
  const [showFlash, setShowFlash] = useState(false);
  const [actingPlayerId, setActingPlayerId] = useState<string | null>(null);
  const [showFinishButtons, setShowFinishButtons] = useState(false);
  const [revealedActions, setRevealedActions] = useState<Record<string, ActionType> | null>(null);
  const [showMatchupModal, setShowMatchupModal] = useState(false);
  const [shakingIds, setShakingIds] = useState<Set<string>>(new Set());
  const [displayResources, setDisplayResources] = useState(() => buildDisplayBattleResources([props.me, props.enemy]));
  // True while the turn-result reveal/damage animation is playing. Used to keep
  // the action buttons locked for the whole animation, not just until the
  // player's own selection is echoed back (see readOnly usage below).
  const [isAnimating, setIsAnimating] = useState(false);
  const prevTurnRef = useRef<number | null>(null);
  const floaterIdRef = useRef(0);
  // Derived directly at render time (not from isAnimating state, which is only set
  // inside a useEffect that runs *after* the browser paints). Without this, there is
  // a brief window right after a new turnResult arrives — before the effect below has
  // had a chance to run and flip isAnimating to true — where the buttons render as
  // unlocked. A click landing in that window can race with the next turn's
  // resolution and corrupt displayResources. Comparing turnResult.turn against
  // prevTurnRef.current here closes that window immediately on render.
  const pendingAnimation = !!props.turnResult && prevTurnRef.current !== props.turnResult.turn;
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

    // Lock action input for the whole reveal + damage animation sequence
    // (roughly 2000ms reveal + 1700ms of damage phases below), not just until
    // the player's own click is registered. Without this, a click landing
    // mid-animation could race with the next turn's resolution and corrupt
    // displayResources (see the cleanup handling below).
    setIsAnimating(true);

    const turnResult = props.turnResult;
    const playersById = { [props.me.id]: props.me, [props.enemy.id]: props.enemy };
    const phases = getTurnAnimationPhases(turnResult, props.me, props.enemy);
    const timers: number[] = [];
    const schedule = (callback: () => void, delayMs: number) => {
      timers.push(window.setTimeout(callback, delayMs));
    };
    // Tracks whether the final "snap to real values" step below has already
    // run, so the cleanup function can finish it immediately if this effect
    // is torn down early (e.g. a new turnResult arrives before the previous
    // turn's animation finished playing).
    let finalized = false;

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
        finalized = true;
        setActingPlayerId(null);
        setDisplayResources(buildDisplayBattleResources([turnResult.nextStates[props.me.id], turnResult.nextStates[props.enemy.id]]));
        setIsAnimating(false);
      }, 1700);
    }, 2000);

    return () => {
      clearTimeout(revealTimer);
      for (const timer of timers) clearTimeout(timer);

      // If this effect is torn down before the animation naturally finished
      // (e.g. the next turn's result arrived early), immediately snap
      // displayResources to this turn's real final values instead of leaving
      // them at a mid-animation intermediate value. Previously, cancelling
      // these timers here without applying their effect could leave
      // displayResources permanently out of sync with the real battle state,
      // making the HP/PP bars appear frozen for the rest of the match.
      if (!finalized) {
        setActingPlayerId(null);
        setRevealedActions(null);
        setShowFlash(false);
        setShakingIds(new Set());
        setDisplayResources(buildDisplayBattleResources([turnResult.nextStates[props.me.id], turnResult.nextStates[props.enemy.id]]));
        setIsAnimating(false);
      }
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
    // Note: no forced minHeight here (unlike a previous revision). Forcing the
    // panel to be at least 100vh tall caused the whole page to exceed the
    // viewport on typical browser window sizes, pushing the action buttons
    // below the fold and requiring a scroll to reach them. Instead, every
    // element below sizes itself with clamp()s that account for vh as well
    // as vw, so the layout naturally fits within the visible area.
    <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
      {/* Matchup modal */}
      {showMatchupModal && <MatchupModal onClose={() => setShowMatchupModal(false)} />}

      {/* Battle event flash */}
      {showFlash && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(255,255,255,0.85)",
            borderRadius: 14,
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
            borderRadius: 14,
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
                fontSize: "clamp(30px, 4.2vw, 60px)",
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
                fontSize: "clamp(30px, 4.2vw, 60px)",
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
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                animation: "finishButtonsIn 0.5s ease-out",
              }}
            >
              {/* Win/loss record (multiplayer only) */}
              {props.matchRecord && (
                <div
                  style={{
                    color: "#fbbf24",
                    fontWeight: "bold",
                    fontSize: "clamp(13px, 1.2vw, 16px)",
                    textShadow: "0 0 8px #fbbf2488",
                  }}
                >
                  対戦成績：{props.matchRecord.wins}勝 {props.matchRecord.losses}敗
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                {props.customFinishButtons ?? (
                  props.role === "host" ? (
                    <>
                      <button
                        onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); props.onRematchSame(); }}
                        style={{
                          padding: "clamp(8px, 1vw, 12px) clamp(14px, 1.8vw, 22px)",
                          borderRadius: 8,
                          border: "2px solid #22c55e",
                          background: "rgba(6,60,20,0.9)",
                          color: "#86efac",
                          fontWeight: "bold",
                          fontSize: "clamp(12px, 1.1vw, 15px)",
                          cursor: "pointer",
                        }}
                      >
                        再戦（絵を引き継ぐ）
                      </button>
                      <button
                        onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); props.onRematchRedraw(); }}
                        style={{
                          padding: "clamp(8px, 1vw, 12px) clamp(14px, 1.8vw, 22px)",
                          borderRadius: 8,
                          border: "2px solid #fbbf24",
                          background: "rgba(120,60,0,0.9)",
                          color: "#fbbf24",
                          fontWeight: "bold",
                          fontSize: "clamp(12px, 1.1vw, 15px)",
                          cursor: "pointer",
                        }}
                      >
                        描きなおしてもう１戦
                      </button>
                    </>
                  ) : (
                    <p style={{ color: "#fef3c7", fontWeight: "bold", fontSize: "clamp(12px, 1.1vw, 15px)" }}>ホストの選択を待っています…</p>
                  )
                )}
                {/* Title-return button (multiplayer only, shown for both host and guest) */}
                {props.onReturnToTitle && (
                  <button
                    onClick={props.onReturnToTitle}
                    style={{
                      padding: "clamp(8px, 1vw, 12px) clamp(14px, 1.8vw, 22px)",
                      borderRadius: 8,
                      border: "2px solid #6b7280",
                      background: "rgba(30,30,30,0.9)",
                      color: "#9ca3af",
                      fontWeight: "bold",
                      fontSize: "clamp(12px, 1.1vw, 15px)",
                      cursor: "pointer",
                    }}
                  >
                    タイトルへ戻る
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <section
        style={{
          background:
            "linear-gradient(to bottom, #1c0a00 0%, #3b1a00 20%, #6b3310 45%, #8b4513 55%, #5c2d0a 75%, #2d1205 100%)",
          borderRadius: 14,
          border: "3px solid #92400e",
          boxShadow: "0 6px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(251,191,36,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            background: "linear-gradient(to right, #0f0500, #3b1a00, #0f0500)",
            padding: "clamp(6px, 0.9vw, 10px) clamp(12px, 1.6vw, 20px)",
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
              fontSize: "clamp(14px, 1.5vw, 19px)",
              textShadow: "0 0 8px #fbbf2488",
              letterSpacing: "0.05em",
            }}
          >
            ⚔️ バトル ターン {props.turn}
          </span>
          {upcomingDamageAnnouncement && (
            <span style={{ color: "#fde68a", fontWeight: "bold", fontSize: "clamp(11px, 1vw, 13px)", textShadow: "0 0 8px #f59e0b99" }}>
              {upcomingDamageAnnouncement}
            </span>
          )}
          <button
            onClick={() => setShowMatchupModal(true)}
            style={{
              background: "rgba(146,64,14,0.35)",
              border: "1px solid #92400e",
              borderRadius: 6,
              color: "#fde68a",
              fontWeight: "bold",
              fontSize: "clamp(10px, 0.9vw, 13px)",
              cursor: "pointer",
              padding: "clamp(3px, 0.4vw, 5px) clamp(7px, 0.9vw, 11px)",
              whiteSpace: "nowrap",
            }}
          >
            相性表
          </button>
        </div>

        {/* Name / HP / PP boxes, colored by character type */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "clamp(8px, 1.1vw, 14px) clamp(12px, 1.6vw, 18px) 0" }}>
          <NameHpBox player={{ ...props.me, ...displayMe }} align="left" />
          <NameHpBox player={{ ...props.enemy, ...displayEnemy }} align="right" />
        </div>

        {/* Portraits + timer */}
        <div
          style={{
            display: "flex",
            gap: "clamp(8px, 1.2vw, 14px)",
            padding: "clamp(10px, 1.6vw, 18px) clamp(12px, 1.6vw, 18px) 8px",
            alignItems: "center",
            justifyContent: "center",
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
            enhancementSlot={props.me.enhancementSlot}
            enhancementAlign="left"
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              gap: 6,
            }}
          >
            {currentDamageMultiplier > 1 && (
              <div
                style={{
                  color: "#fde68a",
                  fontWeight: "bold",
                  fontSize: "clamp(11px, 1vw, 13px)",
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
                borderRadius: 10,
                padding: "clamp(6px, 0.9vw, 9px) clamp(10px, 1.5vw, 16px)",
                color: countdownColor,
                fontWeight: "bold",
                fontSize: "clamp(17px, 2vw, 24px)",
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
            enhancementSlot={props.enemy.enhancementSlot}
            enhancementAlign="right"
          />
        </div>

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
              margin: "10px clamp(12px, 1.6vw, 18px) 6px",
              background: "rgba(0,0,0,0.65)",
              borderRadius: 8,
              border: "1px solid #92400e",
              padding: "8px 14px",
              animation: "slideInFromBottom 0.4s ease-out",
            }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              {props.turnResult.damageEvents.map((event, i) => (
                <li
                  key={`${event.from}-${event.to}-${i}`}
                  style={{
                    color: event.avoided ? "#93c5fd" : "#fca5a5",
                    fontSize: "clamp(11px, 1vw, 13px)",
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
          <div style={{ padding: "10px clamp(12px, 1.6vw, 18px) 16px", display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <ActionButtonsRow
                actions={availableActions}
                player={props.me}
                selectedAction={selectedAction}
                readOnly={!!selectedAction || isAnimating || pendingAnimation}
                onSelect={(action) => {
                  if (selectedAction || isAnimating || pendingAnimation) return;
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
