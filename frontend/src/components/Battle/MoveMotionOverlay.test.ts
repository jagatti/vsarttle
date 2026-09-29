import assert from "node:assert/strict";
import test from "node:test";
import {
  getHitPortraitAnimation,
  getHitPortraitStyle,
  getPortraitAnimation,
  getPortraitMotionStyle,
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
