import type { MoveMotionType } from "./battleAnimationPhases";
import type { ActionType } from "@/types/game";

export type BossPortraitKind = "normal" | "boss" | "final";

export function getBossPortraitKind(imageUrl: string | null | undefined): BossPortraitKind {
  const path = imageUrl?.trim().split(/[?#]/)[0];
  if (path === "/arttle_boss/boss5-2.png") return "final";
  return /^\/arttle_boss\/boss(?:1|2|3|4|17|5-1)\.png$/.test(path ?? "") ? "boss" : "normal";
}

export function getBossPortraitSize(kind: BossPortraitKind, charged: boolean, minimum: number): string {
  const limits = kind === "final"
    ? charged ? "38cqw, 78cqh, 42dvh" : "36cqw, 74cqh, 40dvh"
    : kind === "boss"
      ? charged ? "32cqw, 68cqh, 36dvh" : "30cqw, 64cqh, 34dvh"
      : charged ? "26cqw, 60cqh, 30dvh" : "24cqw, 55cqh, 28dvh";
  return `max(${minimum}px, min(${limits}))`;
}

export function getCooperativePortraitSize(kind: BossPortraitKind, charged: boolean, minimum: number): string {
  const limits = kind === "final"
    ? charged ? "46cqw, 94cqh, 54dvh" : "44cqw, 92cqh, 52dvh"
    : kind === "boss"
      ? charged ? "44cqw, 92cqh, 52dvh" : "42cqw, 90cqh, 50dvh"
      : charged ? "42cqw, 90cqh, 50dvh" : "40cqw, 86cqh, 48dvh";
  return `max(${minimum}px, min(${limits}))`;
}

export function getFinalBossEffect(
  motion: MoveMotionType,
  active: boolean,
  action?: ActionType,
): "attack" | "magicWeak" | "magicStrong" | "barrier" | "charge" | null {
  if (!active) return null;
  switch (motion) {
    case "attackLunge": return "attack";
    case "magicBlast":
    case "magicReflect": return action === "magicStrong" ? "magicStrong" : "magicWeak";
    case "barrierWall":
    case "barrierClash": return "barrier";
    case "chargeConcentration": return "charge";
    default: return null;
  }
}
