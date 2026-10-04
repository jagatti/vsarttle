import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PlayerBattleState, TurnResult } from "@/types/game";
import {
  BattlePanel,
  SELECTABLE_ACTIONS,
  getVoidminationCutInOverlayStyle,
  getVoidminationTooltipEvasionDisplay,
  shouldResetBattlePanelTransientState,
  VOIDMINATION_CUT_IN_DURATION_MS,
} from "@/components/Battle/BattlePanel";

test("selectable actions follow the two-column battle grid order", () => {
  assert.deepEqual(SELECTABLE_ACTIONS, ["attack", "magicWeak", "barrier", "magicStrong", "charge"]);
});

const player: PlayerBattleState = {
  id: "me",
  nickname: "ジャガっち",
  imageDataUrl: "/arttle_boss/stickman.png",
  stats: { hp: 100, maxHp: 100, pp: 100, maxPp: 100, attack: 20, defense: 20, speed: 20, evasion: 0 },
  characterType: "balanced",
  currentHp: 100,
  currentPp: 100,
  chargeMultiplier: 1,
  lastActionCategory: null,
};

function renderBattle(isResolvingTurn = false, limitBreakMode = false, turn = 1, bossActive = false) {
  return renderToStaticMarkup(createElement(BattlePanel, {
    me: player,
    enemy: {
      ...player,
      id: "enemy",
      nickname: "スティックマン",
      voidminationActive: bossActive,
      voidminationSourceFloor: 13,
    },
    role: "host",
    turn,
    turnResult: null,
    limitBreakMode,
    countdown: 30,
    onActionSelect: () => {},
    onRematchSame: () => {},
    onRematchRedraw: () => {},
    isResolvingTurn,
  }));
}

test("limit-break header hides the turn count and announces triple damage", () => {
  const markup = renderBattle(false, true);
  assert.ok(markup.includes("？？？"));
  assert.ok(markup.includes("現在ダメージ3倍中"));
});

test("damage announcements always occupy the same dedicated header region", () => {
  for (const [turn, text] of [
    [12, ""],
    [13, "あと3ターンで常時ダメージ2倍"],
    [14, "あと2ターンで常時ダメージ2倍"],
    [15, "あと1ターンで常時ダメージ2倍"],
    [16, "現在ダメージ2倍中"],
    [18, "あと3ターンで常時ダメージ3倍（現在2倍）"],
    [21, "現在ダメージ3倍中"],
  ] as const) {
    const markup = renderBattle(false, false, turn, true);
    const announcement = markup.match(/<div class="battle-damage-announcement"[^>]*>(.*?)<\/div>/)?.[1];
    assert.equal(announcement, text);
    const header = markup.split('class="battle-header"')[1]?.split("相性表</button>")[0] ?? "";
    assert.ok(header.includes('class="battle-boss-badge-button"'));
    assert.ok(header.includes("ヴォイドミネーション：リバース・ヴェロシティ"));
    assert.ok(header.includes('title="ヴォイドミネーション：リバース・ヴェロシティ"'));
    assert.ok(header.includes('class="doodle-btn battle-matchup-button"'));
  }
});

test("header reserves fixed rows and constrains long battle text", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const rule = (selector: string) => css.split(`${selector} {`)[1]?.split("}")[0] ?? "";
  assert.ok(rule(".battle-header").includes("grid-template-columns: auto minmax(0, 1fr) auto;"));
  assert.ok(rule(".battle-header").includes("grid-template-rows: 36px 18px;"));
  for (const selector of [".battle-boss-badge-button", ".battle-damage-announcement"]) {
    assert.ok(rule(selector).includes("min-width: 0;"), selector);
    assert.ok(rule(selector).includes("text-overflow: ellipsis;"), selector);
    assert.ok(rule(selector).includes("writing-mode: horizontal-tb;"), selector);
  }
  assert.ok(rule(".battle-status-banner").includes("-webkit-line-clamp: 2;"));
  assert.ok(rule(".battle-result-log li").includes("text-overflow: ellipsis;"));
});

test("long names and status banners retain their full text when visually truncated", () => {
  const nickname = "とても長いボスの名前".repeat(10);
  const status = "ヴォイドミネーション：リバース・ヴェロシティが発動中".repeat(10);
  const markup = renderToStaticMarkup(createElement(BattlePanel, {
    me: player,
    enemy: { ...player, id: "enemy", nickname },
    role: "host",
    turn: 14,
    turnResult: {
      turn: 13,
      actions: {},
      damageEvents: [],
      chargeEvents: [],
      magicEffectEvents: [],
      suppressedByTieBanIds: [],
      logs: [],
      nextStates: {},
      winnerId: null,
      voidminationStatusText: status,
    },
    countdown: 30,
    onActionSelect: () => {},
    onRematchSame: () => {},
    onRematchRedraw: () => {},
  }));
  assert.ok(markup.includes(`title="${nickname}"`));
  assert.ok(markup.includes(`class="doodle-frame battle-status-banner" title="${status}"`));
});

test("only the enemy action grid is mirrored, with all five choices retained", () => {
  const markup = renderBattle();
  assert.equal((markup.match(/class="battle-action-grid"/g) ?? []).length, 1);
  assert.equal((markup.match(/class="battle-action-grid battle-action-grid-enemy"/g) ?? []).length, 1);
  for (const action of SELECTABLE_ACTIONS) {
    assert.equal((markup.match(new RegExp(`data-action="${action}"`, "g")) ?? []).length, 2);
  }
});

test("resolving replaces player buttons without removing the fixed layout regions", () => {
  const markup = renderBattle(true);
  for (const region of ["battle-arena", "battle-status-row", "battle-portrait-row", "battle-result-log", "battle-actions", "battle-action-placeholder"]) {
    assert.ok(markup.includes(`class="${region}"`), region);
  }
  assert.equal((markup.match(/data-action=/g) ?? []).length, 5);
  assert.equal((markup.match(/battle-status"/g) ?? []).length, 2);
});

test("enemy CSS mirrors both columns and puts charge below barrier", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const positions = { attack: "1 / 2", magicWeak: "1 / 1", barrier: "2 / 2", magicStrong: "2 / 1", charge: "3 / 2" };
  for (const [action, position] of Object.entries(positions)) {
    const rule = css.split(`.battle-action-grid-enemy [data-action="${action}"] {`)[1]?.split("}")[0];
    assert.ok(rule?.includes(`grid-area: ${position};`), action);
  }
});

test("voidmination cut-in duration is 3900ms", () => {
  assert.equal(VOIDMINATION_CUT_IN_DURATION_MS, 3900);
});

test("voidmination cut-in overlay is constrained to the battle panel", () => {
  const style = getVoidminationCutInOverlayStyle();
  assert.equal(style.position, "absolute");
  assert.equal(style.inset, 0);
  assert.equal(style.backgroundSize, "cover");
  assert.equal(style.backgroundPosition, "center");
});

test("voidmination tooltip evade display is forced to red 0%", () => {
  assert.deepEqual(getVoidminationTooltipEvasionDisplay(0.37, true), {
    color: "#ef4444",
    text: "0%",
  });
});

test("normal tooltip evade display keeps the real rate and existing color", () => {
  assert.deepEqual(getVoidminationTooltipEvasionDisplay(0.126, false), {
    color: "#c4b5fd",
    text: "13%",
  });
});

test("battle panel transient state resets for a fresh rematch battle", () => {
  assert.equal(shouldResetBattlePanelTransientState(1, null, false, false), true);
});

test("battle panel transient state does not reset during an active voidmination battle", () => {
  assert.equal(shouldResetBattlePanelTransientState(1, null, true, false), false);
});

test("battle panel transient state does not reset while turn animation result is present", () => {
  assert.equal(shouldResetBattlePanelTransientState(1, { turn: 1 } as TurnResult, false, false), false);
});

test("enemy with a blank/missing image still renders a visible fallback character", () => {
  for (const imageDataUrl of ["", "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E"]) {
    const markup = renderToStaticMarkup(createElement(BattlePanel, {
      me: player,
      enemy: { ...player, id: "enemy", nickname: "第6層のAnima", imageDataUrl },
      role: "host",
      turn: 1,
      turnResult: null,
      countdown: 30,
      onActionSelect: () => {},
      onRematchSame: () => {},
      onRematchRedraw: () => {},
    }));
    const enemyImg = markup.match(/<img[^>]*alt="第6層のAnima のキャラクター"[^>]*>/)?.[0] ?? "";
    assert.ok(enemyImg.includes('data-fallback="true"'), enemyImg);
    assert.ok(enemyImg.includes("%3Ccircle"), "fallback silhouette should be drawn");
  }
});
