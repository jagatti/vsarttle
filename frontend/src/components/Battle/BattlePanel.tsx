"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getAvailableActions, getDamageMultiplier, magicCost } from "@/lib/battleLogic";
import { getEffectiveStats } from "@/lib/characterStats";
import { ENHANCEMENT_SLOT_META } from "@/lib/enhancementSlot";
import { safeImageUrl } from "@/lib/imageUrl";
import { soundManager } from "@/lib/soundManager";
import type { ActionType, CharacterType, EnhancementSlot, PlayerBattleState, TurnResult } from "@/types/game";
import type { MoveMotionType } from "./battleAnimationPhases";
import {
  applyAnimationPhaseToDisplayResources,
  buildDisplayBattleResources,
  getTurnAnimationPhases,
} from "./battleAnimationPhases";
import { BarrierWallEffect, MagicBullet, getPortraitAnimation } from "./MoveMotionOverlay";
import { MATCHUP_TONE_COLORS, getMatchupCommentary } from "./matchupCommentary";

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
export const TYPE_BORDER_COLORS: Record<CharacterType, string> = {
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

export const VOIDMINATION_CUT_IN_DURATION_MS = 3900;
export const HEAVY_DAMAGE_HP_RATIO = 0.33;
export const HIT_FLASH_DURATION_MS = 180;
export const IMPACT_EFFECT_DURATION_MS = 520;
const SCREEN_SHAKE_DURATION_MS = 220;
const CHARGED_SCREEN_SHAKE_DURATION_MS = 360;

export function getVoidminationCutInOverlayStyle() {
  return {
    position: "absolute" as const,
    inset: 0,
    zIndex: 1000,
    backgroundImage: "url('/arttle_back/shihai.png')",
    backgroundSize: "cover" as const,
    backgroundPosition: "center" as const,
    animation: "fadeInScale 0.3s ease-out",
    pointerEvents: "none" as const,
  };
}

export function getVoidminationTooltipEvasionDisplay(evasion: number, voidminationActive: boolean) {
  return voidminationActive
    ? { color: "#ef4444", text: "0%" }
    : { color: "#c4b5fd", text: `${Math.round(evasion * 100)}%` };
}

export function shouldResetBattlePanelTransientState(
  turn: number,
  turnResult: TurnResult | null,
  meVoidminationActive?: boolean,
  enemyVoidminationActive?: boolean,
) {
  return turn === 1 && !turnResult && !meVoidminationActive && !enemyVoidminationActive;
}

function getActionLabel(action: ActionType, player: PlayerBattleState): string {
  const cost = magicCost(action, player.stats);
  if (cost > 0) return `${ACTION_LABELS[action]}（-${cost}PP）`;
  return ACTION_LABELS[action];
}

function HpBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";
  const critical = pct <= 25;
  return (
    <div
      style={{
        position: "relative",
        height: "clamp(13px, 1.5vw, 19px)",
        background: "#0b0d14",
        borderRadius: 999,
        border: "3px solid #f8fafc",
        overflow: "hidden",
        marginTop: 4,
        boxShadow: critical ? "0 0 12px rgba(239,68,68,0.75)" : "0 2px 0 rgba(0,0,0,0.5)",
      }}
    >
      {/* 削れバー: 減った分を少し遅れて追いかけ、「今どれだけ削られたか」を見せる */}
      <div
        className="hp-ghost-bar"
        style={{
          position: "absolute",
          inset: 0,
          width: `${pct}%`,
          background: "#fde68a",
          borderRadius: 999,
        }}
      />
      <div
        style={{
          position: "relative",
          width: `${pct}%`,
          height: "100%",
          background: `linear-gradient(to bottom, ${color}, ${color}bb)`,
          transition: "width 0.28s ease-out, background 0.3s",
          borderRadius: 999,
          animation: critical && pct > 0 ? "countdownPulse 0.9s ease-in-out infinite" : "none",
        }}
      />
    </div>
  );
}

function PpBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  return (
    <div style={{ height: "clamp(7px, 0.85vw, 10px)", background: "#0b0d14", borderRadius: 999, border: "2px solid #cbd5e1", overflow: "hidden", marginTop: 3 }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: "linear-gradient(to bottom, #38bdf8, #0ea5e9)",
          transition: "width 0.45s ease-out",
          borderRadius: 999,
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
  chargeMultiplier?: number;
}

interface ImpactEffect {
  id: number;
  charged: boolean;
}

function NameHpBox({ player, align, title }: { player: PlayerBattleState; align: "left" | "right"; title?: string }) {
  const borderColor = TYPE_BORDER_COLORS[player.characterType];
  const hpPct = Math.max(0, Math.round((player.currentHp / player.stats.maxHp) * 100));
  return (
    <div
      title={title}
      className="doodle-frame"
      style={{
        background: "rgba(6,8,16,0.78)",
        border: `3px solid ${borderColor}`,
        padding: "clamp(6px, 0.8vw, 10px) clamp(12px, 1.4vw, 18px)",
        minWidth: "clamp(150px, 19vw, 260px)",
        textAlign: align,
        boxShadow: `0 4px 0 ${borderColor}55, 0 10px 22px rgba(0,0,0,0.5)`,
      }}
    >
      {/* 名前を最優先。視聴者が「誰と誰が戦っているか」を最初に読み取れるようにする。 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: align === "right" ? "flex-end" : "flex-start",
        }}
      >
        <span
          style={{
            color: "#fff",
            fontWeight: 900,
            fontSize: "clamp(15px, 1.5vw, 22px)",
            letterSpacing: "0.02em",
            textShadow: "0 2px 0 rgba(0,0,0,0.7)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "clamp(90px, 12vw, 180px)",
          }}
        >
          {player.nickname}
        </span>
        <span
          style={{
            color: borderColor,
            border: `2px solid ${borderColor}`,
            borderRadius: 999,
            padding: "1px 8px",
            fontWeight: 800,
            fontSize: "clamp(9px, 0.8vw, 12px)",
            whiteSpace: "nowrap",
            background: `${borderColor}22`,
          }}
        >
          {TYPE_LABELS[player.characterType]}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          color: "#d1fae5",
          fontSize: "clamp(10px, 0.85vw, 13px)",
          fontWeight: 800,
          marginTop: 5,
        }}
      >
        <span>HP {hpPct}%</span>
        <span style={{ color: "#fff", fontSize: "clamp(13px, 1.25vw, 18px)", fontWeight: 900 }}>
          {player.currentHp}
          <span style={{ color: "#94a3b8", fontSize: "0.72em" }}>/{player.stats.maxHp}</span>
        </span>
      </div>
      <HpBar current={player.currentHp} max={player.stats.maxHp} />
      <div style={{ display: "flex", justifyContent: "space-between", color: "#a5f3fc", fontSize: "clamp(9px, 0.75vw, 12px)", fontWeight: 800, marginTop: 4 }}>
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
  floaters,
  impactEffects,
  voidminationActive,
  isActing,
  isLoser,
  isShaking,
  revealedAction,
  suppressedByTieBan,
  enhancementSlot,
  enhancementAlign,
  motionType,
  targetMotionType,
  sourceActionType,
  isHit,
  side,
}: {
  player: PlayerBattleState;
  floaters: DamageFloater[];
  impactEffects: ImpactEffect[];
  voidminationActive?: boolean;
  isActing?: boolean;
  isLoser?: boolean;
  isShaking?: boolean;
  revealedAction?: ActionType | null;
  suppressedByTieBan?: boolean;
  enhancementSlot?: EnhancementSlot | null;
  enhancementAlign: "left" | "right";
  motionType?: MoveMotionType;
  targetMotionType?: MoveMotionType;
  sourceActionType?: ActionType;
  isHit?: boolean;
  side: "left" | "right";
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const isCharged = player.chargeMultiplier > 1;
  const activeEffects: string[] = [];
  if (player.paralyzedNextTurn) activeEffects.push("まひ");
  if (player.tieBanActive) activeEffects.push("あいこ禁止");
  if ((player.attackBanTurns ?? 0) > 0) activeEffects.push("こうげき禁止");
  if ((player.barrierBanTurns ?? 0) > 0) activeEffects.push("バリア禁止");
  if ((player.magicBanTurns ?? 0) > 0) activeEffects.push("まほう禁止");
  if ((player.chargeBanTurns ?? 0) > 0) activeEffects.push("チャージ禁止");

  // わざモーションアニメーション（isActing中に適用）
  const portraitMotionAnim = getPortraitAnimation(motionType ?? "none", side, !!isActing);
  // 被弾時は「押し戻される」ノックバック。相手から遠ざかる向きに動かして、
  // ラクガキが実際に殴られたように見せる。
  const knockbackAnim = isShaking
    ? side === "left"
      ? "doodleKnockbackLeft 0.34s ease-out"
      : "doodleKnockbackRight 0.34s ease-out"
    : isHit
    ? side === "left"
      ? "doodleKnockbackLeft 0.24s ease-out"
      : "doodleKnockbackRight 0.24s ease-out"
    : "";
  const imgAnimations = [
    knockbackAnim,
    isHit ? "hitFlash 0.18s ease-out" : "",
    isCharged ? "chargeGlowPortrait 1.2s ease-in-out infinite" : "",
    portraitMotionAnim,
  ]
    .filter(Boolean)
    .join(", ");
  // Portrait size scales with BOTH viewport width and height (via vh), so it
  // shrinks to fit short browser windows too instead of only reacting to
  // width and forcing the page to scroll to reach the action buttons.
  const baseSize = "clamp(90px, min(13vw, 20vh), 190px)";
  const chargedSize = "clamp(100px, min(14.5vw, 22vh), 210px)";

  // バリアの「割れ」演出はactingではなくターゲットとして受ける側に適用
  const activeBarrierMotion = isActing ? motionType : (isShaking ? targetMotionType : undefined);

  return (
    <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative" }}>
        {floaters.map((f, idx) => {
          const big = !f.avoided && (f.amount > 100 || (f.chargeMultiplier ?? 1) > 1);
          const charged = f.type === "damage" && (f.chargeMultiplier ?? 1) > 1;
          const color =
            f.type === "hpRecover"
              ? big ? "#15803d" : "#22c55e"
              : f.type === "ppRecover"
              ? big ? "#1d4ed8" : "#3b82f6"
              : charged
              ? "#fbbf24"
              : f.avoided
              ? "#60a5fa"
              : big ? "#dc2626" : "#f87171";
          const glowColor =
            f.type === "hpRecover"
              ? big ? "#15803d" : "#22c55e"
              : f.type === "ppRecover"
              ? big ? "#1d4ed8" : "#3b82f6"
              : charged
              ? "#fbbf24"
              : f.avoided
              ? "#60a5fa"
              : big ? "#dc2626" : "#f87171";
          const fontSize = charged
            ? "clamp(30px, 3.6vw, 52px)"
            : big
            ? "clamp(26px, 3vw, 44px)"
            : "clamp(20px, 2.2vw, 34px)";
          // Spread multiple simultaneous floaters horizontally to avoid overlap.
          // Center index so even counts straddle the midpoint.
          const total = floaters.length;
          const offset = total > 1 ? (idx - (total - 1) / 2) * 60 : 0;
          return (
            <div
              key={f.id}
              className="sticker-text"
              style={{
                position: "absolute",
                top: -10,
                left: `calc(50% + ${offset}px)`,
                zIndex: 12,
                color,
                fontWeight: 900,
                fontSize,
                WebkitTextStroke: `${charged || big ? 5 : 4}px #14161f`,
                textShadow: `0 3px 0 #14161f, 0 0 14px ${glowColor}`,
                animation: "damageStickerPop 1.25s cubic-bezier(0.18, 1.4, 0.4, 1) forwards",
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              {f.type === "hpRecover" ? `+${f.amount}` : f.type === "ppRecover" ? `+${f.amount}` : f.avoided ? "MISS!" : `${f.amount}`}
            </div>
          );
        })}
        {impactEffects.map((effect) => (
          <div key={effect.id}>
            {/* コミック風のヒットバースト（ラクガキらしいポップな当たり感） */}
            <div className={`comic-burst${effect.charged ? " comic-burst-charged" : ""}`} aria-hidden="true">
              <span>{effect.charged ? "ドカンッ!" : "バシッ!"}</span>
            </div>
            <div className={`impactParticles${effect.charged ? " impactParticlesCharged" : ""}`} aria-hidden="true">
              {Array.from({ length: effect.charged ? 8 : 6 }, (_, index) => (
                <i key={index} style={{ "--particle-angle": `${index * (360 / (effect.charged ? 8 : 6))}deg` } as CSSProperties} />
              ))}
            </div>
          </div>
        ))}
        {revealedAction && (
          <div
            className="doodle-frame"
            style={{
              position: "absolute",
              top: -22,
              left: "50%",
              transform: "translateX(-50%) rotate(-2deg)",
              zIndex: 13,
              background: suppressedByTieBan ? "#6b7280" : ACTION_COLORS[revealedAction],
              border: "3px solid #f8fafc",
              color: "#fff",
              fontWeight: 900,
              fontSize: "clamp(13px, 1.15vw, 18px)",
              padding: "4px 14px",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 0 rgba(0,0,0,0.55)",
              animation: "fadeInScale 0.25s ease-out",
            }}
          >
            {suppressedByTieBan ? "あいこ禁止" : ACTION_LABELS[revealedAction]}
          </div>
        )}
        {/* 接地影: ラクガキが「戦場に立っている」ように見せる */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: -4,
            left: "50%",
            width: `calc(${isCharged ? chargedSize : baseSize} * 0.62)`,
            height: "clamp(9px, 1.1vw, 16px)",
            transform: "translateX(-50%)",
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 72%)",
            animation: "groundShadowBreath 3.2s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        {/* 待機モーション。四角い画像ではなく、ふわふわ生きているラクガキに見せる。 */}
        <div
          style={{
            animation: isLoser
              ? "none"
              : `${side === "left" ? "doodleIdleFloat" : "doodleIdleFloatRight"} ${side === "left" ? 3.4 : 3.8}s ease-in-out infinite`,
          }}
        >
          <img
            src={safeImageUrl(player.imageDataUrl)}
            alt={`${player.nickname} のキャラクター`}
            onMouseEnter={() => setTooltipVisible(true)}
            onMouseLeave={() => setTooltipVisible(false)}
            onClick={() => setTooltipVisible((v) => !v)}
            style={{
              display: "block",
              width: isCharged ? chargedSize : baseSize,
              height: isCharged ? chargedSize : baseSize,
              objectFit: "contain",
              // 白いふちどり + 地面側の影。透過ラクガキが背景から独立して見えるようにする。
              filter: [
                isLoser ? "grayscale(100%)" : "",
                "drop-shadow(2px 0 0 rgba(248,250,252,0.95)) drop-shadow(-2px 0 0 rgba(248,250,252,0.95)) drop-shadow(0 2px 0 rgba(248,250,252,0.95)) drop-shadow(0 -2px 0 rgba(248,250,252,0.95))",
                "drop-shadow(0 8px 10px rgba(0,0,0,0.55))",
                isCharged ? "drop-shadow(0 0 6px #facc15cc) drop-shadow(0 0 12px #facc1577)" : "",
              ].filter(Boolean).join(" "),
              transition: "filter 1.8s ease-in-out, transform 0.3s, width 0.3s ease, height 0.3s ease",
              transform: isActing ? "scale(1.08)" : "scale(1)",
              animation: imgAnimations || "none",
              cursor: "pointer",
            }}
          />
        </div>        {/* まほう弾エフェクト */}
        <MagicBullet side={side} motionType={motionType ?? "none"} sourceActionType={sourceActionType} active={!!isActing} />
        {/* バリアの壁エフェクト（actor側: 通常バリア / バリアClash） */}
        <BarrierWallEffect side={side} motionType={motionType ?? "none"} active={!!isActing} />
        {/* バリアの割れエフェクト（target側: こうげきを受けたとき） */}
        {activeBarrierMotion === "barrierBreak" && (
          <BarrierWallEffect side={side} motionType="barrierBreak" active={true} />
        )}
        {tooltipVisible && (() => {
          const s = getEffectiveStats(player);
          const evasionDisplay = getVoidminationTooltipEvasionDisplay(s.evasion, !!voidminationActive);
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
                <span style={{ color: evasionDisplay.color }}>{evasionDisplay.text}</span>
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
  weakMagicButtonTitle,
}: {
  actions: ActionType[];
  player: PlayerBattleState;
  selectedAction?: ActionType | null;
  onSelect?: (action: ActionType) => void;
  readOnly?: boolean;
  weakMagicButtonTitle?: string;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
      {SELECTABLE_ACTIONS.map((action, index) => {
        const canUse = actions.includes(action);
        const isSelected = selectedAction === action;
        const color = ACTION_COLORS[action];
        return (
          <button
            key={action}
            className="doodle-btn"
            title={action === "magicWeak" ? weakMagicButtonTitle : undefined}
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
              ["--doodle-tilt" as string]: index % 2 === 0 ? "-1deg" : "1deg",
              padding: readOnly
                ? "clamp(4px, 0.5vw, 7px) clamp(7px, 0.9vw, 11px)"
                : "clamp(8px, 0.95vw, 13px) clamp(11px, 1.4vw, 18px)",
              borderColor: canUse ? color : "#374151",
              background: canUse ? (isSelected ? color : "rgba(8,10,18,0.82)") : "rgba(20,24,34,0.9)",
              color: canUse ? (isSelected ? "#fff" : color) : "#6b7280",
              cursor: readOnly ? "default" : canUse ? "pointer" : "not-allowed",
              transform: isSelected ? "scale(1.08) rotate(-1.5deg)" : undefined,
              boxShadow: isSelected
                ? `0 0 0 3px #f8fafc, 0 5px 0 ${color}, 0 10px 18px rgba(0,0,0,0.5)`
                : canUse
                ? `0 4px 0 ${color}55`
                : "none",
              fontSize: readOnly ? "clamp(9px, 0.8vw, 12px)" : "clamp(12px, 1.1vw, 16px)",
              opacity: canUse ? 1 : 0.4,
              pointerEvents: readOnly ? "none" : "auto",
            }}
          >
            {readOnly ? ACTION_LABELS[action] : getActionLabel(action, player)}
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
  /**
   * When true, the player's action buttons are removed from the DOM entirely.
   * Set this while the turn is being finalized (from action select until the
   * next turn's number has incremented and its countdown has reset to the full
   * turn window). This prevents any click from slipping through during the
   * animation / finalization window, providing a structural fail-safe on top of
   * the existing isAnimating / pendingAnimation render-time guards.
   */
  isResolvingTurn?: boolean;
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
  /** When true, shows the arena background image on the header/portrait area (multiplayer only). */
  showArenaBackground?: boolean;
  /** Optional background image URL to display on the header/portrait area (single-play use). Takes priority over showArenaBackground. */
  backgroundImageUrl?: string;
  /** Optional tooltip shown for roguelike weak-magic pool info. */
  roguelikeWeakMagicTooltipTitle?: string;
  /** When true, keep battle-finished state but hide the built-in finish overlay. */
  suppressFinishOverlay?: boolean;
}) {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [floaters, setFloaters] = useState<DamageFloater[]>([]);
  const [impactEffects, setImpactEffects] = useState<Record<string, ImpactEffect[]>>({});
  const [showFlash, setShowFlash] = useState(false);
  const [actingPlayerId, setActingPlayerId] = useState<string | null>(null);
  const [showFinishButtons, setShowFinishButtons] = useState(false);
  const [revealedActions, setRevealedActions] = useState<Record<string, ActionType> | null>(null);
  const [showMatchupModal, setShowMatchupModal] = useState(false);
  const [shakingIds, setShakingIds] = useState<Set<string>>(new Set());
  const [hitIds, setHitIds] = useState<Set<string>>(new Set());
  const [screenShake, setScreenShake] = useState<"normal" | "charged" | null>(null);
  const [displayResources, setDisplayResources] = useState(() => buildDisplayBattleResources([props.me, props.enemy]));
  const [voidminationActive, setVoidminationActive] = useState(
    () => !!(props.me.voidminationActive || props.enemy.voidminationActive),
  );
  const [showVoidminationCutIn, setShowVoidminationCutIn] = useState(false);
  // わざモーション: actingPhaseIndex が示す TurnAnimationPhase の motionType を保持
  const [activePhaseMotions, setActivePhaseMotions] = useState<{
    me: { motionType?: MoveMotionType; targetMotionType?: MoveMotionType; sourceActionType?: ActionType };
    enemy: { motionType?: MoveMotionType; targetMotionType?: MoveMotionType; sourceActionType?: ActionType };
  }>({ me: {}, enemy: {} });
  // True while the turn-result reveal/damage animation is playing. Used to keep
  // the action buttons locked for the whole animation, not just until the
  // player's own selection is echoed back (see readOnly usage below).
  const [isAnimating, setIsAnimating] = useState(false);
  const prevTurnRef = useRef<number | null>(null);
  const floaterIdRef = useRef(0);
  // 残り時間バーの分母（そのターンで観測した最大カウントダウン値）
  const countdownMaxRef = useRef(props.countdown);
  // Derived directly at render time (not from isAnimating state, which is only set
  // inside a useEffect that runs *after* the browser paints). Without this, there is
  // a brief window right after a new turnResult arrives — before the effect below has
  // had a chance to run and flip isAnimating to true — where the buttons render as
  // unlocked. A click landing in that window can race with the next turn's
  // resolution and corrupt displayResources. Comparing turnResult.turn against
  // prevTurnRef.current here closes that window immediately on render.
  const pendingAnimation = !!props.turnResult && prevTurnRef.current !== props.turnResult.turn;
  // Combined resolving-phase flag: buttons are removed from the DOM whenever any
  // of these three guards is active:
  //   1. props.isResolvingTurn — page.tsx confirms the turn has not fully advanced
  //      (structural fail-safe; independent of animation-side state).
  //   2. isAnimating — the reveal/damage animation is still in progress.
  //   3. pendingAnimation — a new turnResult arrived this render but the animation
  //      useEffect has not yet run (render-time guard to close the brief window
  //      between receiving turnResult and isAnimating flipping to true).
  const resolvingPhase = !!(props.isResolvingTurn || isAnimating || pendingAnimation);
  const availableActions = useMemo(() => getAvailableActions(props.me, props.turn), [props.me, props.turn]);
  const enemyAvailableActions = useMemo(() => getAvailableActions(props.enemy, props.turn), [props.enemy, props.turn]);
  const displayMe = displayResources[props.me.id] ?? { currentHp: props.me.currentHp, currentPp: props.me.currentPp };
  const displayEnemy = displayResources[props.enemy.id] ?? { currentHp: props.enemy.currentHp, currentPp: props.enemy.currentPp };
  const shouldResetTransientState = shouldResetBattlePanelTransientState(
    props.turn,
    props.turnResult,
    props.me.voidminationActive,
    props.enemy.voidminationActive,
  );

  const battleEnded = !!props.finishResult;
  const isFinished = battleEnded && (displayMe.currentHp <= 0 || displayEnemy.currentHp <= 0);
  const isWin = isFinished && props.finishResult!.winnerId === props.me.id;
  const myIsLoser = isFinished && !isWin;
  const enemyIsLoser = isFinished && isWin;

  useEffect(() => {
    setSelectedAction(null);
  }, [props.me.lastActionCategory, props.turn, battleEnded]);

  useEffect(() => {
    if (!shouldResetTransientState) return;
    prevTurnRef.current = null;
    setSelectedAction(null);
    setFloaters([]);
    setImpactEffects({});
    setShowFlash(false);
    setActingPlayerId(null);
    setShowFinishButtons(false);
    setRevealedActions(null);
    setShowMatchupModal(false);
    setShakingIds(new Set());
    setHitIds(new Set());
    setScreenShake(null);
    setDisplayResources(buildDisplayBattleResources([props.me, props.enemy]));
    setVoidminationActive(false);
    setShowVoidminationCutIn(false);
    setIsAnimating(false);
    setActivePhaseMotions({ me: {}, enemy: {} });
  }, [shouldResetTransientState, props.me, props.enemy]);

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

        // わざモーションの状態を更新
        const isActorMe = phase.actorId === props.me.id;
        if (isActorMe) {
          // meがactor: meにmotionType、enemyにtargetMotionType（例：バリア割れ）
          setActivePhaseMotions({
            me: { motionType: phase.motionType, sourceActionType: phase.sourceActionType },
            enemy: { motionType: phase.targetMotionType },
          });
        } else {
          // enemyがactor: enemyにmotionType、meにtargetMotionType
          setActivePhaseMotions({
            me: { motionType: phase.targetMotionType },
            enemy: { motionType: phase.motionType, sourceActionType: phase.sourceActionType },
          });
        }

        const phaseFloaters: DamageFloater[] = phase.damageEvents.map((event) => ({
          id: floaterIdRef.current++,
          amount: event.amount,
          avoided: event.avoided,
          toMe: event.to === props.me.id,
          type: "damage" as const,
          chargeMultiplier: event.chargeMultiplier,
        }));
        const successfulHits = phase.damageEvents.filter((event) => !event.avoided && event.amount > 0);
        const heavyHits = successfulHits.filter((event) => {
          const target = playersById[event.to];
          return target && event.amount / target.stats.maxHp >= HEAVY_DAMAGE_HP_RATIO;
        });
        const chargedHit = successfulHits.some((event) => event.chargeMultiplier > 1);
        const phaseImpacts = successfulHits.map((event) => ({
          id: floaterIdRef.current++,
          charged: event.chargeMultiplier > 1,
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

        if (successfulHits.length > 0) {
          const phaseHitIds = new Set(successfulHits.map((event) => event.to));
          setHitIds(phaseHitIds);
          schedule(() => setHitIds(new Set()), HIT_FLASH_DURATION_MS);
          setImpactEffects((prev) => ({
            ...prev,
            ...Object.fromEntries(
              successfulHits.map((event, index) => [
                event.to,
                [...(prev[event.to] ?? []), phaseImpacts[index]],
              ]),
            ),
          }));
          schedule(() => {
            setImpactEffects((prev) => {
              const next = { ...prev };
              for (const event of successfulHits) next[event.to] = (next[event.to] ?? []).slice(1);
              return next;
            });
          }, IMPACT_EFFECT_DURATION_MS);
        }
        if (heavyHits.length > 0) {
          const phaseHeavyIds = new Set(heavyHits.map((event) => event.to));
          setShakingIds(phaseHeavyIds);
          schedule(() => setShakingIds(new Set()), chargedHit ? CHARGED_SCREEN_SHAKE_DURATION_MS : SCREEN_SHAKE_DURATION_MS);
        }
        if (chargedHit) {
          setScreenShake("charged");
          schedule(() => setScreenShake(null), CHARGED_SCREEN_SHAKE_DURATION_MS);
        } else if (heavyHits.length > 0) {
          setScreenShake("normal");
          schedule(() => setScreenShake(null), SCREEN_SHAKE_DURATION_MS);
        }
      };

      runPhase(0);
      schedule(() => runPhase(1), 850);
      schedule(() => {
        setActingPlayerId(null);
        setActivePhaseMotions({ me: {}, enemy: {} });
        setDisplayResources(buildDisplayBattleResources([turnResult.nextStates[props.me.id], turnResult.nextStates[props.enemy.id]]));

        if (turnResult.voidminationTriggered) {
          // 空間支配（ヴォイドミネーション）cutscene: BGM swap → shihai.png for 3.9s
          soundManager.stopBgm();
          soundManager.playSe("/sounds/se/void.mp3");
          soundManager.playBgm("/sounds/bgm/boss5-3_loop.mp3");
          setVoidminationActive(true);
          setShowVoidminationCutIn(true);
          schedule(() => {
            setShowVoidminationCutIn(false);
            finalized = true;
            setIsAnimating(false);
          }, VOIDMINATION_CUT_IN_DURATION_MS);
        } else {
          finalized = true;
          setIsAnimating(false);
        }
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
        setActivePhaseMotions({ me: {}, enemy: {} });
        setRevealedActions(null);
        setShowFlash(false);
        setShakingIds(new Set());
        setHitIds(new Set());
        setImpactEffects({});
        setScreenShake(null);
        setShowVoidminationCutIn(false);
        if (turnResult.voidminationTriggered) {
          setVoidminationActive(true);
        }
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
  // ターンの制限時間はモードによって異なるため、そのターンで観測した最大値を
  // 100% として残り時間バーを描く（ゲームロジックには一切触れない表示専用）。
  if (countdown > countdownMaxRef.current) countdownMaxRef.current = countdown;
  const countdownMax = Math.max(1, countdownMaxRef.current);
  const countdownPct = Math.max(0, Math.min(100, (countdown / countdownMax) * 100));
  // 視聴者向けの優劣バー: どちらがHP的に有利かを一目で伝える。
  const myHpRatio = Math.max(0, displayMe.currentHp) / Math.max(1, props.me.stats.maxHp);
  const enemyHpRatio = Math.max(0, displayEnemy.currentHp) / Math.max(1, props.enemy.stats.maxHp);
  const advantageShare = myHpRatio + enemyHpRatio > 0 ? (myHpRatio / (myHpRatio + enemyHpRatio)) * 100 : 50;
  // 行動公開中に「なぜダメージが入ったのか」を説明するコメンタリー。
  const revealCommentary = revealedActions
    ? (() => {
        const myAction = revealedActions[props.me.id];
        const enemyAction = revealedActions[props.enemy.id];
        if (!myAction || !enemyAction) return null;
        return {
          myAction,
          enemyAction,
          ...getMatchupCommentary(myAction, enemyAction),
        };
      })()
    : null;
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

      {/* 空間支配（ヴォイドミネーション）cutscene overlay */}
      {showVoidminationCutIn && <div style={getVoidminationCutInOverlayStyle()} />}

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

      {/* 行動公開バナー: 「何を選んだか」「なぜダメージが入ったのか」を、
          プレイヤーにも配信の視聴者にも同時に伝えるための見せ場。 */}
      {revealCommentary && (
        <div
          style={{
            position: "absolute",
            top: "42%",
            left: "50%",
            zIndex: 25,
            pointerEvents: "none",
            animation: "matchupBannerSlam 2s ease-out forwards",
            textAlign: "center",
            width: "min(94%, 640px)",
          }}
        >
          <div
            className="doodle-frame"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "clamp(8px, 1.4vw, 18px)",
              background: "rgba(6,8,16,0.86)",
              border: "4px solid #f8fafc",
              padding: "clamp(8px, 1.1vw, 14px) clamp(14px, 2vw, 26px)",
              boxShadow: "0 6px 0 rgba(0,0,0,0.6), 0 16px 34px rgba(0,0,0,0.55)",
            }}
          >
            <span
              style={{
                color: ACTION_COLORS[revealCommentary.myAction],
                fontWeight: 900,
                fontSize: "clamp(14px, 1.7vw, 24px)",
                whiteSpace: "nowrap",
              }}
            >
              {ACTION_LABELS[revealCommentary.myAction]}
            </span>
            <span style={{ color: "#f8fafc", fontWeight: 900, fontSize: "clamp(13px, 1.5vw, 20px)" }}>VS</span>
            <span
              style={{
                color: ACTION_COLORS[revealCommentary.enemyAction],
                fontWeight: 900,
                fontSize: "clamp(14px, 1.7vw, 24px)",
                whiteSpace: "nowrap",
              }}
            >
              {ACTION_LABELS[revealCommentary.enemyAction]}
            </span>
          </div>
          <div
            className="sticker-text"
            style={{
              marginTop: 8,
              color: MATCHUP_TONE_COLORS[revealCommentary.tone],
              fontWeight: 900,
              fontSize: "clamp(20px, 2.8vw, 42px)",
              WebkitTextStroke: "5px #14161f",
              letterSpacing: "0.02em",
            }}
          >
            {revealCommentary.headline}
          </div>
          <div
            style={{
              marginTop: 4,
              color: "#e2e8f0",
              fontWeight: 800,
              fontSize: "clamp(11px, 1.1vw, 16px)",
              textShadow: "0 2px 0 rgba(0,0,0,0.8)",
            }}
          >
            {revealCommentary.detail}
          </div>
        </div>
      )}

      {/* Finish overlay: YOU WIN / YOU LOSE */}
      {isFinished && !props.suppressFinishOverlay && (
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
          // 木目調のRPG枠から、スケッチブックのページを切り取ったような
          // 「インクの枠」に変更。主役であるラクガキが枠に負けないようにする。
          background:
            "linear-gradient(to bottom, #0b1020 0%, #121a2e 45%, #0d1322 100%)",
          borderRadius: 18,
          border: "4px solid #f8fafc",
          boxShadow: "0 8px 0 rgba(15,23,42,0.9), 0 18px 36px rgba(0,0,0,0.6)",
          overflow: "hidden",
          animation: screenShake
            ? `${screenShake === "charged" ? "screenShakeCharged" : "screenShake"} ${screenShake === "charged" ? "0.36s" : "0.22s"} ease-in-out`
            : "none",
        }}
      >
        {/* Arena background wrapper */}
        <div
          style={(() => {
            const resolvedUrl =
              props.backgroundImageUrl ??
              (props.showArenaBackground
                ? (voidminationActive ? "/arttle_back/voidback.png" : "/arttle_back/arenaback.png")
                : null);
            return resolvedUrl
              ? {
                  backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url('${resolvedUrl}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined;
          })()}
        >
        {/* Header bar */}
        <div
          style={{
            background: "linear-gradient(to right, rgba(3,6,14,0.92), rgba(15,23,42,0.92), rgba(3,6,14,0.92))",
            padding: "clamp(5px, 0.8vw, 9px) clamp(12px, 1.6vw, 20px)",
            borderBottom: "3px solid #f8fafc",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* ターン数は視聴者が「どれくらい競っているか」を掴む基準になるので、
              数字だけを大きく、ラベルは小さく分ける。 */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 6,
              color: "#fde68a",
              fontWeight: 900,
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: "clamp(10px, 0.9vw, 13px)", color: "#cbd5e1" }}>ターン</span>
            <span style={{ fontSize: "clamp(20px, 2.1vw, 30px)", lineHeight: 1, textShadow: "0 3px 0 rgba(0,0,0,0.7)" }}>{props.turn}</span>
          </span>
          {upcomingDamageAnnouncement && (
            <span style={{ color: "#fde68a", fontWeight: "bold", fontSize: "clamp(11px, 1vw, 13px)", textShadow: "0 0 8px #f59e0b99" }}>
              {upcomingDamageAnnouncement}
            </span>
          )}
          {voidminationActive && (
            <span
              title="効果：お互いの回避率を0%にする"
              style={{
                color: "#c4b5fd",
                fontWeight: "bold",
                fontSize: "clamp(9px, 0.85vw, 12px)",
                border: "1px solid #7c3aed",
                borderRadius: 5,
                padding: "2px 8px",
                background: "rgba(124,58,237,0.18)",
                whiteSpace: "nowrap",
                cursor: "default",
              }}
            >
              ヴォイドミネーション
            </span>
          )}
          <button
            className="doodle-btn"
            onClick={() => setShowMatchupModal(true)}
            style={{
              ["--doodle-tilt" as string]: "1deg",
              background: "rgba(8,10,18,0.8)",
              borderColor: "#fde68a",
              color: "#fde68a",
              fontSize: "clamp(10px, 0.9vw, 13px)",
              padding: "clamp(3px, 0.4vw, 6px) clamp(8px, 1vw, 12px)",
              whiteSpace: "nowrap",
              boxShadow: "0 3px 0 rgba(253,230,138,0.4)",
            }}
          >
            相性表
          </button>
        </div>

        {/* 優劣バー: どちらがHPで有利かを配信視聴者にも一目で伝える */}
        <div
          style={{
            display: "flex",
            height: "clamp(6px, 0.7vw, 9px)",
            background: "#0b0d14",
            borderBottom: "2px solid rgba(248,250,252,0.65)",
          }}
          aria-hidden="true"
        >
          <div
            style={{
              width: `${advantageShare}%`,
              background: "linear-gradient(to right, #22c55e, #86efac)",
              transition: "width 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
          <div style={{ flex: 1, background: "linear-gradient(to right, #fca5a5, #ef4444)" }} />
        </div>

        {/* Name / HP / PP boxes, colored by character type */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "clamp(8px, 1.1vw, 14px) clamp(12px, 1.6vw, 18px) 0" }}>
          <NameHpBox player={{ ...props.me, ...displayMe }} align="left" title={props.roguelikeWeakMagicTooltipTitle} />
          <NameHpBox player={{ ...props.enemy, ...displayEnemy }} align="right" title={props.roguelikeWeakMagicTooltipTitle} />
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
            floaters={floaters.filter((f) => f.toMe)}
            impactEffects={impactEffects[props.me.id] ?? []}
            voidminationActive={voidminationActive}
            isActing={actingPlayerId === props.me.id}
            isLoser={myIsLoser}
            isShaking={shakingIds.has(props.me.id)}
            isHit={hitIds.has(props.me.id)}
            revealedAction={revealedActions ? revealedActions[props.me.id] : null}
            suppressedByTieBan={props.turnResult?.suppressedByTieBanIds?.includes(props.me.id)}
            enhancementSlot={props.me.enhancementSlot}
            enhancementAlign="left"
            motionType={activePhaseMotions.me.motionType}
            targetMotionType={activePhaseMotions.me.motionType === undefined ? activePhaseMotions.me.targetMotionType : undefined}
            sourceActionType={activePhaseMotions.me.sourceActionType}
            side="left"
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
            {/* 残り時間: 数字＋減っていくバー。緊張感の主役になるので大きめに置く。 */}
            <div
              className="doodle-frame"
              style={{
                background: "rgba(6,8,16,0.88)",
                border: "3px solid #f8fafc",
                padding: "clamp(5px, 0.7vw, 8px) clamp(9px, 1.3vw, 14px)",
                textAlign: "center",
                minWidth: "clamp(62px, 7vw, 96px)",
                boxShadow: countdown <= 5 ? "0 0 18px rgba(239,68,68,0.6)" : "0 4px 0 rgba(0,0,0,0.5)",
                animation: countdownPulse ? "countdownPulse 0.8s ease-in-out infinite" : "none",
              }}
            >
              <div
                style={{
                  color: countdownColor,
                  fontWeight: 900,
                  fontSize: "clamp(22px, 2.6vw, 34px)",
                  lineHeight: 1,
                  textShadow: countdown <= 5 ? "0 0 12px #ef4444, 0 3px 0 #14161f" : "0 3px 0 #14161f",
                }}
              >
                {countdown}
              </div>
              <div
                style={{
                  marginTop: 5,
                  height: 6,
                  background: "#0b0d14",
                  borderRadius: 999,
                  overflow: "hidden",
                  border: "1px solid rgba(248,250,252,0.6)",
                }}
              >
                <div
                  style={{
                    width: `${countdownPct}%`,
                    height: "100%",
                    background: countdownColor,
                    transition: "width 0.9s linear, background 0.3s",
                  }}
                />
              </div>
            </div>
          </div>
          <PortraitBlock
            player={props.enemy}
            floaters={floaters.filter((f) => !f.toMe)}
            impactEffects={impactEffects[props.enemy.id] ?? []}
            voidminationActive={voidminationActive}
            isActing={actingPlayerId === props.enemy.id}
            isLoser={enemyIsLoser}
            isShaking={shakingIds.has(props.enemy.id)}
            isHit={hitIds.has(props.enemy.id)}
            revealedAction={revealedActions ? revealedActions[props.enemy.id] : null}
            suppressedByTieBan={props.turnResult?.suppressedByTieBanIds?.includes(props.enemy.id)}
            enhancementSlot={props.enemy.enhancementSlot}
            enhancementAlign="right"
            motionType={activePhaseMotions.enemy.motionType}
            targetMotionType={activePhaseMotions.enemy.motionType === undefined ? activePhaseMotions.enemy.targetMotionType : undefined}
            sourceActionType={activePhaseMotions.enemy.sourceActionType}
            side="right"
          />
        </div>

        {/* 手描きの地面ライン（ラクガキが立っている床） */}
        <div style={{ height: 16, position: "relative", overflow: "hidden" }} aria-hidden="true">
          <svg viewBox="0 0 600 16" preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
            <path
              d="M0 9c40-4 80 4 120 0s80-6 120-1 80 6 120 1 80-6 120-2 80 5 120 1"
              stroke="#f8fafc"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              opacity="0.85"
            />
            <g stroke="#f8fafc" strokeWidth="2" opacity="0.35" strokeLinecap="round">
              <path d="M30 12l-8 4" />
              <path d="M150 11l-8 4" />
              <path d="M270 12l-8 4" />
              <path d="M390 11l-8 4" />
              <path d="M510 12l-8 4" />
            </g>
          </svg>
        </div>
        </div>{/* end arena background wrapper */}

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
              {resolvingPhase ? (
                /* Placeholder shown while the action is being resolved (animation playing,
                   turn being finalized, or next-turn countdown not yet reset). Structurally
                   removing the buttons here ensures no click can slip through even if the
                   isAnimating / pendingAnimation guards fail due to a state timing race. */
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "clamp(36px, 4vw, 52px)",
                    color: "#9ca3af",
                    fontWeight: "bold",
                    fontSize: "clamp(11px, 1vw, 14px)",
                    letterSpacing: "0.03em",
                    animation: "fadeInScale 0.25s ease-out",
                  }}
                >
                  ⏳ 行動を解決中...
                </div>
              ) : (
                <ActionButtonsRow
                  actions={availableActions}
                  player={props.me}
                  weakMagicButtonTitle={props.roguelikeWeakMagicTooltipTitle}
                  selectedAction={selectedAction}
                  onSelect={(action) => {
                    setSelectedAction(action);
                    props.onActionSelect(action);
                  }}
                />
              )}
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
