"use client";

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

/**
 * ポートレート画像の CSS animation 文字列を返す。
 * 既存の hitShake / chargeGlow と同様に `<img style={{ animation: ... }}` に渡す。
 */
export function getPortraitAnimation(motionType: MoveMotionType, side: "left" | "right", active: boolean): string {
  if (!active) return "";
  switch (motionType) {
    case "attackLunge":
      return side === "left"
        ? "attackLunge 0.65s ease-in-out"
        : "attackLungeReverse 0.65s ease-in-out";
    case "chargeConcentration":
      return "chargeConcentration 0.8s ease-out";
    default:
      return "";
  }
}

/** まほう弾 / 反射弾のエフェクトオーバーレイ */
export function MagicBullet({
  side,
  motionType,
  active,
}: {
  side: "left" | "right";
  motionType: MoveMotionType;
  active: boolean;
}) {
  if (!active) return null;
  if (motionType !== "magicBlast" && motionType !== "magicReflect") return null;

  // 弾の移動方向: left側(自身)は右へ、right側(相手)は左へ
  const dx = side === "left" ? 140 : -140;
  const isReflect = motionType === "magicReflect";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: "40%",
        left: side === "left" ? "80%" : "20%",
        zIndex: 15,
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: "radial-gradient(circle, #c4b5fd, #7c3aed 60%, #4c1d95)",
        boxShadow: "0 0 12px 4px #a78bfa88",
        animation: isReflect
          ? `barrierReflect 0.8s ease-in-out`
          : `magicBlast 0.65s ease-in-out forwards`,
        // CSS カスタムプロパティで弾の移動距離を渡す
        ["--blast-dx" as string]: `${dx}px`,
        pointerEvents: "none",
      }}
    />
  );
}

/** バリアの光の壁エフェクトオーバーレイ */
export function BarrierWallEffect({
  side,
  motionType,
  active,
}: {
  side: "left" | "right";
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
        animation: `${animationName} ${duration} ease-out forwards`,
        ["--clash-dx" as string]: `${clashDx}px`,
        zIndex: 12,
        pointerEvents: "none",
      }}
    />
  );
}
