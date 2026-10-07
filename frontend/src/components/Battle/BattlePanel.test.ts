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
  getTurnPhaseDurationMs,
  TURN_ANIMATION_SETTLE_MS,
  TURN_PHASE_INTERVAL_MS,
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

function renderBattle(isResolvingTurn = false, limitBreakMode = false, turn = 1, bossActive = false, skillLabels?: string[], turnResult: TurnResult | null = null) {
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
    turnResult,
    limitBreakMode,
    countdown: 30,
    onActionSelect: () => {},
    onRematchSame: () => {},
    onRematchRedraw: () => {},
    isResolvingTurn,
    roguelikeSkillLabels: skillLabels,
  }));
}

test("damage log separates pursuit damage and omits pursuit for inactive or blocked hits", () => {
  const result: TurnResult = {
    turn: 2, actions: { me: "attack", enemy: "paralysis" },
    damageEvents: [{ from: "me", to: "enemy", amount: 125, pursuitDamage: 50, avoided: false, reason: "こうげき", chargeMultiplier: 1 }],
    chargeEvents: [], magicEffectEvents: [], suppressedByTieBanIds: [], logs: [],
    nextStates: {}, winnerId: null,
  };
  const markup = renderBattle(false, false, 2, false, undefined, result);
  assert.ok(markup.includes("スティックマン に 75 ダメージ（こうげき）"));
  assert.ok(markup.includes("追撃！50ダメージ！"));
  assert.ok(!markup.includes("125 ダメージ"));
  for (const event of [
    { ...result.damageEvents[0], amount: 75, pursuitDamage: undefined },
    { ...result.damageEvents[0], amount: 0, pursuitDamage: undefined },
    { ...result.damageEvents[0], amount: 0, pursuitDamage: undefined, avoided: true },
  ]) {
    assert.ok(!renderBattle(false, false, 2, false, undefined, { ...result, damageEvents: [event] }).includes("追撃"));
  }
});

test("roguelike skills appear only below the player's name and above HP with wrapping", () => {
  const markup = renderBattle(false, false, 1, false, ["こうげき耐性 x2", "追撃", "根性x0"]);
  assert.equal((markup.match(/aria-label="獲得スキル"/g) ?? []).length, 1);
  const start = markup.indexOf('aria-label="獲得スキル"');
  assert.ok(start > markup.indexOf("ジャガっち"));
  assert.ok(start < markup.indexOf("HP 100%"));
  assert.ok(markup.includes("flex-wrap:wrap"));
  assert.ok(markup.includes("overflow-wrap:anywhere"));
  for (const label of ["こうげき耐性 x2", "追撃", "根性x0"]) assert.ok(markup.includes(label));
  assert.ok(!renderBattle().includes('aria-label="獲得スキル"'));
  assert.ok(!renderBattle(false, false, 1, false, []).includes('aria-label="獲得スキル"'));
});

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

const partner: PlayerBattleState = {
  ...player,
  id: "partner",
  nickname: "なかま",
  currentHp: 37,
  currentPp: 19,
};

function renderCooperative(
  activeId = player.id,
  switching = false,
  standby = partner,
  turnResult: TurnResult | null = null,
  presentation: Pick<Parameters<typeof BattlePanel>[0], "roguelikeSkillLabels" | "roguelikeWeakMagicTooltipTitle"> = {},
  chargeMultiplier = 1,
) {
  return renderToStaticMarkup(createElement(BattlePanel, {
    me: activeId === player.id ? player : standby,
    enemy: { ...player, id: "enemy", nickname: "ボス" },
    role: "host",
    cooperativePlayers: [player, standby],
    cooperativeActivePlayerId: activeId,
    cooperativeSwitching: switching,
    cooperativeChargeMultiplier: chargeMultiplier,
    turn: 1,
    turnResult,
    countdown: 30,
    onActionSelect: () => {},
    onRematchSame: () => {},
    onRematchRedraw: () => {},
    ...presentation,
  }));
}

test("cooperative stage retains both allies' name, HP and PP frames", () => {
  const markup = renderCooperative();
  assert.equal((markup.match(/class="doodle-frame battle-status"/g) ?? []).length, 2);
  assert.ok(markup.includes('aria-label="味方のステータス"'));
  assert.ok(markup.includes("なかま"));
  assert.ok(markup.includes('class="cooperative-standby-status"'));
  assert.ok(markup.includes('class="cooperative-standby-name" title="なかま"'));
  assert.ok(!markup.includes("19/100"));
  assert.equal((markup.match(/class="battle-cooperative-sprite"/g) ?? []).length, 2);
});

test("shared charge aura stages appear on both living allies and disappear for a fallen ally", () => {
  const charged = renderCooperative(player.id, false, partner, null, {}, 1.5);
  assert.equal((charged.match(/data-charge-aura-stage="charged"/g) ?? []).length, 2);
  const overcharged = renderCooperative(player.id, false, partner, null, {}, 2.25);
  assert.equal((overcharged.match(/data-charge-aura-stage="overcharged"/g) ?? []).length, 2);
  const fallen = renderCooperative(player.id, false, { ...partner, currentHp: 0 }, null, {}, 2.25);
  assert.ok(fallen.includes('data-player-id="partner" data-active="false" data-defeated="true" data-charge-aura-stage="none"'));
});

test("cooperative switching changes roles without changing player-keyed sprite order", () => {
  for (const active of [player.id, partner.id]) {
    const markup = renderCooperative(active);
    const sprites = [...markup.matchAll(/class="battle-cooperative-sprite" data-player-id="([^"]+)" data-active="([^"]+)" data-defeated="([^"]+)"/g)];
    assert.deepEqual(sprites.map((sprite) => sprite[1]), [player.id, partner.id]);
    assert.deepEqual(sprites.map((sprite) => sprite[2]), [String(active === player.id), String(active === partner.id)]);
  }
  const source = readFileSync(new URL("./BattlePanel.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('key={player.id}\n                    className="battle-cooperative-sprite"'));
});

test("cooperative status cards keep the active full frame above a compact persistent standby row", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const rule = (selector: string) => css.split(`${selector} {`)[1]?.split("}")[0] ?? "";
  assert.ok(rule(".battle-cooperative-status-stack").includes("grid-template-rows: auto auto;"));
  assert.ok(rule('.battle-cooperative-status-card[data-active="true"]').includes("grid-row: 1;"));
  assert.ok(rule('.battle-cooperative-status-card[data-active="false"]').includes("width: 38%;"));
  assert.ok(rule(".battle-cooperative-status-card").includes("720ms cubic-bezier(0.16, 1.15, 0.3, 1)"));
  assert.ok(!rule(".battle-cooperative-status-card").includes("order:"));
  const deadRule = rule('.battle-cooperative-status-card[data-defeated="true"]');
  assert.ok(deadRule.includes("grid-row: 2;"));
  assert.ok(deadRule.includes("transition: none;"));
  const mobileRules = css.split("@media (max-width: 600px) {")[1] ?? "";
  assert.ok(mobileRules.includes("--cooperative-card-offset: 0px;"));
  const reducedMotion = css.split("@media (prefers-reduced-motion: reduce)")[1] ?? "";
  assert.ok(reducedMotion.includes(".battle-cooperative-sprite,\n  .battle-cooperative-status-card {\n    transition: none;"));
});

test("cooperative active card retains personal skill labels and weak-magic tooltip", () => {
  for (const active of [player.id, partner.id]) {
    const markup = renderCooperative(active, false, partner, null, {
      roguelikeSkillLabels: ["追撃", "根性"],
      roguelikeWeakMagicTooltipTitle: "獲得した弱まほう",
    });
    const cards = markup.split('class="battle-cooperative-status-card"').slice(1);
    assert.equal(cards.length, 2);
    const activeCard = cards.find((card) => card.startsWith(` data-player-id="${active}"`)) ?? "";
    assert.ok(activeCard.includes('aria-label="獲得スキル"'));
    assert.ok(activeCard.includes('title="獲得した弱まほう"'));
    assert.equal((markup.match(/aria-label="獲得スキル"/g) ?? []).length, 1);
  }
});

test("cooperative status HUD shares the safe header middle with the boss badge", () => {
  const label = "第13層 / 合計20ターン / チャージ3回";
  const markup = renderToStaticMarkup(createElement(BattlePanel, {
    me: player,
    enemy: { ...partner, id: "enemy", voidminationActive: true, voidminationSourceFloor: 13 },
    role: "host",
    cooperativePlayers: [player, partner],
    cooperativeStatusLabel: label,
    turn: 2,
    turnResult: null,
    countdown: 30,
    onActionSelect: () => {},
    onRematchSame: () => {},
    onRematchRedraw: () => {},
  }));
  const middle = markup.split('class="battle-header-middle"')[1]?.split('class="doodle-btn battle-matchup-button"')[0] ?? "";
  assert.ok(middle.includes(`class="battle-cooperative-status-label" role="status" title="${label}"`));
  assert.ok(middle.includes('class="battle-boss-badge-button"'));
  assert.ok(middle.includes("ヴォイドミネーション：リバース・ヴェロシティ"));
  assert.ok(!renderCooperative().includes('class="battle-cooperative-status-label"'));
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const rule = css.split(".battle-header-middle {")[1]?.split("}")[0] ?? "";
  assert.ok(rule.includes("grid-column: 2;"));
  assert.ok(rule.includes("grid-row: 1;"));
  assert.ok(rule.includes("min-width: 0;"));
  assert.ok(!rule.includes("position: absolute"));
});

test("cooperative switching suppresses action input independently of resolving", () => {
  const markup = renderCooperative(player.id, true);
  assert.ok(markup.includes('class="battle-action-placeholder"'));
  assert.equal((markup.match(/data-action=/g) ?? []).length, 5);
  assert.equal((renderCooperative().match(/data-action=/g) ?? []).length, 10);
});

test("cooperative damage log keeps the original target name after the active ally switches", () => {
  const result: TurnResult = {
    turn: 1,
    actions: { me: "attack", enemy: "attack" },
    damageEvents: [{ from: "enemy", to: "me", amount: 20, avoided: false, reason: "こうげき", chargeMultiplier: 1 }],
    chargeEvents: [],
    magicEffectEvents: [],
    suppressedByTieBanIds: [],
    logs: [],
    nextStates: {},
    winnerId: null,
  };
  const markup = renderCooperative(partner.id, false, partner, result);
  assert.ok(markup.includes("ジャガっち に 20 ダメージ"));
  assert.ok(!markup.includes("ボス に 20 ダメージ"));
});

test("fallen ally is marked grey/fixed left while mobile hides standby sprites", () => {
  const markup = renderCooperative(player.id, false, { ...partner, currentHp: 0 });
  assert.ok(markup.includes('class="battle-cooperative-sprite" data-player-id="partner" data-active="false" data-defeated="true"'));
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const deadRule = css.split('.battle-cooperative-sprite[data-defeated="true"] {')[1]?.split("}")[0] ?? "";
  assert.ok(deadRule.includes("left: 20%;"));
  assert.ok(deadRule.includes("transition: none;"));
  assert.ok(deadRule.includes("filter: grayscale(1);"));
  assert.ok(css.includes("transition: left 720ms cubic-bezier(0.16, 1.15, 0.3, 1), transform 720ms cubic-bezier(0.16, 1.15, 0.3, 1)"));
  const mobileRules = css.split("@media (max-width: 600px) {")[1] ?? "";
  assert.ok(mobileRules.includes(".battle-cooperative-sprite {\n    left: 50%;\n    opacity: 0;"));
  assert.ok(mobileRules.includes('.battle-cooperative-sprite[data-active="true"] {\n    opacity: 1;'));
  assert.ok(mobileRules.includes(".battle-panel-card-cooperative .battle-cooperative-sprite img"));
});

test("lethal result does not pin the active ally left before its animation completes", () => {
  const fallenPartner = { ...partner, currentHp: 0 };
  const result: TurnResult = {
    turn: 1,
    actions: { partner: "attack", enemy: "attack" },
    damageEvents: [{ from: "enemy", to: "partner", amount: 37, avoided: false, reason: "こうげき", chargeMultiplier: 1 }],
    chargeEvents: [],
    magicEffectEvents: [],
    suppressedByTieBanIds: [],
    logs: [],
    nextStates: { partner: fallenPartner },
    winnerId: null,
  };
  const pendingMarkup = renderCooperative(partner.id, false, fallenPartner, result);
  assert.ok(pendingMarkup.includes('class="battle-cooperative-sprite" data-player-id="partner" data-active="true" data-defeated="false"'));
  assert.ok(pendingMarkup.includes('class="battle-cooperative-status-card" data-player-id="partner" data-active="true" data-defeated="false"'));
  const finishedMarkup = renderCooperative(partner.id, false, fallenPartner);
  assert.ok(finishedMarkup.includes('class="battle-cooperative-sprite" data-player-id="partner" data-active="true" data-defeated="true"'));
  assert.ok(finishedMarkup.includes('class="battle-cooperative-status-card" data-player-id="partner" data-active="true" data-defeated="true"'));
});

test("turn completion budgets cover every phase and final gauge/effect tails, even with zero phases", () => {
  assert.equal(TURN_PHASE_INTERVAL_MS, 850);
  assert.equal(getTurnPhaseDurationMs(0), 850);
  assert.equal(getTurnPhaseDurationMs(2), 1700);
  assert.equal(getTurnPhaseDurationMs(5), 4250);
  assert.ok(TURN_ANIMATION_SETTLE_MS >= 350 + 900, "delayed HP ghost bar");
  assert.ok(TURN_ANIMATION_SETTLE_MS >= 1500, "damage floater lifetime");
  assert.ok(TURN_ANIMATION_SETTLE_MS >= 1800, "portrait filter transition");
});
