import type { ActionType } from "@/types/game";
import { actionCategory } from "@/lib/battleLogic";

/**
 * 行動公開バナー用の「相性コメンタリー」。
 *
 * 表示専用のヘルパーであり、戦闘ロジック（resolveTurn）には一切影響しない。
 * resolveTurn が実際に行っている相性判定を、視聴者にも一目で分かる日本語に
 * 言い換えるためだけに存在する。
 */
export type MatchupTone = "win" | "lose" | "clash" | "neutral";

export interface MatchupCommentary {
  /** 大きく出す見出し（例：「こうげき が とおった！」） */
  headline: string;
  /** 見出しの下に出す理由（例：「バリアはこうげきに弱い」） */
  detail: string;
  tone: MatchupTone;
}

export const MATCHUP_TONE_COLORS: Record<MatchupTone, string> = {
  win: "#4ade80",
  lose: "#f87171",
  clash: "#fbbf24",
  neutral: "#cbd5e1",
};

/**
 * 自分の行動と相手の行動から、そのターンの相性結果を説明する。
 * `myAction` 側の視点で win / lose を返す。
 */
export function getMatchupCommentary(myAction: ActionType, enemyAction: ActionType): MatchupCommentary {
  const mine = actionCategory(myAction);
  const theirs = actionCategory(enemyAction);

  if (mine === "paralysis" || theirs === "paralysis") {
    return {
      headline: "まひ！",
      detail: mine === "paralysis" ? "しびれて動けない！" : "あいてがしびれて動けない！",
      tone: mine === "paralysis" ? "lose" : "win",
    };
  }

  if (mine === theirs) {
    if (mine === "barrier") {
      return { headline: "バリアげきとつ！", detail: "おたがいに衝突ダメージ", tone: "clash" };
    }
    if (mine === "charge") {
      return { headline: "そろってチャージ！", detail: "つぎのターンがあぶない…", tone: "clash" };
    }
    return { headline: "あいこ！", detail: "はやさが高いほうが先制", tone: "clash" };
  }

  if (mine === "magic" && theirs === "barrier") {
    return { headline: "はんしゃされた！", detail: "まほうはバリアに弱い", tone: "lose" };
  }
  if (mine === "barrier" && theirs === "magic") {
    return { headline: "まほうをはんしゃ！", detail: "バリアはまほうに強い", tone: "win" };
  }
  if (mine === "attack" && theirs === "barrier") {
    return { headline: "バリアをブチ破った！", detail: "こうげきはバリアに強い", tone: "win" };
  }
  if (mine === "barrier" && theirs === "attack") {
    return { headline: "バリアが割られた！", detail: "バリアはこうげきに弱い", tone: "lose" };
  }
  if (mine === "magic" && theirs === "attack") {
    return { headline: "まほうがとおった！", detail: "まほうはこうげきに強い", tone: "win" };
  }
  if (mine === "attack" && theirs === "magic") {
    return { headline: "まほうにやられた！", detail: "こうげきはまほうに弱い", tone: "lose" };
  }

  if (mine === "charge" && theirs === "barrier") {
    return { headline: "カウンター！", detail: "チャージ中にバリアが突っ込んできた", tone: "lose" };
  }
  if (mine === "barrier" && theirs === "charge") {
    return { headline: "カウンター！", detail: "チャージ中のあいてに体当たり", tone: "win" };
  }
  if (mine === "charge") {
    return { headline: "チャージ！", detail: "回復するが、無防備", tone: "lose" };
  }
  return { headline: "チャンス！", detail: "あいてはチャージ中で無防備", tone: "win" };
}
