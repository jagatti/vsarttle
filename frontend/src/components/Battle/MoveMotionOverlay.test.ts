import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BarrierEffect,
  ImpactEffect,
  OVERCHARGE_MULTIPLIER,
  getHitPortraitAnimation,
  getHitPortraitStyle,
  getImpactKind,
  getPortraitAnimation,
  getPortraitMotionStyle,
  isHeavyImpactKind,
} from "@/components/Battle/MoveMotionOverlay";
import type { MoveMotionType } from "@/components/Battle/battleAnimationPhases";

const motions: Array<[MoveMotionType, string]> = [
  ["attackLunge", "attackLunge"],
  ["magicBlast", "magicCast"],
  ["magicReflect", "magicCast"],
  ["barrierWall", "barrierBrace"],
  ["barrierBreak", "barrierBrace"],
  ["barrierClash", "barrierBrace"],
  ["chargeConcentration", "chargeConcentration"],
  ["barrierBash", "barrierBash"],
];

test("portrait motions ease between poses for both battle sides", () => {
  for (const [motionType, animationName] of motions) {
    for (const side of ["left", "right"] as const) {
      const animation = getPortraitAnimation(motionType, side, true);
      assert.match(animation, new RegExp(`^${animationName} `));
      assert.match(animation, /ease-out/);
    }
  }
});

test("portrait motion direction is expressed by a shared animation's direction variable", () => {
  const left = getPortraitMotionStyle("attackLunge", "left", true);
  const right = getPortraitMotionStyle("attackLunge", "right", true);
  assert.equal(left.animation, right.animation);
  assert.equal(left["--dir"], 1);
  assert.equal(right["--dir"], -1);
  assert.equal(getPortraitMotionStyle("attackLunge", "left", true, 1.5)["--motion-power"], 1.4);
  assert.equal(getPortraitMotionStyle("attackLunge", "left", true)["--motion-power"], 1);
});

test("hit recoil points away from the opponent and scales up for heavy hits", () => {
  const left = getHitPortraitStyle("left", true);
  const right = getHitPortraitStyle("right", true, true);
  assert.match(getHitPortraitAnimation("left", true), /ease-out/);
  assert.equal(left["--dir"], -1);
  assert.equal(right["--dir"], 1);
  assert.equal(left["--hit-distance"], "24px");
  assert.equal(right["--hit-distance"], "44px");
});

test("inactive portrait motion does not return an animation", () => {
  assert.equal(getPortraitAnimation("attackLunge", "left", false), "");
  assert.equal(getHitPortraitAnimation("left", false), "");
});

test("charged, overcharged and strong variants pick the bigger poses", () => {
  assert.match(getPortraitAnimation("attackLunge", "left", true, { charged: true }), /^attackLungeCharged /);
  assert.match(getPortraitAnimation("chargeConcentration", "left", true, { overcharged: true }), /^chargeConcentrationOver /);
  assert.match(getPortraitAnimation("magicBlast", "left", true, { strong: true }), /^magicCastStrong /);
  assert.match(getPortraitMotionStyle("magicBlast", "left", true, 1, "magicStrong").animation, /^magicCastStrong /);
  assert.match(getPortraitMotionStyle("chargeConcentration", "left", true, OVERCHARGE_MULTIPLIER).animation, /^chargeConcentrationOver /);
  assert.match(getPortraitMotionStyle("chargeConcentration", "left", true, 2).animation, /^chargeConcentration /);
  assert.equal(getPortraitAnimation("paralysisStun", "left", true), "");
  assert.match(getHitPortraitAnimation("left", true, true), /^hitRecoilHeavy /);
});

test("every pose and recoil keyframe used by the helpers exists in battle-effects.css", () => {
  const css = readFileSync(new URL("../../app/battle-effects.css", import.meta.url), "utf8");
  const names = new Set<string>();
  const variants = [{}, { charged: true }, { overcharged: true }, { strong: true }];
  for (const [motionType] of motions) {
    for (const options of variants) {
      const animation = getPortraitAnimation(motionType, "left", true, options);
      if (animation) names.add(animation.split(" ")[0]);
    }
  }
  names.add(getHitPortraitAnimation("left", true).split(" ")[0]);
  names.add(getHitPortraitAnimation("left", true, true).split(" ")[0]);
  names.add("paralysisJitter");
  for (const name of names) assert.ok(css.includes(`@keyframes ${name} {`), name);
});

test("impact kinds follow the move that landed", () => {
  const event = (reason: string, chargeMultiplier = 1) => ({ reason, chargeMultiplier });
  assert.equal(getImpactKind(event("こうげき"), { motionType: "attackLunge" }), "attack");
  assert.equal(getImpactKind(event("こうげき", 1.5), { motionType: "attackLunge" }), "attackCharged");
  assert.equal(getImpactKind(event("弱まほう"), { motionType: "magicBlast" }), "magicWeak");
  assert.equal(getImpactKind(event("強まほう"), { motionType: "magicBlast" }), "magicStrong");
  assert.equal(getImpactKind(event("バリア反射"), { motionType: "none" }), "reflect");
  assert.equal(getImpactKind(event("カウンター"), { motionType: "barrierBash" }), "bash");
  assert.equal(getImpactKind(event("こうげき"), { motionType: "none", targetMotionType: "barrierBreak" }), "guard");
  assert.equal(getImpactKind(event("ペインシェア"), { motionType: "none" }), "generic");
  assert.ok(isHeavyImpactKind("attackCharged"));
  assert.ok(isHeavyImpactKind("bash"));
  assert.equal(isHeavyImpactKind("attack"), false);
});

test("impact and barrier effects draw hand-lettered sound words", () => {
  const impact = (kind: Parameters<typeof ImpactEffect>[0]["kind"]) => renderToStaticMarkup(createElement(ImpactEffect, { kind }));
  assert.ok(impact("attack").includes("バシッ!"));
  assert.ok(impact("attackCharged").includes("ドカンッ!!"));
  assert.ok(impact("magicStrong").includes("ドーン!!"));
  assert.ok(impact("bash").includes("ドゴォッ!"));
  assert.equal(impact("guard"), "");
  const barrier = (mode: Parameters<typeof BarrierEffect>[0]["mode"]) => renderToStaticMarkup(createElement(BarrierEffect, { mode }));
  assert.ok(barrier("deploy").includes("キィン!"));
  assert.ok(barrier("break").includes("パリーン!"));
  assert.equal((barrier("break").match(/fx-shard/g) ?? []).length, 8);
  assert.ok(barrier("clash").includes("ガキィン!"));
  assert.equal(barrier("clashTarget").includes("ガキィン!"), false);
});
