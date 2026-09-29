"use client";

import type { ActionType } from "@/types/game";
import type { CSSProperties } from "react";
import type { MoveMotionType } from "./battleAnimationPhases";

/**
 * わざモーション用のオーバーレイコンポーネント群。
 * PortraitBlock の内部で `position: relative` なコンテナの上に重ねて使用する。
 *
 * - `MoveMotionOverlay`: actorのわざモーション（画像に適用するアニメーション名を返す）
 * - `MagicBullet`: まほう弾エフェクト（独立したDOM要素として表示）
 * - `BarrierWallEffect`: バリアの光の壁エフェクト
 */

export interface PortraitMotionProps {
  /** アクターのモーション種別 */
  motionType: MoveMotionType;
  /** このポートレートが画面左側（自身）か右側（相手）か */
  side: "left" | "right";
  /** アニメーションが有効かどうか */
  active: boolean;
}

export type BattleSide = "left" | "right";

export function getMotionDirection(side: BattleSide): 1 | -1 {
  return side === "left" ? 1 : -1;
}

/**
 * 向きは `--dir` で切り替え、左右共通のコマ送り animation を返す。
 */
export function getPortraitAnimation(motionType: MoveMotionType, _side: BattleSide, active: boolean): string {
  if (!active) return "";
  switch (motionType) {
    case "attackLunge":
      return "attackLunge 0.72s steps(1, end) forwards";
    case "chargeConcentration":
      return "chargeConcentration 0.8s steps(1, end) forwards";
    case "magicBlast":
    case "magicReflect":
      return "magicCast 0.82s steps(1, end) forwards";
    case "barrierWall":
    case "barrierBreak":
    case "barrierClash":
      return "barrierBrace 0.75s steps(1, end) forwards";
    default:
      return "";
  }
}

export function getPortraitMotionStyle(
  motionType: MoveMotionType,
  side: BattleSide,
  active: boolean,
  chargeMultiplier = 1,
) {
  return {
    animation: getPortraitAnimation(motionType, side, active),
    "--dir": getMotionDirection(side),
    "--motion-power": chargeMultiplier > 1 ? 1.4 : 1,
  };
}

export function getHitPortraitAnimation(_side: BattleSide, active: boolean): string {
  if (!active) return "";
  return "hitRecoil 0.72s steps(1, end) forwards";
}

export function getHitPortraitStyle(side: BattleSide, active: boolean, heavy = false) {
  return {
    animation: getHitPortraitAnimation(side, active),
    "--dir": side === "left" ? -1 : 1,
    "--hit-distance": heavy ? "44px" : "24px",
    "--hit-angle": heavy ? "18deg" : "10deg",
  };
}

/** まほう弾 / 反射弾のエフェクトオーバーレイ */
export function MagicBullet({
  side,
  motionType,
  sourceActionType,
  active,
}: {
  side: BattleSide;
  motionType: MoveMotionType;
  sourceActionType?: ActionType;
  active: boolean;
}) {
  if (!active) return null;
  if (motionType !== "magicBlast" && motionType !== "magicReflect") return null;

  // 弾の移動方向: left側(自身)は右へ、right側(相手)は左へ
  const dx = side === "left" ? 140 : -140;
  const isReflect = motionType === "magicReflect";
  const isStrongMagic = sourceActionType === "magicStrong";

  return (
    <div
      aria-hidden="true"
      className="magic-bullet-effect"
      style={{
        position: "absolute",
        top: "40%",
        left: side === "left" ? "80%" : "20%",
        zIndex: 15,
        width: isStrongMagic ? 36 : 24,
        height: isStrongMagic ? 36 : 24,
        borderRadius: "50%",
        background: "radial-gradient(circle, #c4b5fd, #7c3aed 60%, #4c1d95)",
        boxShadow: isStrongMagic ? "0 0 18px 6px rgba(167,139,250,0.55), 0 0 28px 10px rgba(124,58,237,0.35)" : "0 0 12px 4px #a78bfa88",
        animation: isReflect
          ? "barrierReflect 0.52s steps(1, end) 0.3s forwards"
          : `magicBlast 0.52s steps(1, end) 0.3s forwards${isStrongMagic ? ", chargeGlow 0.9s ease-in-out infinite" : ""}`,
        // CSS カスタムプロパティで弾の移動距離を渡す
        ["--blast-dx" as string]: `${dx}px`,
        pointerEvents: "none",
      }}
    />
  );
}

/** 魔法発動時に足元へ広がる魔法陣と粒子 */
export function MagicRuneEffect({
  side,
  motionType,
  sourceActionType,
  active,
}: {
  side: BattleSide;
  motionType: MoveMotionType;
  sourceActionType?: ActionType;
  active: boolean;
}) {
  if (!active || (motionType !== "magicBlast" && motionType !== "magicReflect")) return null;

  const isStrongMagic = sourceActionType === "magicStrong";
  const runeSize = isStrongMagic ? 76 : 54;
  return (
    <div
      className="magic-rune-effect"
      aria-hidden="true"
      style={{
        position: "absolute",
        zIndex: 11,
        left: "50%",
        bottom: "4%",
        width: runeSize,
        height: runeSize,
        border: `${isStrongMagic ? 3 : 2}px solid #c4b5fd`,
        borderRadius: "50%",
        boxShadow: isStrongMagic ? "0 0 24px 8px #8b5cf688" : "0 0 14px 4px #8b5cf666",
        ["--dir" as string]: getMotionDirection(side),
      }}
    >
      <span className="magic-rune-inner" />
      {Array.from({ length: isStrongMagic ? 8 : 6 }, (_, index) => (
        <i key={index} style={{ "--particle-angle": `${index * (360 / (isStrongMagic ? 8 : 6))}deg` } as CSSProperties} />
      ))}
    </div>
  );
}

/** こうげきの踏み込みに同期する斬撃の軌跡 */
export function AttackTrailEffect({
  side,
  active,
  charged = false,
}: {
  side: BattleSide;
  active: boolean;
  charged?: boolean;
}) {
  if (!active) return null;
  return (
    <div
      className={`attack-trail-effect${charged ? " attack-trail-charged" : ""}`}
      aria-hidden="true"
      style={{
        left: side === "left" ? "58%" : "4%",
        ["--dir" as string]: getMotionDirection(side),
      }}
    />
  );
}

/** チャージ中に足元から立ち上るオーラ */
export function ChargeAuraEffect({ active }: { active: boolean }) {
  if (!active) return null;
  return <div className="charge-aura-effect" aria-hidden="true" />;
}

/** バリアの光の壁エフェクトオーバーレイ */
export function BarrierWallEffect({
  side,
  motionType,
  active,
}: {
  side: BattleSide;
  motionType: MoveMotionType;
  active: boolean;
}) {
  if (!active) return null;
  if (
    motionType !== "barrierWall" &&
    motionType !== "barrierBreak" &&
    motionType !== "barrierClash"
  )
    return null;

  // 壁は相手側の側面に出す
  const wallSide = side === "left" ? "right" : "left";
  // バリアの衝突移動量
  const clashDx = side === "left" ? 50 : -50;

  const animationName =
    motionType === "barrierBreak"
      ? "barrierBreak"
      : motionType === "barrierClash"
        ? "barrierClash"
        : "barrierWall";

  const duration =
    motionType === "barrierBreak"
      ? "0.5s"
      : motionType === "barrierClash"
        ? "0.7s"
        : "0.75s";

  return (
    <div
      aria-hidden="true"
      className="barrier-wall-effect"
      style={{
        position: "absolute",
        top: "5%",
        [wallSide]: "-10px",
        width: 12,
        height: "90%",
        borderRadius: 6,
        background:
          "linear-gradient(to bottom, #fbbf2400, #fbbf24cc 30%, #fbbf24cc 70%, #fbbf2400)",
        boxShadow:
          "0 0 14px 4px #fbbf2488, inset 0 0 8px #fde68a66",
        transformOrigin: "bottom center",
        animation: `${animationName} ${duration} steps(1, end) forwards`,
        ["--clash-dx" as string]: `${clashDx}px`,
        zIndex: 12,
        pointerEvents: "none",
      }}
    />
  );
}
