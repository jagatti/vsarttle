import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DrawingSlot } from "@/lib/drawingSlots";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { TitleDoodleStage } from "./TitleDoodleStage";
import { encounterSteps, idleStep, reactionStep, restDuration, restingPoses, selectTitleDoodles } from "./doodleBehavior";

function slot(color: string): DrawingSlot {
  return {
    thumbnail: "data:image/jpeg;base64,thumbnail-not-used",
    drawingData: {
      version: 1,
      canvas: { width: 240, height: 120 },
      layers: [{
        id: "base", name: "base",
        strokes: [{
          id: "pen", tool: "pen", color, size: 4.5,
          points: [{ x: 20.5, y: 10, t: 0 }, { x: 100, y: 110, t: 1 }],
        }],
      }],
    },
  };
}

test("title selects zero, one or two saved transparent images without changing the drawing", () => {
  assert.deepEqual(selectTitleDoodles([null, null, null]), []);
  const saved = slot("#123456");
  const before = structuredClone(saved);
  const images = selectTitleDoodles([null, saved, null]);
  assert.deepEqual(images, [drawingToDataUrl(saved.drawingData)]);
  assert.deepEqual(saved, before);
  const svg = decodeURIComponent(images[0].split(",")[1]);
  assert.match(svg, /viewBox="0 0 240 120"/);
  assert.match(svg, /stroke-width="4.5"/);
  assert.match(svg, /20.5,10/);
  assert.doesNotMatch(svg, /<rect|image\/jpeg/);
});

test("random selection can include every slot and does not duplicate a slot", () => {
  const slots = [slot("#111111"), slot("#222222"), slot("#333333")];
  const original = slots.map((saved) => drawingToDataUrl(saved.drawingData));
  assert.deepEqual(selectTitleDoodles(slots, () => 0.999), original.slice(0, 2));
  const shuffled = selectTitleDoodles(slots, () => 0);
  assert.deepEqual(shuffled, [original[1], original[2]]);
  assert.equal(new Set(shuffled).size, 2);
});

test("blank and malformed saved data are skipped instead of adding a fixed character", () => {
  const blank = slot("#123456");
  blank.drawingData.layers = [];
  const malformed = { drawingData: {}, thumbnail: "" } as DrawingSlot;
  assert.deepEqual(selectTitleDoodles([blank, malformed, null]), []);
  assert.equal(selectTitleDoodles([malformed, slot("#123456"), blank]).length, 1);
});

test("idle motion is brief, usually subtle and followed by a longer randomized rest", () => {
  assert.equal(restDuration(() => 0), 4000);
  assert.equal(restDuration(() => 0.999), 8995);
  const poses = restingPoses(2);
  const gentle = idleStep(poses, () => 0.5);
  assert.equal(gentle.poses[0].action, "rest");
  assert.equal(gentle.poses[1].action, "sway");
  assert.ok(gentle.duration < restDuration(() => 0));
  const event = idleStep(poses, () => 0);
  assert.equal(event.poses[0].action, "walk");
  assert.equal(event.poses[0].facing, -1);
  assert.deepEqual(poses, restingPoses(2));
  const actions = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const values = [0, 0.1, (i + 0.5) / 7, 0.5];
    actions.add(idleStep(restingPoses(1), () => values.shift()!).poses[0].action);
  }
  assert.deepEqual(actions, new Set(["walk", "look", "hop", "retreat", "tilt", "attack", "magic"]));
});

test("encounters look in turn, approach gently, react, pause and return without crossing the center", () => {
  for (const actor of [0, 1]) {
    for (const surprised of [false, true]) {
      const steps = encounterSteps(surprised, actor);
      assert.equal(steps[0].poses[actor].action, "look");
      assert.equal(steps[1].poses[1 - actor].action, "look");
      assert.equal(steps[2].poses[actor].action, "walk");
      assert.equal(steps[3].poses[1 - actor].action, surprised ? "retreat" : "hop");
      assert.equal(steps[4].poses[actor].offset, steps[2].poses[actor].offset);
      assert.ok(steps[4].poses.every((pose) => pose.action === "rest"));
      assert.ok(steps[5].poses.every((pose) => pose.offset === 0));
      assert.ok(steps.every((step) => step.poses.every((pose) => Math.abs(pose.offset ?? 0) <= 8)));
    }
  }
});

test("menu reactions work with one or two doodles and do not replace their images", () => {
  for (const count of [1, 2]) {
    assert.ok(reactionStep(count, "single").poses.every((pose) => pose.action === "attack"));
    assert.deepEqual(reactionStep(count, "multi").poses, restingPoses(count).map((pose) => ({ ...pose, action: "look" })));
    assert.ok(reactionStep(count, "profile").poses.every((pose) => pose.action === "look" && pose.facing === 1));
  }
});

test("stage stays decorative, frameless and separated from the menu with bounded edge lanes", () => {
  const html = renderToStaticMarkup(createElement(TitleDoodleStage, {
    images: [drawingToDataUrl(slot("#123456").drawingData)], reaction: null, paused: false,
  }));
  assert.match(html, /aria-hidden="true"/);
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.match(html, /alt=""/);
  assert.doesNotMatch(html, /<button|<svg|tabindex/);
  const empty = renderToStaticMarkup(createElement(TitleDoodleStage, { images: [], reaction: null, paused: false }));
  assert.doesNotMatch(empty, /<img|title-doodle-shadow/);
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.title-screen-with-doodles \{[^}]*padding-bottom: calc\(var\(--doodle-size\) \+ 18px\)/);
  assert.match(css, /\.title-doodle-stage \{[^}]*z-index: 0;[^}]*pointer-events: none;/);
  assert.match(css, /\.title-doodle-lane \{[^}]*width: 30%;[^}]*overflow: hidden;/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 500px\) \{[\s\S]*?\.title-screen-with-doodles \{[^}]*padding-bottom: calc\(var\(--doodle-size\) \+ 18px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.title-doodle-motion,[^}]*animation: none !important;/);
  assert.doesNotMatch(css, /title-saved-doodle|titleSavedDoodleBreathe/);
});
