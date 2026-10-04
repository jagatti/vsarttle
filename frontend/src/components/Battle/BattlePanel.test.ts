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

function renderBattle(isResolvingTurn = false) {
  return renderToStaticMarkup(createElement(BattlePanel, {
    me: player,
    enemy: { ...player, id: "enemy", nickname: "スティックマン" },
    role: "host",
    turn: 1,
    turnResult: null,
    countdown: 30,
    onActionSelect: () => {},
    onRematchSame: () => {},
    onRematchRedraw: () => {},
    isResolvingTurn,
  }));
}

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
