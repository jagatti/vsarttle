import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getBossPortraitKind, getBossPortraitSize, getCooperativePortraitSize, getFinalBossEffect } from "./bossPresentation";
import { FinalBossAuraEffect, MagicBullet } from "./MoveMotionOverlay";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";
import { BattlePanel } from "./BattlePanel";

test("all shipped bosses are enlarged, including both final boss floors", () => {
  for (const name of ["boss1", "boss2", "boss3", "boss4", "boss17", "boss5-1"]) {
    assert.equal(getBossPortraitKind(`/arttle_boss/${name}.png`), "boss");
  }
  for (const floor of [19, 20]) {
    assert.equal(getBossPortraitKind(buildRoguelikeBossState(floor).imageDataUrl), "final");
  }
  assert.equal(getBossPortraitKind(" /arttle_boss/boss5-2.png?v=1 "), "final");
  for (const src of [null, undefined, "", "/arttle_boss/stickman.png", "/arttle_back/boss5-2.png", "data:image/png;base64,boss5-2.png"]) {
    assert.equal(getBossPortraitKind(src), "normal");
  }
});

test("portrait sizes retain viewport and stage caps, and normal sizing is unchanged", () => {
  assert.equal(getBossPortraitSize("normal", false, 64), "max(64px, min(24cqw, 55cqh, 28dvh))");
  assert.equal(getBossPortraitSize("normal", true, 64), "max(64px, min(26cqw, 60cqh, 30dvh))");
  assert.equal(getBossPortraitSize("boss", false, 64), "max(64px, min(30cqw, 64cqh, 34dvh))");
  assert.equal(getBossPortraitSize("boss", true, 64), "max(64px, min(32cqw, 68cqh, 36dvh))");
  assert.equal(getBossPortraitSize("final", false, 64), "max(64px, min(36cqw, 74cqh, 40dvh))");
  assert.equal(getBossPortraitSize("final", true, 64), "max(64px, min(38cqw, 78cqh, 42dvh))");
  assert.equal(getCooperativePortraitSize("normal", false, 64), "max(64px, min(40cqw, 86cqh, 48dvh))");
  assert.equal(getCooperativePortraitSize("normal", true, 64), "max(64px, min(42cqw, 90cqh, 50dvh))");
  assert.equal(getCooperativePortraitSize("boss", false, 64), "max(64px, min(42cqw, 90cqh, 50dvh))");
  assert.equal(getCooperativePortraitSize("final", false, 64), "max(64px, min(44cqw, 92cqh, 52dvh))");
});

test("BattlePanel applies boss sizing without changing normal portraits or fallback images", () => {
  const enemy = buildRoguelikeBossState(20);
  const me = { ...enemy, id: "me", imageDataUrl: "" };
  const markup = renderToStaticMarkup(createElement(BattlePanel, {
    me, enemy, role: "host", turn: 1, turnResult: null, countdown: 30,
    onActionSelect: () => {}, onRematchSame: () => {}, onRematchRedraw: () => {},
  }));
  assert.ok(markup.includes('data-boss-kind="final"'));
  assert.ok(markup.includes('data-boss-kind="normal"'));
  assert.ok(markup.includes(getBossPortraitSize("final", false, 64)));
  assert.ok(markup.includes(getBossPortraitSize("normal", false, 64)));
  assert.ok(markup.includes('data-fallback="true"'));
  assert.equal(markup.includes("final-boss-stage-wash"), false);
});

test("final boss effects follow actual active motion, including reflected strong magic", () => {
  assert.equal(getFinalBossEffect("attackLunge", true), "attack");
  assert.equal(getFinalBossEffect("magicBlast", true, "magicWeak"), "magicWeak");
  assert.equal(getFinalBossEffect("magicBlast", true, "magicStrong"), "magicStrong");
  assert.equal(getFinalBossEffect("magicReflect", true, "magicStrong"), "magicStrong");
  assert.equal(getFinalBossEffect("barrierWall", true), "barrier");
  assert.equal(getFinalBossEffect("barrierClash", true), "barrier");
  assert.equal(getFinalBossEffect("chargeConcentration", true), "charge");
  assert.equal(getFinalBossEffect("barrierBreak", true), null);
  assert.equal(getFinalBossEffect("none", true, "attack"), null);
  assert.equal(getFinalBossEffect("attackLunge", false), null);
});

test("auras are decorative, bounded in particle count, and persist only while charged", () => {
  const render = (effect: Parameters<typeof FinalBossAuraEffect>[0]["effect"], charged = false) =>
    renderToStaticMarkup(createElement(FinalBossAuraEffect, { effect, charged }));
  assert.equal(render(null), "");
  assert.ok(render(null, true).includes('data-effect="charged"'));
  assert.ok(render("magicStrong").includes('aria-hidden="true"'));
  assert.equal((render("magicStrong").match(/<i /g) ?? []).length, 8);
  assert.equal((render("magicWeak").match(/<i /g) ?? []).length, 4);
});

test("final boss magic projectiles scale with the portrait and strong magic is larger", () => {
  const render = (sourceActionType: "magicWeak" | "magicStrong", finalBoss: boolean) =>
    renderToStaticMarkup(createElement(MagicBullet, { side: "right", motionType: "magicBlast", active: true, sourceActionType, finalBoss }));
  assert.ok(render("magicWeak", true).includes("width:22%;height:22%"));
  assert.ok(render("magicStrong", true).includes("width:32%;height:32%"));
  assert.ok(render("magicStrong", true).includes("calc(-1 * min(28cqw, 32dvw))"));
  assert.ok(render("magicWeak", false).includes("width:24px;height:24px"));
});

test("reduced motion disables final boss shake, movement, screen wash and particles", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const reducedMotion = css.split("@media (prefers-reduced-motion: reduce)")[1];
  for (const selector of [".final-boss-impact", ".boss-portrait-idle", '.battle-portrait[data-boss-kind="final"] .portrait-motion-frame', ".final-boss-ring"]) {
    assert.ok(reducedMotion.includes(selector));
  }
  assert.ok(reducedMotion.includes("animation: none !important;"));
  assert.match(reducedMotion, /\.final-boss-stage-wash,\s*\.final-boss-aura i,\s*\.final-boss-magic-bullet\s*\{\s*display: none;/);
});

test("boss battles reserve label clearance and damage pop stays in that clearance", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const clearance = css.split('.battle-portrait-row:has([data-boss-kind="boss"], [data-boss-kind="final"]) {')[1]?.split("}")[0];
  assert.ok(clearance?.includes("padding-top: clamp(96px, 12dvh, 112px) !important;"));
  const damagePop = css.split("@keyframes bossDamageStickerPop {")[1]?.split("\n}")[0];
  assert.ok(damagePop?.includes("scale(1.12)"));
  assert.equal(damagePop?.includes("translateY"), false);
  const panel = readFileSync(new URL("./BattlePanel.tsx", import.meta.url), "utf8");
  assert.ok(panel.includes('portraitKind === "normal" ? "damageStickerPop" : "bossDamageStickerPop"'));
});
