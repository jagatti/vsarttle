import { LIMIT_BREAK_BGM_PATH } from "@/lib/singlePlayLimitBreak";
import type { Stage } from "@/types/game";

export const VS_SCREEN_DURATION_MS = 2500;
export const VS_SCREEN_FADE_OUT_MS = 450;

export type SinglePlayBgmStage =
  | "difficulty_select"
  | "drawing"
  | "char_select"
  | "vs"
  | "battle"
  | "floor_win"
  | "floor_lose"
  | "all_clear"
  | "result_roll";

export function getMultiplayerStageBgm(stage: Stage): string | null {
  if (stage === "drawing") return "/sounds/bgm/oekaki_loop.mp3";
  if (stage === "battle") return "/sounds/bgm/battle_loop.mp3";
  return null;
}

export function getSinglePlayStageBgm(
  stage: SinglePlayBgmStage,
  floor: number,
  bossPhase: 1 | 2,
  limitBreaking: boolean,
  limitBreakUsed: boolean,
): string | null {
  if (stage === "vs") {
    return null;
  }
  if (limitBreaking || limitBreakUsed) {
    return LIMIT_BREAK_BGM_PATH;
  }
  if (stage === "drawing") {
    return "/sounds/bgm/oekaki_loop.mp3";
  }
  if (stage !== "battle") {
    return null;
  }
  if (floor === 3) return "/sounds/bgm/boss3_loop.mp3";
  if (floor === 4) return "/sounds/bgm/boss4_loop.mp3";
  if (floor === 5) {
    return bossPhase === 2 ? "/sounds/bgm/boss5-2_loop.mp3" : "/sounds/bgm/boss5-1_loop.mp3";
  }
  return "/sounds/bgm/battle_loop.mp3";
}
